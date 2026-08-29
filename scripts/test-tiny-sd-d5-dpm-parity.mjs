import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { D5_CONTROL_AUTHORITY, D5_DPM_PARITY_LIMIT } from './tiny-sd-d5-control-constants.mjs';
import { TinySdDpmSolverMultistep, dpmParityMetrics } from './tiny-sd-d5-dpm-solver.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index];
  const value = process.argv[index + 1];
  if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument pair: ${key ?? '<missing>'}`);
  args.set(key.slice(2), value);
}
const reportPath = args.get('reference');
const outputPath = args.get('report');
if (!reportPath || !outputPath) throw new Error('--reference and --report are required');

const referenceBytes = await fs.readFile(reportPath);
const reference = JSON.parse(referenceBytes.toString('utf8'));
assert.equal(reference.status, 'CANDIDATE');
assert.equal(reference.stage, 'D5_CONTROL_SEMANTICS_REFERENCE');
assert.equal(reference.authority, D5_CONTROL_AUTHORITY);
assert.equal(reference.runtimeAuthorityGranted, false);
assert.equal(reference.productionApproval, false);
assert.equal(reference.cloudFallbackAllowed, false);

const rawConfig = reference.schedulerConfig;
const config = {
  ...rawConfig,
  lambda_min_clipped: rawConfig.lambda_min_clipped === '-Infinity' ? Number.NEGATIVE_INFINITY : rawConfig.lambda_min_clipped,
};
const scheduleReports = {};
for (const [count, expected] of Object.entries(reference.scheduler.schedules)) {
  const scheduler = new TinySdDpmSolverMultistep(config);
  const timesteps = scheduler.setTimesteps(Number(count));
  assert.deepEqual(timesteps, expected.timesteps, `DPM timesteps drift for ${count} steps`);
  const alpha = timesteps.map(value => scheduler.alphaT[value]);
  const sigma = timesteps.map(value => scheduler.sigmaT[value]);
  const lambda = timesteps.map(value => scheduler.lambdaT[value]);
  scheduleReports[count] = {
    timesteps,
    alpha: dpmParityMetrics(expected.alphaAtTimesteps, alpha),
    sigma: dpmParityMetrics(expected.sigmaAtTimesteps, sigma),
    lambda: dpmParityMetrics(expected.lambdaAtTimesteps, lambda),
  };
}

const scheduler = new TinySdDpmSolverMultistep(config);
assert.deepEqual(scheduler.setTimesteps(reference.scheduler.chain.stepCount), reference.scheduler.schedules[String(reference.scheduler.chain.stepCount)].timesteps);
let sample = Float32Array.from(reference.scheduler.chain.initialSample);
const chain = [];
for (const step of reference.scheduler.chain.steps) {
  const modelOutput = Float32Array.from(reference.scheduler.chain.modelOutputs[step.index]);
  const scaled = scheduler.scaleModelInput(sample);
  assert.deepEqual(Array.from(scaled), Array.from(sample), 'DPM scale_model_input must be identity');
  const result = scheduler.step(modelOutput, step.timestep, sample);
  assert.equal(result.orderUsed, step.expectedOrderUsed, `solver order drift at step ${step.index}`);
  const parity = dpmParityMetrics(step.prevSample, result.prevSample);
  assert.ok(parity.maxAbs <= D5_DPM_PARITY_LIMIT.maxAbs, `DPM maxAbs parity limit exceeded at step ${step.index}: ${parity.maxAbs}`);
  assert.ok(parity.rmse <= D5_DPM_PARITY_LIMIT.rmse, `DPM RMSE parity limit exceeded at step ${step.index}: ${parity.rmse}`);
  chain.push({ index: step.index, timestep: step.timestep, orderUsed: result.orderUsed, prevTimestep: result.prevTimestep, parity });
  sample = result.prevSample;
}

const reset = new TinySdDpmSolverMultistep(config);
reset.setTimesteps(reference.scheduler.chain.stepCount);
let resetSample = Float32Array.from(reference.scheduler.chain.initialSample);
for (const step of reference.scheduler.chain.steps) {
  resetSample = reset.step(Float32Array.from(reference.scheduler.chain.modelOutputs[step.index]), step.timestep, resetSample).prevSample;
}
const resetParity = dpmParityMetrics(sample, resetSample);
assert.equal(resetParity.maxAbs, 0, 'JS scheduler reset must be exactly deterministic');
assert.equal(reference.scheduler.chain.deterministicResetExact, true);

const allMetrics = [
  ...Object.values(scheduleReports).flatMap(value => [value.alpha, value.sigma, value.lambda]),
  ...chain.map(value => value.parity),
];
const observed = {
  maxAbs: Math.max(...allMetrics.map(value => value.maxAbs)),
  rmse: Math.max(...allMetrics.map(value => value.rmse)),
};
const report = {
  schemaVersion: 1,
  status: 'CANDIDATE',
  stage: 'D5_DPM_SOLVER_JS_PARITY',
  authority: D5_CONTROL_AUTHORITY,
  referenceLibrary: reference.scheduler.referenceLibrary,
  implementation: 'BERS_RESEARCH_JS_FLOAT32_DPM_SOLVER_MULTISTEP',
  scheduleReports,
  chain,
  resetParity,
  parityLimit: D5_DPM_PARITY_LIMIT,
  observed,
  passed: true,
  runtimeAuthorityGranted: false,
  productionApproval: false,
  editorAuthorityGranted: false,
  cloudFallbackAllowed: false,
};
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(`TINY-SD D5 DPM JS PARITY: PASS maxAbs=${observed.maxAbs} rmse=${observed.rmse}`);
