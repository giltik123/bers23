import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  D5_PIPELINE_AUTHORITY,
  D5_PIPELINE_SELECTED_SCHEME,
  D5_PIPELINE_STEP_COUNT,
} from './tiny-sd-d5-pipeline-constants.mjs';
import {
  D5_COMPOSED_PARITY_ADMISSION_POLICY,
  D5_COMPOSED_PARITY_CALIBRATION,
  D5_COMPOSED_PARITY_LIMITS,
  D5_COMPOSED_PARITY_OBSERVED_WORST,
  D5_D3_EXACT_HEAD_COMPONENT_ERROR_CONTEXT,
  D5_D3_SELECTED_GRAPH_FINGERPRINTS,
} from './tiny-sd-d5-composed-parity-limits.mjs';

const COMPONENTS = ['text_encoder', 'unet', 'vae_decoder'];
const METRICS = ['maxAbs', 'rmse'];
const NORMALIZED_KEYS = {
  maxAbs: 'maxAbsOverReferenceMaxAbs',
  rmse: 'rmseOverReferenceRms',
};

const finite = (value, label) => {
  const number = Number(value);
  assert.ok(Number.isFinite(number), `${label} must be finite`);
  return number;
};

const canonicalize = value => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonicalize(value[key])]));
  }
  return value;
};

export const canonicalSha256 = value =>
  createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');

const normalizedPair = (record, label) => {
  assert.ok(record?.normalized, `${label} normalized metrics missing`);
  return {
    maxAbs: finite(record.normalized.maxAbsOverReferenceMaxAbs, `${label}.maxAbs`),
    rmse: finite(record.normalized.rmseOverReferenceRms, `${label}.rmse`),
  };
};

const worstPairs = (records, selector, label) => {
  assert.ok(Array.isArray(records) && records.length > 0, `${label} records missing`);
  const pairs = records.map((record, index) => normalizedPair(selector(record), `${label}[${index}]`));
  return {
    maxAbs: Math.max(...pairs.map(value => value.maxAbs)),
    rmse: Math.max(...pairs.map(value => value.rmse)),
  };
};

export const extractComposedParityGates = browser => {
  const parity = browser?.compositionStageParity;
  assert.ok(parity, 'compositionStageParity missing');
  return {
    textConditional: normalizedPair(parity.textEmbeddings?.conditional, 'textConditional'),
    textUnconditional: normalizedPair(parity.textEmbeddings?.unconditional, 'textUnconditional'),
    unetUnconditional: worstPairs(parity.unetOutputs, value => value.unconditional, 'unetUnconditional'),
    unetConditional: worstPairs(parity.unetOutputs, value => value.conditional, 'unetConditional'),
    guidedNoise: worstPairs(parity.guidedNoise, value => value, 'guidedNoise'),
    latentSteps: worstPairs(parity.latentSteps, value => value, 'latentSteps'),
    finalDecoded: normalizedPair(parity.finalDecoded, 'finalDecoded'),
    finalImage01: normalizedPair(parity.finalImage01, 'finalImage01'),
  };
};

export const validateCalibration = () => {
  const details = [];
  for (const [family, limitPair] of Object.entries(D5_COMPOSED_PARITY_LIMITS)) {
    const observed = D5_COMPOSED_PARITY_OBSERVED_WORST[family];
    assert.ok(observed, `missing calibration observation for ${family}`);
    for (const metric of METRICS) {
      const limit = finite(limitPair[metric], `${family}.${metric}.limit`);
      const worst = finite(observed[metric], `${family}.${metric}.observed`);
      assert.ok(worst > 0, `${family}.${metric} observed worst must be positive`);
      const headroomRatio = limit / worst;
      assert.ok(
        headroomRatio >= D5_COMPOSED_PARITY_CALIBRATION.minHeadroomRatio,
        `${family}.${metric} headroom ${headroomRatio} below calibration minimum`,
      );
      assert.ok(
        headroomRatio <= D5_COMPOSED_PARITY_CALIBRATION.maxHeadroomRatio,
        `${family}.${metric} headroom ${headroomRatio} above calibration maximum`,
      );
      const d3Envelope = D5_COMPOSED_PARITY_CALIBRATION.d3Envelope[metric];
      const narrowingRatio = d3Envelope / limit;
      assert.ok(
        narrowingRatio >= D5_COMPOSED_PARITY_CALIBRATION.minimumNarrowingVsD3Envelope,
        `${family}.${metric} is not at least ${D5_COMPOSED_PARITY_CALIBRATION.minimumNarrowingVsD3Envelope}x narrower than D3 envelope`,
      );
      details.push({ family, metric, observedWorst: worst, limit, headroomRatio, narrowingVsD3Envelope: narrowingRatio });
    }
  }
  assert.equal(details.length, 16, 'D5 admission must retain exactly 16 calibrated numeric gates');
  return details;
};

const validateD3Semantics = d3 => {
  assert.equal(d3.stage, 'D3_WASM_COMPACT_PREPARATION');
  assert.deepEqual(Object.keys(d3.components).sort(), [...COMPONENTS].sort());
  const evidence = {};
  for (const component of COMPONENTS) {
    const record = d3.components[component];
    assert.equal(record.result, 'WASM_COMPACT_NATIVE_PASS', `${component} D3 selected result drift`);
    assert.equal(record.transform?.scheme, D5_PIPELINE_SELECTED_SCHEME, `${component} D3 scheme drift`);
    assert.equal(record.nativeOrtParity?.passed, true, `${component} native parity not proven`);
    assert.equal(record.releaseIdentityPinned, false, `${component} unexpectedly claims byte release identity`);
    assert.deepEqual(record.candidate?.graph?.domains, ['ai.onnx'], `${component} ONNX domain drift`);
    assert.equal(record.candidate?.graph?.functionCount, 0, `${component} function count drift`);
    const fingerprint = canonicalSha256(record.candidate.graph);
    assert.equal(
      fingerprint,
      D5_D3_SELECTED_GRAPH_FINGERPRINTS[component],
      `${component} selected D3 semantic graph fingerprint drift`,
    );
    evidence[component] = {
      semanticGraphFingerprint: fingerprint,
      regeneratedCandidateSha256: record.candidate.sha256,
      regeneratedCandidateBytes: record.candidate.size,
      releaseIdentityPinned: false,
      identityPolicy: 'REGENERATED_D3_SELECTED_SEMANTICS_NOT_RELEASE_BYTE_IDENTITY',
    };
  }
  return evidence;
};

const validateBrowserBoundary = browser => {
  assert.equal(browser.status, 'CANDIDATE');
  assert.equal(browser.stage, 'D5_BROWSER_SELECTED_PIPELINE_MEASUREMENT');
  assert.equal(browser.result, 'COMPOSED_PARITY_MEASURED_NOT_ADMITTED');
  assert.equal(browser.authority, D5_PIPELINE_AUTHORITY);
  assert.equal(browser.composedParityAdmission, false);
  assert.equal(browser.stepCount, D5_PIPELINE_STEP_COUNT);
  assert.equal(browser.provider, 'wasm');
  assert.deepEqual(browser.executionProviders, ['wasm']);
  assert.equal(browser.providerFallbackAllowed, false);
  assert.equal(browser.wasmRuntime?.numThreads, 1);
  assert.equal(browser.wasmRuntime?.proxy, false);
  assert.equal(browser.wasmRuntime?.workerFree, true);
  assert.equal(browser.crossOriginIsolated, true);
  assert.equal(browser.browserDeterministicRerunExact, true, 'real Chrome deterministic rerun not proven');
  assert.equal(browser.browserDeterministicRerun?.passCount, 2);
  assert.equal(browser.browserDeterministicRerun?.exactStageHashes, true);
  assert.equal(browser.browserDeterministicRerun?.exactCompositionMetrics, true);
  assert.deepEqual(browser.networkDiagnostics?.externalHttpRequests, []);
  assert.deepEqual(browser.networkDiagnostics?.pageErrors, []);
  assert.equal(browser.runtimeAuthorityGranted, false);
  assert.equal(browser.productionApproval, false);
  assert.equal(browser.editorAuthorityGranted, false);
  assert.equal(browser.cloudFallbackAllowed, false);
  assert.equal(browser.realDeviceApproval, false);
  assert.equal(browser.imageQualityAdmission, false);
};

const accumulationContext = observed => {
  const d3 = D5_D3_EXACT_HEAD_COMPONENT_ERROR_CONTEXT.components;
  const textWorst = {
    maxAbs: Math.max(observed.textConditional.maxAbs, observed.textUnconditional.maxAbs),
    rmse: Math.max(observed.textConditional.rmse, observed.textUnconditional.rmse),
  };
  const unetWorst = {
    maxAbs: Math.max(observed.unetConditional.maxAbs, observed.unetUnconditional.maxAbs),
    rmse: Math.max(observed.unetConditional.rmse, observed.unetUnconditional.rmse),
  };
  const ratioPair = (actual, isolated, label) => ({
    maxAbsRatioToExactHeadD3Isolated: actual.maxAbs / finite(isolated.maxAbs, `${label}.d3.maxAbs`),
    rmseRatioToExactHeadD3Isolated: actual.rmse / finite(isolated.rmse, `${label}.d3.rmse`),
  });
  return {
    source: D5_D3_EXACT_HEAD_COMPONENT_ERROR_CONTEXT,
    interpretation: 'DIAGNOSTIC_CONTEXT_ONLY_LIMITS_ARE_CALIBRATED_FROM_COMPOSED_REAL_CHROME_SAMPLES',
    textEncoder: ratioPair(textWorst, d3.text_encoder, 'textEncoder'),
    unetAfterAccumulatedCompositionState: ratioPair(unetWorst, d3.unet, 'unet'),
    finalDecodedVersusIsolatedVae: ratioPair(observed.finalDecoded, d3.vae_decoder, 'vaeDecoder'),
  };
};

export const evaluateComposedParity = ({ browser, d3 }) => {
  validateBrowserBoundary(browser);
  const d3SemanticEvidence = validateD3Semantics(d3);
  const calibration = validateCalibration();
  const observed = extractComposedParityGates(browser);
  const gates = [];

  for (const [family, limitPair] of Object.entries(D5_COMPOSED_PARITY_LIMITS)) {
    const actualPair = observed[family];
    assert.ok(actualPair, `missing observed family ${family}`);
    for (const metric of METRICS) {
      const actual = finite(actualPair[metric], `${family}.${metric}.actual`);
      const limit = finite(limitPair[metric], `${family}.${metric}.limit`);
      const passed = actual <= limit;
      gates.push({ family, metric, normalizedKey: NORMALIZED_KEYS[metric], actual, limit, passed });
      assert.ok(passed, `${family}.${metric} ${actual} exceeds admitted limit ${limit}`);
    }
  }
  assert.equal(gates.length, 16);
  assert.ok(gates.every(gate => gate.passed));

  return {
    schemaVersion: 1,
    status: 'CANDIDATE',
    stage: 'D5_COMPOSED_PARITY_ADMISSION',
    result: 'COMPOSED_PARITY_ADMITTED',
    authority: D5_PIPELINE_AUTHORITY,
    admissionPolicy: D5_COMPOSED_PARITY_ADMISSION_POLICY,
    compositionFeasibilityAdmission: true,
    rawBrowserMeasurementRemainsUnadmitted: true,
    rawBrowserResult: browser.result,
    calibratedNumericGateCount: gates.length,
    calibratedNumericGates: gates,
    calibration,
    calibrationSource: D5_COMPOSED_PARITY_CALIBRATION,
    d3SemanticIdentity: d3SemanticEvidence,
    accumulatedErrorContext: accumulationContext(observed),
    d3ByteIdentityAuthorityGranted: false,
    runtimeAuthorityGranted: false,
    productionApproval: false,
    editorAuthorityGranted: false,
    cloudFallbackAllowed: false,
    realDeviceApproval: false,
    imageQualityAdmission: false,
  };
};

const parseArgs = argv => {
  const args = new Map();
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith('--') || value === undefined) throw new Error(`invalid argument pair at ${key ?? '<missing>'}`);
    args.set(key.slice(2), value);
  }
  const required = name => {
    const value = args.get(name);
    if (!value) throw new Error(`--${name} is required`);
    return path.resolve(value);
  };
  return {
    browserReport: required('browser-report'),
    d3Report: required('d3-report'),
    output: required('output'),
  };
};

const main = async () => {
  const args = parseArgs(process.argv);
  const [browser, d3] = await Promise.all([
    fs.readFile(args.browserReport, 'utf8').then(JSON.parse),
    fs.readFile(args.d3Report, 'utf8').then(JSON.parse),
  ]);
  const decision = evaluateComposedParity({ browser, d3 });
  await fs.mkdir(path.dirname(args.output), { recursive: true });
  await fs.writeFile(args.output, `${JSON.stringify(decision, null, 2)}\n`);
  console.log(`TINY-SD D5 COMPOSED PARITY: ${decision.result} gates=${decision.calibratedNumericGateCount}/16`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
