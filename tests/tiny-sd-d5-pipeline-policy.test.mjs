import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = path => fs.readFileSync(path, 'utf8');
const constants = read('scripts/tiny-sd-d5-pipeline-constants.mjs');
const pipelineControl = read('scripts/probe-tiny-sd-d5-pipeline-control.py');
const nativeRunner = read('scripts/test-tiny-sd-d5-pipeline-node.mjs');
const browserRunner = read('scripts/test-tiny-sd-d5-pipeline-browser.mjs');
const browserPage = read('tests/tiny-sd-d5-pipeline-browser.html');
const admissionLimits = read('scripts/tiny-sd-d5-composed-parity-limits.mjs');
const admissionEvaluator = read('scripts/evaluate-tiny-sd-d5-composed-parity.mjs');
const workflow = read('.github/workflows/sprint-6.42d5-tiny-sd-pipeline.yml');

test('D5 short composition is pinned to a minimal first+second-order measurement configuration', () => {
  assert.match(constants, /D5_PIPELINE_STEP_COUNT = 3/);
  assert.match(constants, /D5_PIPELINE_GUIDANCE_SCALE = 7\.5/);
  assert.match(constants, /D5_PIPELINE_SEED = 64205/);
  assert.match(constants, /D5_PIPELINE_PROMPT_CASE = 'ascii'/);
  assert.match(constants, /EXACT_FP16_STORAGE_FP32_COMPUTE/);
  assert.match(constants, /MEASURE_THEN_PIN_NARROW_LIMITS/);
  assert.match(nativeRunner, /schedulerOrders\.includes\(1\)/);
  assert.match(nativeRunner, /schedulerOrders\.includes\(2\)/);
  assert.match(nativeRunner, /TinySdDpmSolverMultistep/);
  assert.match(browserPage, /TinySdDpmSolverMultistep/);
});

test('D5 historical runtime control records init_noise_sigma instead of assuming latent scaling', () => {
  assert.match(pipelineControl, /DPMSolverMultistepScheduler\.from_pretrained/);
  assert.match(pipelineControl, /scheduler\.init_noise_sigma/);
  assert.match(pipelineControl, /scheduler config SHA drift/);
  assert.match(pipelineControl, /SEEDED_GAUSSIAN_FLOAT32_MULTIPLIED_BY_HISTORICAL_INIT_NOISE_SIGMA/);
  assert.match(nativeRunner, /pipelineControl\.initialNoiseSigma/);
  assert.match(nativeRunner, /latent\[index\] = f32\(latent\[index\] \* pipelineControl\.initialNoiseSigma\)/);
});

test('D5 native selected-model reference is CPU-only, deterministic and bounds resident model lifetime', () => {
  assert.match(constants, /D5_PIPELINE_NATIVE_ORT_VERSION = '1\.27\.0'/);
  assert.match(nativeRunner, /from 'onnxruntime-node'/);
  assert.match(nativeRunner, /executionProviders: \['cpu'\]/);
  assert.match(nativeRunner, /intraOpNumThreads: 1/);
  assert.match(nativeRunner, /interOpNumThreads: 1/);
  assert.match(nativeRunner, /ONE_COMPONENT_AT_A_TIME_TO_BOUND_RESIDENT_MODEL_MEMORY/);
  assert.match(nativeRunner, /await loaded\.session\.release\(\)/);
  assert.equal(nativeRunner.includes('const sessions = {}'), false);
  assert.match(nativeRunner, /assert\.deepEqual\(second\.hashes, first\.hashes/);
  assert.match(nativeRunner, /candidate\.graph\.ioContract/);
  assert.match(nativeRunner, /firstRunStageHashes/);
  assert.match(nativeRunner, /secondRunStageHashes/);
});

test('D5 browser composition uses the production worker-free WASM boundary and consumes prompt text', () => {
  assert.match(browserPage, /BrowserOnnxSessionFactory/);
  assert.match(browserPage, /executionProviders: \['wasm'\]/);
  assert.match(browserPage, /BROWSER_WASM_NUM_THREADS === 1/);
  assert.match(browserPage, /BROWSER_WASM_PROXY === false/);
  assert.match(browserPage, /SESSION_TIMEOUT_MS = 180_000/);
  assert.match(browserPage, /INFERENCE_TIMEOUT_MS = 300_000/);
  assert.match(browserPage, /crossOriginIsolated/);
  assert.match(browserPage, /env\.allowRemoteModels = false/);
  assert.match(browserPage, /AutoTokenizer\.from_pretrained\('tiny-sd-tokenizer'/);
  assert.match(browserPage, /expected\.prompt/);
  assert.match(browserPage, /add_special_tokens: false/);
  assert.match(browserRunner, /externalHttpRequests/);
  assert.match(browserRunner, /assert\.deepEqual\(diagnostics\.externalHttpRequests, \[\]/);
  assert.equal(browserPage.includes('new Worker('), false);
  assert.equal(browserPage.includes('trustedTypes.createPolicy'), false);
  assert.equal(browserRunner.includes('new Worker('), false);
  assert.equal(browserRunner.includes('trustedTypes.createPolicy'), false);
});

test('D5 first Track C run measures accumulated composition parity without pretending it is admitted', () => {
  assert.match(browserPage, /COMPOSED_PARITY_MEASURED_NOT_ADMITTED/);
  assert.match(browserPage, /composedParityAdmission: false/);
  assert.match(browserPage, /EXACT_HEAD_D3_WORKFLOW_SEPARATE_FROM_D5_COMPOSITION/);
  assert.match(browserPage, /NOT_A_COMPONENT_ISOLATION_GATE_INPUTS_INCLUDE_PRIOR_BROWSER_COMPOSITION_STATE/);
  assert.match(browserPage, /NOT_A_COMPONENT_ISOLATION_GATE_INPUT_LATENT_INCLUDES_ACCUMULATED_BROWSER_COMPOSITION_STATE/);
  assert.match(browserPage, /compositionStageParity/);
  assert.match(browserPage, /browserStageHashes/);
  assert.equal(browserPage.includes('COMPOSITION_PASS'), false);
  assert.equal(constants.includes('COMPOSED_PARITY_LIMIT'), false);
});


test('D5 composed parity admission is evidence-calibrated, fail-closed and authority-bounded', () => {
  assert.match(admissionLimits, /PINNED_STAGE_FAMILY_NORMALIZED_LIMITS_FROM_TWO_REAL_CHROME_SAMPLES/);
  assert.match(admissionLimits, /32921222867/);
  assert.match(admissionLimits, /32926052529/);
  assert.match(admissionLimits, /fe18a3842cae94b79892b94bd18880ecb681a63d/);
  assert.match(admissionLimits, /f17e9789fbcc032d44ab50ef5b06acbe596df748/);
  assert.match(admissionLimits, /minHeadroomRatio: 1\.2/);
  assert.match(admissionLimits, /maxHeadroomRatio: 2\.0/);
  assert.match(admissionLimits, /minimumNarrowingVsD3Envelope: 10/);
  assert.match(admissionLimits, /32926052575/);
  assert.match(admissionLimits, /REAL_CHROME_WASM_COMPONENT_ISOLATION/);
  for (const fingerprint of [
    'bc9b9c83740753cda24e28a7c3ec806f38b647314f3aba4e02a24d2ed9a9cca4',
    '65c40fb712c2e2fadadc33e1a9c7be5a97c3f9a86dfba463da9ce6a3e5bc1e9a',
    'ad661bf790bc1024710e97bfbf2f0285c7f9e6cf87b9d3ad33530f41d0ffd2e7',
  ]) assert.ok(admissionLimits.includes(fingerprint), `missing D3 semantic graph fingerprint ${fingerprint}`);
  assert.match(admissionEvaluator, /details\.length, 16/);
  assert.match(admissionEvaluator, /real Chrome deterministic rerun not proven/);
  assert.match(admissionEvaluator, /selected D3 semantic graph fingerprint drift/);
  assert.match(admissionEvaluator, /REGENERATED_D3_SELECTED_SEMANTICS_NOT_RELEASE_BYTE_IDENTITY/);
  assert.match(admissionEvaluator, /DIAGNOSTIC_CONTEXT_ONLY_LIMITS_ARE_CALIBRATED_FROM_COMPOSED_REAL_CHROME_SAMPLES/);
  assert.match(admissionEvaluator, /COMPOSED_PARITY_ADMITTED/);
  assert.match(admissionEvaluator, /rawBrowserMeasurementRemainsUnadmitted: true/);
  assert.match(browserRunner, /evaluateComposedParity/);
  assert.match(browserRunner, /compositionFeasibilityDecision/);
  assert.match(browserRunner, /browserDeterministicRerunExact = true/);
  for (const denied of [
    'runtimeAuthorityGranted: false',
    'productionApproval: false',
    'editorAuthorityGranted: false',
    'cloudFallbackAllowed: false',
    'realDeviceApproval: false',
    'imageQualityAdmission: false',
  ]) assert.ok(admissionEvaluator.includes(denied), `missing denied authority: ${denied}`);
});

test('D5 heavyweight workflow replays D1-D3 and uploads JSON only after destroying model/reference bytes', () => {
  for (const needle of [
    'cad0bd7495fa6c4bcca01b19a723dc91627fe84f',
    'inspect-tiny-sd-snapshot.py',
    'bridge-tiny-sd-safetensors.py',
    'probe-tiny-sd-reference.py',
    'probe-tiny-sd-component-onnx.py',
    'prepare-tiny-sd-d3-wasm-quantized.py',
    'probe-tiny-sd-d5-pipeline-control.py',
    'test-tiny-sd-d5-pipeline-node.mjs',
    'test-tiny-sd-d5-pipeline-browser.mjs',
    "ORT_NODE_VERSION: '1.27.0'",
    'onnxruntime-node@${ORT_NODE_VERSION}',
    "TRANSFORMERS_JS_VERSION: '3.8.1'",
    '@huggingface/transformers@${TRANSFORMERS_JS_VERSION}',
    '--onnxruntime-node-install=skip',
    'COMPOSED_PARITY_MEASURED_NOT_ADMITTED',
  ]) assert.ok(workflow.includes(needle), `missing D5 heavyweight workflow contract: ${needle}`);
  assert.match(workflow, /git diff --exit-code -- package\.json package-lock\.json/);
  assert.match(workflow, /rm -rf[\s\S]*tiny-sd-d5-pipeline-selected/);
  assert.match(workflow, /tiny-sd-d5-pipeline-native-fixtures/);
  assert.match(workflow, /-name '\*\.onnx'/);
  assert.match(workflow, /-name '\*\.f32'/);
  assert.match(workflow, /-name '\*\.npz'/);

  const uploadStart = workflow.indexOf('- name: Upload JSON-only D5 pipeline evidence');
  const uploadEnd = workflow.indexOf('- name: Summarize D5 pipeline measurement', uploadStart);
  assert.notEqual(uploadStart, -1);
  assert.notEqual(uploadEnd, -1);
  const uploadBlock = workflow.slice(uploadStart, uploadEnd);
  assert.equal(uploadBlock.includes('${RUNNER_TEMP}/'), false);
  for (const forbidden of ['.onnx', '.ort', '.safetensors', '.npz', '.f32', '.png', '.bin']) {
    assert.equal(uploadBlock.includes(forbidden), false, `D5 upload block contains binary extension ${forbidden}`);
  }
  const paths = [...uploadBlock.matchAll(/^\s{12}(\.test-cache\/6\.42d5-pipeline\/[^\s]+)$/gm)].map(match => match[1]);
  assert.ok(paths.length >= 8, `expected substantial JSON-only lineage evidence, got ${paths.length}`);
  assert.ok(paths.every(value => value.endsWith('.json')));
});
