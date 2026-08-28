import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import * as ort from 'onnxruntime-node';
import {
  D5_PIPELINE_AUTHORITY,
  D5_PIPELINE_COMPOSED_PARITY_POLICY,
  D5_PIPELINE_GUIDANCE_SCALE,
  D5_PIPELINE_NATIVE_ORT_VERSION,
  D5_PIPELINE_PROMPT_CASE,
  D5_PIPELINE_SEED,
  D5_PIPELINE_SELECTED_SCHEME,
  D5_PIPELINE_STEP_COUNT,
} from './tiny-sd-d5-pipeline-constants.mjs';
import { TinySdDpmSolverMultistep } from './tiny-sd-d5-dpm-solver.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument pair at ${key ?? '<missing>'}`);
  args.set(key.slice(2), value);
}
const required = name => {
  const value = args.get(name);
  if (!value) throw new Error(`--${name} is required`);
  return path.resolve(value);
};

const modelDir = required('model-dir');
const quantReportPath = required('quant-report');
const controlReferencePath = required('control-reference');
const pipelineControlPath = required('pipeline-control');
const fixtureDir = required('fixture-dir');
const reportPath = required('report');
const COMPONENTS = ['text_encoder', 'unet', 'vae_decoder'];
const EXPECTED_IO = Object.freeze({
  text_encoder: { inputs: [{ name: 'input_ids', dtype: 'INT64', shape: [1, 77] }, { name: 'attention_mask', dtype: 'INT64', shape: [1, 77] }], outputs: [{ name: 'last_hidden_state', dtype: 'FLOAT', shape: [1, 77, 768] }] },
  unet: { inputs: [{ name: 'sample', dtype: 'FLOAT', shape: [1, 4, 64, 64] }, { name: 'timestep', dtype: 'INT64', shape: [1] }, { name: 'encoder_hidden_states', dtype: 'FLOAT', shape: [1, 77, 768] }], outputs: [{ name: 'noise_prediction', dtype: 'FLOAT', shape: [1, 4, 64, 64] }] },
  vae_decoder: { inputs: [{ name: 'stable_diffusion_latent', dtype: 'FLOAT', shape: [1, 4, 64, 64] }], outputs: [{ name: 'decoded_rgb', dtype: 'FLOAT', shape: [1, 3, 512, 512] }] },
});
const LATENT_SHAPE = [1, 4, 64, 64];
const LATENT_ELEMENTS = LATENT_SHAPE.reduce((a, b) => a * b, 1);
const TEXT_SHAPE = [1, 77, 768];
const DECODED_SHAPE = [1, 3, 512, 512];

const shaBytes = bytes => createHash('sha256').update(bytes).digest('hex');
const shaFloat32 = values => shaBytes(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
const shaFile = async file => shaBytes(await fs.readFile(file));
const finiteStats = values => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  let sum = 0;
  let sumSq = 0;
  for (let index = 0; index < values.length; index++) {
    const value = Number(values[index]);
    if (!Number.isFinite(value)) throw new Error(`non-finite tensor value at ${index}`);
    min = Math.min(min, value);
    max = Math.max(max, value);
    sum += value;
    sumSq += value * value;
  }
  return { elements: values.length, min, max, mean: sum / values.length, rms: Math.sqrt(sumSq / values.length) };
};
const sameShape = (actual, expected, label) => assert.deepEqual(Array.from(actual), expected, `${label} shape drift`);
const f32 = Math.fround;

const normalizeSchedulerConfig = raw => ({
  ...raw,
  lambda_min_clipped: raw.lambda_min_clipped === '-Infinity' ? Number.NEGATIVE_INFINITY : raw.lambda_min_clipped,
});

const gaussianLatent = seed => {
  let state = seed >>> 0;
  const uniform = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const value = (state >>> 0) / 0x100000000;
    return value === 0 ? 1 / 0x100000000 : value;
  };
  const out = new Float32Array(LATENT_ELEMENTS);
  let spare = null;
  for (let index = 0; index < out.length; index++) {
    if (spare !== null) {
      out[index] = f32(spare);
      spare = null;
      continue;
    }
    const u1 = uniform();
    const u2 = uniform();
    const radius = Math.sqrt(-2 * Math.log(u1));
    const angle = 2 * Math.PI * u2;
    out[index] = f32(radius * Math.cos(angle));
    spare = radius * Math.sin(angle);
  }
  return out;
};

const int64Tensor = values => new ort.Tensor('int64', BigInt64Array.from(values, value => BigInt(value)), [1, values.length]);
const maskTensor = values => new ort.Tensor('int64', BigInt64Array.from(values, value => BigInt(value)), [1, values.length]);
const floatTensor = (values, dims) => new ort.Tensor('float32', values, dims);
const timestepTensor = timestep => new ort.Tensor('int64', BigInt64Array.of(BigInt(timestep)), [1]);

const runOutput = async (session, feeds, outputName, expectedShape, label) => {
  const started = performance.now();
  const outputs = await session.run(feeds, [outputName]);
  const elapsedMs = performance.now() - started;
  const tensor = outputs[outputName];
  if (!tensor) throw new Error(`${label} missing output ${outputName}`);
  sameShape(tensor.dims, expectedShape, `${label}/${outputName}`);
  const data = tensor.data instanceof Float32Array ? tensor.data : Float32Array.from(tensor.data, Number);
  finiteStats(data);
  return { data: new Float32Array(data), elapsedMs };
};

const cfg = (unconditional, conditional) => {
  assert.equal(unconditional.length, conditional.length, 'CFG length mismatch');
  const out = new Float32Array(unconditional.length);
  for (let index = 0; index < out.length; index++) {
    out[index] = f32(unconditional[index] + f32(D5_PIPELINE_GUIDANCE_SCALE * f32(conditional[index] - unconditional[index])));
  }
  return out;
};

const loadSession = async modelPath => {
  const started = performance.now();
  const session = await ort.InferenceSession.create(modelPath, {
    executionProviders: ['cpu'],
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
    graphOptimizationLevel: 'all',
  });
  return { session, createMs: performance.now() - started };
};

const writeStage = async (name, data, dims, stageFiles) => {
  const fileName = `${name}.f32`;
  const file = path.join(fixtureDir, fileName);
  await fs.writeFile(file, Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  stageFiles[name] = {
    path: fileName,
    dtype: 'float32',
    shape: dims,
    bytes: data.byteLength,
    sha256: shaFloat32(data),
    stats: finiteStats(data),
  };
};

const quantBytes = await fs.readFile(quantReportPath);
const quant = JSON.parse(quantBytes.toString('utf8'));
const controlBytes = await fs.readFile(controlReferencePath);
const control = JSON.parse(controlBytes.toString('utf8'));
const pipelineControlBytes = await fs.readFile(pipelineControlPath);
const pipelineControl = JSON.parse(pipelineControlBytes.toString('utf8'));
assert.equal(control.stage, 'D5_CONTROL_SEMANTICS_REFERENCE');
assert.equal(control.authority, D5_PIPELINE_AUTHORITY);
assert.equal(control.runtimeAuthorityGranted, false);
assert.equal(control.productionApproval, false);
assert.equal(pipelineControl.stage, 'D5_PIPELINE_HISTORICAL_RUNTIME_CONTROL');
assert.equal(pipelineControl.authority, D5_PIPELINE_AUTHORITY);
assert.equal(pipelineControl.controlReferenceSha256, shaBytes(controlBytes));
assert.equal(pipelineControl.initialLatentScalingPolicy, 'SEEDED_GAUSSIAN_FLOAT32_MULTIPLIED_BY_HISTORICAL_INIT_NOISE_SIGMA');
assert.ok(Number.isFinite(pipelineControl.initialNoiseSigma) && pipelineControl.initialNoiseSigma > 0);
assert.equal(quant.stage, 'D3_WASM_COMPACT_PREPARATION');
assert.equal(quant.status, 'CANDIDATE');
assert.deepEqual(Object.keys(quant.components).sort(), [...COMPONENTS].sort());

const modelEvidence = {};
for (const component of COMPONENTS) {
  const record = quant.components[component];
  assert.equal(record.result, 'WASM_COMPACT_NATIVE_PASS', `${component} selected D3 candidate unavailable`);
  assert.equal(record.transform.scheme, D5_PIPELINE_SELECTED_SCHEME, `${component} D3 scheme drift`);
  assert.equal(record.nativeOrtParity.passed, true, `${component} D3 native parity not accepted`);
  assert.deepEqual(record.candidate.graph.ioContract, EXPECTED_IO[component], `${component} D3 I/O contract drift`);
  const file = path.join(modelDir, `${component}.onnx`);
  const stat = await fs.stat(file);
  assert.equal(stat.size, record.candidate.size, `${component} candidate size mismatch`);
  assert.equal(await shaFile(file), record.candidate.sha256, `${component} candidate SHA mismatch`);
  modelEvidence[component] = {
    sha256: record.candidate.sha256,
    bytes: record.candidate.size,
    scheme: record.transform.scheme,
    d3Thresholds: record.nativeOrtParity.thresholds,
  };
}

const promptCase = control.tokenizer.cases[D5_PIPELINE_PROMPT_CASE];
const emptyCase = control.tokenizer.cases.empty;
if (!promptCase || !emptyCase) throw new Error('required D5 tokenizer cases missing');
const schedulerConfig = normalizeSchedulerConfig(control.schedulerConfig);
await fs.mkdir(fixtureDir, { recursive: true });

const execute = async writeFixtures => {
  const stages = {};
  const latency = { sessionCreateMs: {}, textEncoderMs: 0, unetMs: [], vaeMs: 0 };

  let conditional;
  let unconditional;
  {
    const loaded = await loadSession(path.join(modelDir, 'text_encoder.onnx'));
    latency.sessionCreateMs.text_encoder = loaded.createMs;
    try {
      const conditionalResult = await runOutput(loaded.session, {
        input_ids: int64Tensor(promptCase.inputIds),
        attention_mask: maskTensor(promptCase.attentionMask),
      }, 'last_hidden_state', TEXT_SHAPE, 'conditional text encoder');
      const unconditionalResult = await runOutput(loaded.session, {
        input_ids: int64Tensor(emptyCase.inputIds),
        attention_mask: maskTensor(emptyCase.attentionMask),
      }, 'last_hidden_state', TEXT_SHAPE, 'unconditional text encoder');
      latency.textEncoderMs = conditionalResult.elapsedMs + unconditionalResult.elapsedMs;
      conditional = conditionalResult.data;
      unconditional = unconditionalResult.data;
      stages.conditional_embedding = conditional;
      stages.unconditional_embedding = unconditional;
    } finally {
      await loaded.session.release();
    }
  }

  const scheduler = new TinySdDpmSolverMultistep(schedulerConfig);
  const timesteps = scheduler.setTimesteps(D5_PIPELINE_STEP_COUNT);
  if (timesteps.length !== D5_PIPELINE_STEP_COUNT) throw new Error(`D5 pipeline timestep count drift: ${timesteps.length}`);
  let latent = gaussianLatent(D5_PIPELINE_SEED);
  for (let index = 0; index < latent.length; index++) latent[index] = f32(latent[index] * pipelineControl.initialNoiseSigma);
  finiteStats(latent);
  stages.initial_latent = new Float32Array(latent);
  const schedulerOrders = [];
  {
    const loaded = await loadSession(path.join(modelDir, 'unet.onnx'));
    latency.sessionCreateMs.unet = loaded.createMs;
    try {
      for (let index = 0; index < timesteps.length; index++) {
        const timestep = timesteps[index];
        const scaled = scheduler.scaleModelInput(latent);
        const unconditionalNoise = await runOutput(loaded.session, {
          sample: floatTensor(scaled, LATENT_SHAPE),
          timestep: timestepTensor(timestep),
          encoder_hidden_states: floatTensor(unconditional, TEXT_SHAPE),
        }, 'noise_prediction', LATENT_SHAPE, `UNet unconditional ${index}`);
        const conditionalNoise = await runOutput(loaded.session, {
          sample: floatTensor(scaled, LATENT_SHAPE),
          timestep: timestepTensor(timestep),
          encoder_hidden_states: floatTensor(conditional, TEXT_SHAPE),
        }, 'noise_prediction', LATENT_SHAPE, `UNet conditional ${index}`);
        latency.unetMs.push(unconditionalNoise.elapsedMs + conditionalNoise.elapsedMs);
        const guided = cfg(unconditionalNoise.data, conditionalNoise.data);
        finiteStats(guided);
        const step = scheduler.step(guided, timestep, latent);
        schedulerOrders.push(step.orderUsed);
        latent = step.prevSample;
        stages[`noise_unconditional_${index}`] = unconditionalNoise.data;
        stages[`noise_conditional_${index}`] = conditionalNoise.data;
        stages[`guided_noise_${index}`] = guided;
        stages[`latent_${index}`] = new Float32Array(latent);
      }
    } finally {
      await loaded.session.release();
    }
  }
  assert.ok(schedulerOrders.includes(1), 'D5 short pipeline did not exercise first-order scheduler behavior');
  assert.ok(schedulerOrders.includes(2), 'D5 short pipeline did not exercise second-order scheduler behavior');

  {
    const loaded = await loadSession(path.join(modelDir, 'vae_decoder.onnx'));
    latency.sessionCreateMs.vae_decoder = loaded.createMs;
    try {
      const decoded = await runOutput(loaded.session, {
        stable_diffusion_latent: floatTensor(latent, LATENT_SHAPE),
      }, 'decoded_rgb', DECODED_SHAPE, 'VAE decoder');
      latency.vaeMs = decoded.elapsedMs;
      stages.decoded_rgb = decoded.data;
      const image01 = new Float32Array(decoded.data.length);
      for (let index = 0; index < decoded.data.length; index++) {
        image01[index] = f32(Math.min(1, Math.max(0, f32(f32(decoded.data[index] / 2) + 0.5))));
      }
      stages.image_rgb_0_1 = image01;
    } finally {
      await loaded.session.release();
    }
  }

  const hashes = Object.fromEntries(Object.entries(stages).map(([name, data]) => [name, shaFloat32(data)]));
  if (writeFixtures) {
    const stageFiles = {};
    for (const [name, data] of Object.entries(stages)) {
      let dims = LATENT_SHAPE;
      if (name.includes('embedding')) dims = TEXT_SHAPE;
      if (name === 'decoded_rgb' || name === 'image_rgb_0_1') dims = DECODED_SHAPE;
      await writeStage(name, data, dims, stageFiles);
    }
    return { timesteps, schedulerOrders, hashes, latency, stageFiles };
  }
  return { timesteps, schedulerOrders, hashes, latency };
};

const first = await execute(true);
const second = await execute(false);
assert.deepEqual(second.timesteps, first.timesteps, 'native pipeline timesteps not deterministic');
assert.deepEqual(second.schedulerOrders, first.schedulerOrders, 'native pipeline solver orders not deterministic');
assert.deepEqual(second.hashes, first.hashes, 'native pipeline stage hashes not exactly deterministic');

const report = {
  schemaVersion: 1,
  status: 'CANDIDATE',
  stage: 'D5_NATIVE_SELECTED_PIPELINE_REFERENCE',
  authority: D5_PIPELINE_AUTHORITY,
  composedParityPolicy: D5_PIPELINE_COMPOSED_PARITY_POLICY,
  runtime: {
    package: 'onnxruntime-node',
    version: D5_PIPELINE_NATIVE_ORT_VERSION,
    executionProviders: ['cpu'],
    intraOpNumThreads: 1,
    interOpNumThreads: 1,
    sessionLifetimePolicy: 'ONE_COMPONENT_AT_A_TIME_TO_BOUND_RESIDENT_MODEL_MEMORY',
  },
  modelEvidence,
  quantizationEvidenceSha256: shaBytes(quantBytes),
  controlReferenceSha256: shaBytes(controlBytes),
  pipelineControlSha256: shaBytes(pipelineControlBytes),
  initialNoiseSigma: pipelineControl.initialNoiseSigma,
  initialLatentScalingPolicy: pipelineControl.initialLatentScalingPolicy,
  promptCase: D5_PIPELINE_PROMPT_CASE,
  prompt: promptCase.prompt,
  seed: D5_PIPELINE_SEED,
  seededLatentAlgorithm: 'XORSHIFT32_BOX_MULLER_FLOAT32',
  guidanceScale: D5_PIPELINE_GUIDANCE_SCALE,
  stepCount: D5_PIPELINE_STEP_COUNT,
  timesteps: first.timesteps,
  schedulerOrders: first.schedulerOrders,
  deterministicRerunExact: true,
  stageFiles: first.stageFiles,
  firstRunStageHashes: first.hashes,
  secondRunStageHashes: second.hashes,
  latency: { firstRun: first.latency, secondRun: second.latency },
  runtimeAuthorityGranted: false,
  productionApproval: false,
  editorAuthorityGranted: false,
  cloudFallbackAllowed: false,
  realDeviceApproval: false,
  imageQualityAdmission: false,
};
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`TINY-SD D5 NATIVE PIPELINE: PASS steps=${first.timesteps.join(',')} orders=${first.schedulerOrders.join(',')} final=${first.hashes.decoded_rgb}`);
