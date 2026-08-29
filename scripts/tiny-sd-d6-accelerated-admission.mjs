import assert from 'node:assert/strict';

export const D6_SCHEMA_VERSION = 2;
export const D6_AUTHORITY = 'ACCELERATED_DEVICE_AND_QUALITY_ADMISSION_ONLY';
export const D6_D5_ACCEPTED_COMMIT_SHA = '71c52ab4c4442ad226ee850aa80be86f042e8382';
export const D6_D5_EVIDENCE_HEAD_SHA = '051fe0f117d7cf143d178bd802192af757a88267';
export const D6_D5_EVIDENCE_ARTIFACT_DIGEST = 'sha256:4269d83d33b34195d693f4d9da0b0e481e94110413ee0d26da6ee5b7d05b30b7';
export const D6_WEBGPU_PRECISION = 'FP16_INTERNAL_FP32_INT64_IO';
export const D6_D3_WEBGPU_PRECISION_EVIDENCE_SHA256 = '743511a63989b6360bfc9efbb74f45110f319a26777b27c694cbb74cf694231d';
export const D6_ORT_WEB_VERSION = '1.27.0';
export const D6_REQUIRED_WEBGPU_FEATURES = Object.freeze(['shader-f16']);
export const D6_MIN_BENCHMARK_SAMPLES = 5;
export const D6_QUALITY_CORPUS_ID = 'tiny-sd-d6-quality-v1';
export const D6_QUALITY_CORPUS_SHA256 = 'ce8bb069c7d3d99b56c97a19c415fca9a4d7643c9d04a1b75e225e3b948199fe';
export const D6_QUALITY_SEEDS = Object.freeze([64205, 64206]);
export const D6_QUALITY_PROMPT_IDS = Object.freeze([
  'portrait-natural-light',
  'full-body-street',
  'single-object-product',
  'three-apples-count',
  'left-right-relation',
  'indoor-living-room',
  'outdoor-mountain-lake',
  'foreground-background-depth',
  'color-style-watercolor',
  'night-lighting',
  'nonascii-russian',
  'nonascii-japanese',
]);
export const D6_MIN_QUALITY_CASES = D6_QUALITY_PROMPT_IDS.length * D6_QUALITY_SEEDS.length;
export const D6_MAX_EVIDENCE_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export const D6_WEBGPU_COMPONENTS = Object.freeze({
  text_encoder: Object.freeze({
    sha256: '18e7f3475066bcf9028bb116e476a445075454676e09cc4d852084d50fa29803',
    size: 247268464,
    semanticGraphFingerprint: '06b07b29f5a4fe502d84517a08819528dfb8f35c846ca03563715a332da17e7c',
  }),
  unet: Object.freeze({
    sha256: '7f62adbed5f1c247e1b1ef4358ad47f37e59f940a8b9a83be5be12f95bef4b85',
    size: 650085876,
    semanticGraphFingerprint: '7a76180a4a1c80fb090eabad772e072160ded2ee693af4443e4f7243924bb8f4',
  }),
  vae_decoder: Object.freeze({
    sha256: '1eb3a12d8560a41c1ef0b5ecb4738b2189ac4f92ea877ce53267c0a0d4d8857d',
    size: 99673963,
    semanticGraphFingerprint: '3357e4582316118fc80c1f3be9f34a90cc8a2ee291cbaa28e1cee8dc4f0997ef',
  }),
});

const COMPONENT_NAMES = Object.freeze(Object.keys(D6_WEBGPU_COMPONENTS));
const PLATFORM_DEVICE_CLASS = Object.freeze({
  WINDOWS: 'DESKTOP',
  MACOS: 'DESKTOP',
  LINUX: 'DESKTOP',
  ANDROID: 'MOBILE',
  IOS: 'MOBILE',
});
const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT_SHA = /^[0-9a-f]{40}$/;

const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const finiteNonNegative = value => finite(value) && value >= 0;
const nonEmpty = value => typeof value === 'string' && value.trim().length > 0;
const httpsUrl = value => {
  if (!nonEmpty(value)) return false;
  try { return new URL(value).protocol === 'https:'; } catch { return false; }
};
const sha256 = value => typeof value === 'string' && SHA256.test(value);
const commitSha = value => typeof value === 'string' && COMMIT_SHA.test(value);

export function canonicalizeTinySdD6EvidencePayload(value) {
  if (!isRecord(value)) throw new TypeError('D6 evidence must be an object');
  const payload = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'attestation'));
  return JSON.stringify(canonicalJsonValue(payload));
}

function canonicalJsonValue(value) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('D6 evidence contains a non-finite number');
    return value;
  }
  if (Array.isArray(value)) {
    const dense = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) {
        throw new TypeError(`D6 evidence contains a sparse array at index ${index}`);
      }
      dense.push(canonicalJsonValue(value[index]));
    }
    return dense;
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map(key => {
        const member = value[key];
        if (member === undefined) throw new TypeError(`D6 evidence contains undefined at ${key}`);
        return [key, canonicalJsonValue(member)];
      }),
    );
  }
  throw new TypeError(`D6 evidence contains unsupported value type: ${typeof value}`);
}

export function validateHostedWebGpuNegativeControl(value) {
  assert.ok(isRecord(value), 'hosted WebGPU evidence must be an object');
  assert.equal(value.status, 'CANDIDATE');
  assert.equal(value.stage, 'D3_BROWSER_WEBGPU_FP16');
  assert.equal(value.provider, 'webgpu');
  assert.equal(value.precisionTier, D6_WEBGPU_PRECISION);
  assert.equal(value.precisionEvidenceSha256, D6_D3_WEBGPU_PRECISION_EVIDENCE_SHA256);
  assert.equal(value.passCount, 0, 'hosted software adapter must not be counted as a WebGPU pass');
  assert.equal(value.hostedSoftwareFeasibilityOnly, true);
  assert.equal(value.realDeviceEvidence, false);
  assert.equal(value.providerFallbackAllowed, false);
  assert.equal(value.runtimeAuthorityGranted, false);
  assert.equal(value.productionDeviceApproval, false);
  assert.equal(value.productionApproval, false);
  assert.ok(isRecord(value.components));
  assert.deepEqual(Object.keys(value.components).sort(), [...COMPONENT_NAMES].sort());

  for (const name of COMPONENT_NAMES) {
    const component = value.components[name];
    assert.ok(isRecord(component), `${name} hosted evidence missing`);
    assert.equal(component.result, 'WEBGPU_SESSION_BLOCKED');
    assert.equal(component.blockerClass, 'REQUIRED_FEATURE_UNAVAILABLE');
    assert.equal(component.provider, 'webgpu');
    assert.equal(component.precisionTier, D6_WEBGPU_PRECISION);
    assert.equal(component.onnxruntimeWebVersion, D6_ORT_WEB_VERSION);
    assert.equal(component.modelSha256, D6_WEBGPU_COMPONENTS[name].sha256);
    assert.equal(component.modelBytes, D6_WEBGPU_COMPONENTS[name].size);
    assert.deepEqual(component.requiredFeatures, D6_REQUIRED_WEBGPU_FEATURES);
    assert.deepEqual(component.executionProviders, ['webgpu']);
    assert.equal(component.providerFallbackAllowed, false);
    assert.equal(component.hostedSoftwareFeasibilityOnly, true);
    assert.equal(component.realDeviceEvidence, false);
    assert.equal(component.runtimeAuthorityGranted, false);
    assert.equal(component.productionDeviceApproval, false);
    assert.equal(component.productionPromotionAllowed, false);
    assert.ok(Array.isArray(component.missingRequiredFeatures));
    for (const feature of D6_REQUIRED_WEBGPU_FEATURES) {
      assert.ok(component.missingRequiredFeatures.includes(feature), `${name} must remain blocked on missing ${feature}`);
    }
    assert.ok(isRecord(component.adapter));
    assert.equal(component.adapter.softwareAdapterLikely, true, `${name} hosted adapter must be classified as software`);
    assert.notEqual(component.adapter.features?.includes('shader-f16'), true, `${name} negative control unexpectedly exposes shader-f16`);
    assert.deepEqual(component.networkDiagnostics?.externalHttpRequests ?? [], [], `${name} attempted external HTTP`);
    assert.deepEqual(component.networkDiagnostics?.pageErrors ?? [], [], `${name} page errors present`);
  }

  return Object.freeze({
    acceptedNegativeControl: true,
    realDeviceAdmission: false,
    authority: D6_AUTHORITY,
    classification: 'HOSTED_SOFTWARE_ADAPTER_BLOCKED_AS_EXPECTED',
  });
}

export async function assessTinySdD6RealDeviceEvidence(value, {
  expectedTestedCommitSha,
  trustVerifier,
  now = Date.now(),
} = {}) {
  const blockers = new Set();
  if (!isRecord(value)) return assessment(['INVALID_SCHEMA']);

  let evidence;
  try {
    evidence = canonicalJsonValue(value);
  } catch {
    return assessment(['INVALID_CANONICAL_PAYLOAD']);
  }
  if (!isRecord(evidence) || evidence.schemaVersion !== D6_SCHEMA_VERSION) return assessment(['INVALID_SCHEMA']);

  if (evidence.authority !== D6_AUTHORITY) blockers.add('WRONG_AUTHORITY');
  validateRootBindings(evidence, expectedTestedCommitSha, blockers);
  if (evidence.precisionTier !== D6_WEBGPU_PRECISION) blockers.add('WRONG_PRECISION_TIER');

  let canonicalPayload = null;
  try {
    canonicalPayload = canonicalizeTinySdD6EvidencePayload(evidence);
  } catch {
    blockers.add('INVALID_CANONICAL_PAYLOAD');
  }

  validateTime(evidence, now, blockers);
  await validateAttestation(evidence.attestation, trustVerifier, canonicalPayload, blockers);
  validateDevice(evidence.device, blockers);
  validateComponents(evidence.components, blockers);
  validateControl(evidence.control, blockers);
  validateBenchmark(evidence.benchmark, blockers);
  validateParity(evidence.parity, blockers);
  validateQuality(evidence.quality, evidence.capturedAt, now, blockers);
  validateBindings(evidence, blockers);
  validateLocalExecution(evidence.localExecution, blockers);
  validateAuthorityDenials(evidence, blockers);

  return assessment([...blockers]);
}

function validateRootBindings(value, expectedTestedCommitSha, blockers) {
  if (value.d5AcceptedCommitSha !== D6_D5_ACCEPTED_COMMIT_SHA
    || value.d5EvidenceHeadSha !== D6_D5_EVIDENCE_HEAD_SHA
    || value.d5EvidenceArtifactDigest !== D6_D5_EVIDENCE_ARTIFACT_DIGEST) {
    blockers.add('D5_ROOT_DRIFT');
  }
  if (!commitSha(value.testedCommitSha)
    || !commitSha(expectedTestedCommitSha)
    || value.testedCommitSha !== expectedTestedCommitSha) {
    blockers.add('TESTED_COMMIT_DRIFT');
  }
}

function validateTime(value, now, blockers) {
  if (!finiteNonNegative(now)) blockers.add('INVALID_TIME');
  if (!finiteNonNegative(value.capturedAt) || !finiteNonNegative(value.expiresAt) || value.expiresAt < value.capturedAt) {
    blockers.add('INVALID_TIME');
    return;
  }
  if (value.expiresAt - value.capturedAt > D6_MAX_EVIDENCE_AGE_MS) blockers.add('INVALID_TIME');
  if (value.capturedAt > now) blockers.add('FUTURE_EVIDENCE');
  if (now - value.capturedAt > D6_MAX_EVIDENCE_AGE_MS || value.expiresAt < now) blockers.add('STALE_EVIDENCE');
}

async function validateAttestation(attestation, trustVerifier, canonicalPayload, blockers) {
  if (!isRecord(attestation) || !httpsUrl(attestation.evidenceUrl) || !httpsUrl(attestation.signatureUrl)) {
    blockers.add('INVALID_ATTESTATION');
  }
  if (typeof trustVerifier !== 'function' || typeof canonicalPayload !== 'string') {
    blockers.add('ATTESTATION_UNVERIFIED');
    return;
  }

  try {
    const result = await trustVerifier(Object.freeze({
      canonicalPayload,
      attestation: isRecord(attestation) ? Object.freeze({ ...attestation }) : attestation,
    }));
    if (!isRecord(result) || result.verified !== true) blockers.add('ATTESTATION_UNVERIFIED');
  } catch {
    blockers.add('ATTESTATION_UNVERIFIED');
  }
}

function validateDevice(device, blockers) {
  if (!isRecord(device)) { blockers.add('REAL_DEVICE_REQUIRED'); return; }
  if (device.evidenceKind !== 'REAL_PHYSICAL_DEVICE') blockers.add('REAL_DEVICE_REQUIRED');
  const expectedDeviceClass = PLATFORM_DEVICE_CLASS[device.platform];
  if (!expectedDeviceClass
    || device.deviceClass !== expectedDeviceClass
    || !['LOW', 'MEDIUM', 'HIGH', 'EXTREME'].includes(device.deviceTier)
    || !nonEmpty(device.coarseDeviceEvidenceKey)) blockers.add('INCOMPLETE_DEVICE_IDENTITY');
  if (device.provider !== 'webgpu') blockers.add('UNSUPPORTED_PROVIDER');
  if (device.executionProviders?.length !== 1 || device.executionProviders?.[0] !== 'webgpu' || device.providerFallbackAllowed !== false) blockers.add('PROVIDER_FALLBACK_OR_DRIFT');
  if (device.softwareAdapter !== false || device.adapterKind !== 'PHYSICAL') blockers.add('SOFTWARE_OR_UNKNOWN_ADAPTER');
  if (!nonEmpty(device.vendor) || !nonEmpty(device.architecture) || /swiftshader|software|llvmpipe|lavapipe/i.test(`${device.vendor} ${device.architecture} ${device.device ?? ''} ${device.description ?? ''}`)) blockers.add('SOFTWARE_OR_UNKNOWN_ADAPTER');
  if (!nonEmpty(device.browserVersion)) blockers.add('INCOMPLETE_RUNTIME_IDENTITY');
  if (device.runtimeName !== 'onnxruntime-web' || device.runtimeVersion !== D6_ORT_WEB_VERSION) blockers.add('RUNTIME_IDENTITY_DRIFT');
  if (!Array.isArray(device.features)) blockers.add('REQUIRED_FEATURE_MISSING');
  else for (const feature of D6_REQUIRED_WEBGPU_FEATURES) if (!device.features.includes(feature)) blockers.add('REQUIRED_FEATURE_MISSING');
}

function validateComponents(components, blockers) {
  if (!isRecord(components) || Object.keys(components).length !== COMPONENT_NAMES.length) { blockers.add('WRONG_MODEL_IDENTITY'); return; }
  for (const name of COMPONENT_NAMES) {
    const expected = D6_WEBGPU_COMPONENTS[name];
    const actual = components[name];
    if (!isRecord(actual)
      || actual.sha256 !== expected.sha256
      || actual.size !== expected.size
      || actual.semanticGraphFingerprint !== expected.semanticGraphFingerprint
      || actual.releaseIdentityPinned !== false
      || actual.identityPolicy !== 'EXACT_D3_WEBGPU_CANDIDATE_BYTES_FOR_D6_EVIDENCE_NOT_RELEASE_AUTHORITY') {
      blockers.add('WRONG_MODEL_IDENTITY');
    }
  }
}

function validateControl(control, blockers) {
  if (!isRecord(control)) { blockers.add('CONTROL_SEMANTICS_DRIFT'); return; }
  if (control.schedulerClass !== 'DPMSolverMultistepScheduler'
    || control.algorithmType !== 'dpmsolver++'
    || control.solverOrder !== 2
    || control.solverType !== 'midpoint'
    || control.tokenizerClass !== 'CLIPTokenizer'
    || control.modelMaxLength !== 77
    || control.providerFallbackAllowed !== false) blockers.add('CONTROL_SEMANTICS_DRIFT');
  const seeds = Array.isArray(control.seeds) ? control.seeds : [];
  if (control.promptCorpusId !== D6_QUALITY_CORPUS_ID
    || seeds.length !== D6_QUALITY_SEEDS.length
    || !D6_QUALITY_SEEDS.every(seed => seeds.includes(seed))
    || !seeds.every(Number.isInteger)
    || new Set(seeds).size !== seeds.length) blockers.add('CONTROL_SEMANTICS_DRIFT');
  if (!Number.isInteger(control.stepCount) || control.stepCount <= 3 || !finite(control.guidanceScale) || control.guidanceScale <= 0) {
    blockers.add('PRACTICAL_GENERATION_PROTOCOL_REQUIRED');
  }
  const timesteps = Array.isArray(control.timesteps) ? control.timesteps : [];
  if (timesteps.length !== control.stepCount
    || !timesteps.every(value => Number.isInteger(value) && value >= 0 && value < 1000)
    || timesteps.some((value, index) => index > 0 && value >= timesteps[index - 1])) {
    blockers.add('PRACTICAL_GENERATION_PROTOCOL_REQUIRED');
  }
}

function validateBenchmark(benchmark, blockers) {
  if (!isRecord(benchmark)) { blockers.add('INSUFFICIENT_BENCHMARK_EVIDENCE'); return; }
  if (!Number.isInteger(benchmark.warmupCount) || benchmark.warmupCount < 1
    || !Number.isInteger(benchmark.sampleCount) || benchmark.sampleCount < D6_MIN_BENCHMARK_SAMPLES
    || benchmark.successfulSamples !== benchmark.sampleCount) blockers.add('INSUFFICIENT_BENCHMARK_EVIDENCE');
  if (!validLatency(benchmark.endToEndLatencyMs)) blockers.add('INVALID_BENCHMARK_METRICS');
  if (!isRecord(benchmark.stageLatencyMs) || !['textEncoder', 'unet', 'vae'].every(key => validLatency(benchmark.stageLatencyMs[key]))) blockers.add('INVALID_BENCHMARK_METRICS');
  for (const key of ['peakRamBytes', 'peakVramBytes']) {
    const value = benchmark[key];
    if (!(value === 'UNKNOWN' || finiteNonNegative(value))) blockers.add('INVALID_MEMORY_EVIDENCE');
  }
  if (!['ACCELERATED_INTERACTIVE_CANDIDATE', 'ACCELERATED_WAITABLE_CANDIDATE', 'ACCELERATED_TOO_SLOW_FOR_PRODUCT_DEFAULT'].includes(benchmark.productClassification)) blockers.add('PRODUCT_CLASSIFICATION_REQUIRED');
  if (!nonEmpty(benchmark.classificationRationale)) blockers.add('PRODUCT_CLASSIFICATION_REQUIRED');
}

function validLatency(value) {
  if (!isRecord(value)) return false;
  const { min, median, p95, max } = value;
  return [min, median, p95, max].every(finiteNonNegative) && min <= median && median <= p95 && p95 <= max;
}

function validateParity(parity, blockers) {
  if (!isRecord(parity)) { blockers.add('PARITY_EVIDENCE_REQUIRED'); return; }
  if (parity.reference !== 'CPU_ORT_SAME_D3_WEBGPU_CANDIDATE_AND_D5_CONTROL_SEMANTICS'
    || parity.passed !== true
    || parity.calibratedFromIndependentRealDeviceRuns !== true
    || !nonEmpty(parity.limitsId)
    || !Number.isInteger(parity.numericGateCount) || parity.numericGateCount < 1
    || parity.allNumericGatesPassed !== true) blockers.add('PARITY_EVIDENCE_REQUIRED');
}

function validateQuality(quality, capturedAt, now, blockers) {
  if (!isRecord(quality)) {
    blockers.add('QUALITY_REVIEW_REQUIRED');
    blockers.add('HUMAN_REVIEW_REQUIRED');
    return;
  }

  const cases = Array.isArray(quality.cases) ? quality.cases : [];
  if (quality.corpusId !== D6_QUALITY_CORPUS_ID
    || !httpsUrl(quality.corpusEvidenceUrl)
    || quality.corpusSha256 !== D6_QUALITY_CORPUS_SHA256
    || cases.length !== D6_MIN_QUALITY_CASES) {
    blockers.add('QUALITY_REVIEW_REQUIRED');
  }
  const observedMatrix = new Set();
  const observedCaseIds = new Set();
  const observedOutputHashes = new Set();
  for (const item of cases) {
    const matrixKey = `${item?.promptId ?? ''}:${item?.seed ?? ''}`;
    const caseId = item?.caseId ?? '';
    const outputHash = item?.outputImageSha256 ?? '';
    if (!isRecord(item)
      || !nonEmpty(caseId)
      || !sha256(outputHash)
      || !D6_QUALITY_PROMPT_IDS.includes(item.promptId)
      || !D6_QUALITY_SEEDS.includes(item.seed)
      || observedMatrix.has(matrixKey)
      || observedCaseIds.has(caseId)
      || observedOutputHashes.has(outputHash)
      || item.humanDecision !== 'PASS'
      || (Array.isArray(item.failureCategories) ? item.failureCategories.length !== 0 : true)) {
      blockers.add('QUALITY_REVIEW_REQUIRED');
    }
    observedMatrix.add(matrixKey);
    observedCaseIds.add(caseId);
    observedOutputHashes.add(outputHash);
  }
  for (const promptId of D6_QUALITY_PROMPT_IDS) {
    for (const seed of D6_QUALITY_SEEDS) {
      if (!observedMatrix.has(`${promptId}:${seed}`)) blockers.add('QUALITY_REVIEW_REQUIRED');
    }
  }

  const reviewer = quality.reviewer;
  if (!isRecord(reviewer)
    || !nonEmpty(reviewer.reviewerId)
    || reviewer.decision !== 'PASS'
    || !httpsUrl(reviewer.reviewEvidenceUrl)
    || !sha256(reviewer.reviewSha256)
    || !finiteNonNegative(reviewer.reviewedAt)
    || (finiteNonNegative(capturedAt) && reviewer.reviewedAt < capturedAt)
    || (finiteNonNegative(now) && reviewer.reviewedAt > now)) blockers.add('HUMAN_REVIEW_REQUIRED');
}

function validateBindings(value, blockers) {
  if (!isRecord(value.control) || !isRecord(value.quality) || value.control.promptCorpusId !== value.quality.corpusId) {
    blockers.add('EVIDENCE_BINDING_MISMATCH');
  }
}

function validateLocalExecution(local, blockers) {
  if (!isRecord(local)
    || local.executionTarget !== 'LOCAL'
    || local.externalModelRuntimeHttpRequests !== 0
    || local.providerApiCalls !== 0
    || local.aiCreditsConsumed !== 0) blockers.add('NON_LOCAL_EXECUTION_DETECTED');
}

function validateAuthorityDenials(value, blockers) {
  for (const key of ['productionApproval', 'editorAuthorityGranted', 'releaseAuthorityGranted', 'cloudFallbackAllowed', 'billingAuthorityGranted']) {
    if (value[key] !== false) blockers.add('AUTHORITY_ESCALATION');
  }
}

function assessment(blockers) {
  const unique = [...new Set(blockers)].sort();
  return Object.freeze({
    eligible: unique.length === 0,
    blockers: Object.freeze(unique),
    authority: D6_AUTHORITY,
    productionApproval: false,
    editorAuthorityGranted: false,
    releaseAuthorityGranted: false,
    cloudFallbackAllowed: false,
    billingAuthorityGranted: false,
  });
}
