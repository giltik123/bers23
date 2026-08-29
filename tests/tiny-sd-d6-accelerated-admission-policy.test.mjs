import test from 'node:test';
import assert from 'node:assert/strict';
import {
  D6_AUTHORITY,
  D6_D5_ACCEPTED_COMMIT_SHA,
  D6_D5_EVIDENCE_ARTIFACT_DIGEST,
  D6_D5_EVIDENCE_HEAD_SHA,
  D6_D3_WEBGPU_PRECISION_EVIDENCE_SHA256,
  D6_ORT_WEB_VERSION,
  D6_QUALITY_CORPUS_ID,
  D6_QUALITY_CORPUS_SHA256,
  D6_QUALITY_PROMPT_IDS,
  D6_QUALITY_SEEDS,
  D6_SCHEMA_VERSION,
  D6_WEBGPU_COMPONENTS,
  D6_WEBGPU_PRECISION,
  assessTinySdD6RealDeviceEvidence,
  canonicalizeTinySdD6EvidencePayload,
  validateHostedWebGpuNegativeControl,
} from '../scripts/tiny-sd-d6-accelerated-admission.mjs';

const now = Date.UTC(2026, 7, 26, 4, 30, 0);
const TESTED_COMMIT_SHA = '1'.repeat(40);

const hostedNegativeControl = () => ({
  status: 'CANDIDATE',
  stage: 'D3_BROWSER_WEBGPU_FP16',
  provider: 'webgpu',
  precisionTier: D6_WEBGPU_PRECISION,
  precisionEvidenceSha256: D6_D3_WEBGPU_PRECISION_EVIDENCE_SHA256,
  passCount: 0,
  hostedSoftwareFeasibilityOnly: true,
  realDeviceEvidence: false,
  providerFallbackAllowed: false,
  runtimeAuthorityGranted: false,
  productionDeviceApproval: false,
  productionApproval: false,
  components: Object.fromEntries(Object.keys(D6_WEBGPU_COMPONENTS).map(name => [name, {
    result: 'WEBGPU_SESSION_BLOCKED',
    blockerClass: 'REQUIRED_FEATURE_UNAVAILABLE',
    provider: 'webgpu',
    precisionTier: D6_WEBGPU_PRECISION,
    onnxruntimeWebVersion: D6_ORT_WEB_VERSION,
    modelSha256: D6_WEBGPU_COMPONENTS[name].sha256,
    modelBytes: D6_WEBGPU_COMPONENTS[name].size,
    requiredFeatures: ['shader-f16'],
    executionProviders: ['webgpu'],
    providerFallbackAllowed: false,
    hostedSoftwareFeasibilityOnly: true,
    realDeviceEvidence: false,
    runtimeAuthorityGranted: false,
    productionDeviceApproval: false,
    productionPromotionAllowed: false,
    missingRequiredFeatures: ['shader-f16'],
    adapter: { vendor: 'google', architecture: 'swiftshader', features: [], softwareAdapterLikely: true },
    networkDiagnostics: { externalHttpRequests: [], pageErrors: [] },
  }])),
});

const validDeviceEvidence = () => ({
  schemaVersion: D6_SCHEMA_VERSION,
  authority: D6_AUTHORITY,
  capturedAt: now - 60_000,
  expiresAt: now + 60_000,
  d5AcceptedCommitSha: D6_D5_ACCEPTED_COMMIT_SHA,
  d5EvidenceHeadSha: D6_D5_EVIDENCE_HEAD_SHA,
  d5EvidenceArtifactDigest: D6_D5_EVIDENCE_ARTIFACT_DIGEST,
  testedCommitSha: TESTED_COMMIT_SHA,
  precisionTier: D6_WEBGPU_PRECISION,
  attestation: {
    evidenceUrl: 'https://evidence.example.invalid/tiny-sd/d6/device.json',
    signatureUrl: 'https://evidence.example.invalid/tiny-sd/d6/device.json.sig',
  },
  device: {
    evidenceKind: 'REAL_PHYSICAL_DEVICE',
    platform: 'WINDOWS',
    deviceClass: 'DESKTOP',
    deviceTier: 'HIGH',
    coarseDeviceEvidenceKey: 'windows-desktop-gpu-x-v1',
    provider: 'webgpu',
    executionProviders: ['webgpu'],
    providerFallbackAllowed: false,
    adapterKind: 'PHYSICAL',
    softwareAdapter: false,
    vendor: 'vendor-x',
    architecture: 'gpu-x',
    description: 'physical adapter',
    runtimeName: 'onnxruntime-web',
    runtimeVersion: D6_ORT_WEB_VERSION,
    browserVersion: '151.0.7922.137',
    features: ['shader-f16'],
  },
  components: Object.fromEntries(Object.entries(D6_WEBGPU_COMPONENTS).map(([name, identity]) => [name, {
    ...identity,
    releaseIdentityPinned: false,
    identityPolicy: 'EXACT_D3_WEBGPU_CANDIDATE_BYTES_FOR_D6_EVIDENCE_NOT_RELEASE_AUTHORITY',
  }])),
  control: {
    schedulerClass: 'DPMSolverMultistepScheduler',
    algorithmType: 'dpmsolver++',
    solverOrder: 2,
    solverType: 'midpoint',
    tokenizerClass: 'CLIPTokenizer',
    modelMaxLength: 77,
    providerFallbackAllowed: false,
    promptCorpusId: D6_QUALITY_CORPUS_ID,
    seeds: [...D6_QUALITY_SEEDS],
    stepCount: 12,
    timesteps: [999, 916, 833, 749, 666, 583, 500, 416, 333, 250, 166, 83],
    guidanceScale: 7.5,
  },
  benchmark: {
    warmupCount: 1,
    sampleCount: 5,
    successfulSamples: 5,
    endToEndLatencyMs: { min: 5000, median: 5500, p95: 6200, max: 6300 },
    stageLatencyMs: {
      textEncoder: { min: 100, median: 110, p95: 120, max: 125 },
      unet: { min: 350, median: 380, p95: 420, max: 430 },
      vae: { min: 600, median: 650, p95: 700, max: 710 },
    },
    peakRamBytes: 'UNKNOWN',
    peakVramBytes: 'UNKNOWN',
    productClassification: 'ACCELERATED_INTERACTIVE_CANDIDATE',
    classificationRationale: 'Synthetic contract fixture only; real evidence must justify the same field.',
  },
  parity: {
    reference: 'CPU_ORT_SAME_D3_WEBGPU_CANDIDATE_AND_D5_CONTROL_SEMANTICS',
    passed: true,
    calibratedFromIndependentRealDeviceRuns: true,
    limitsId: 'tiny-sd-d6-webgpu-parity-v1',
    numericGateCount: 16,
    allNumericGatesPassed: true,
  },
  quality: {
    corpusId: D6_QUALITY_CORPUS_ID,
    corpusEvidenceUrl: 'https://evidence.example.invalid/tiny-sd/d6/corpus.json',
    corpusSha256: D6_QUALITY_CORPUS_SHA256,
    cases: D6_QUALITY_PROMPT_IDS.flatMap((promptId, promptIndex) => D6_QUALITY_SEEDS.map((seed, seedIndex) => ({
      caseId: `${promptId}-${seed}`,
      promptId,
      seed,
      outputImageSha256: `${(promptIndex * D6_QUALITY_SEEDS.length + seedIndex + 1).toString(16).padStart(64, '0')}`,
      humanDecision: 'PASS',
      failureCategories: [],
    }))),
    reviewer: {
      reviewerId: 'reviewer-1',
      reviewedAt: now - 30_000,
      decision: 'PASS',
      reviewEvidenceUrl: 'https://evidence.example.invalid/tiny-sd/d6/review.json',
      reviewSha256: 'b'.repeat(64),
    },
  },
  localExecution: {
    executionTarget: 'LOCAL',
    externalModelRuntimeHttpRequests: 0,
    providerApiCalls: 0,
    aiCreditsConsumed: 0,
  },
  productionApproval: false,
  editorAuthorityGranted: false,
  releaseAuthorityGranted: false,
  cloudFallbackAllowed: false,
  billingAuthorityGranted: false,
});

const verifierFor = evidence => {
  const expectedPayload = canonicalizeTinySdD6EvidencePayload(evidence);
  return ({ canonicalPayload, attestation }) => ({
    verified: canonicalPayload === expectedPayload
      && attestation?.evidenceUrl === evidence.attestation.evidenceUrl
      && attestation?.signatureUrl === evidence.attestation.signatureUrl,
  });
};

const assessTrusted = evidence => assessTinySdD6RealDeviceEvidence(evidence, {
  expectedTestedCommitSha: TESTED_COMMIT_SHA,
  trustVerifier: verifierFor(evidence),
  now,
});

test('hosted SwiftShader is accepted only as a blocked negative control', async () => {
  const result = validateHostedWebGpuNegativeControl(hostedNegativeControl());
  assert.equal(result.acceptedNegativeControl, true);
  assert.equal(result.realDeviceAdmission, false);
});

test('complete physical WebGPU evidence can satisfy the contract without production authority', async () => {
  const evidence = validDeviceEvidence();
  const result = await assessTinySdD6RealDeviceEvidence(evidence, {
    expectedTestedCommitSha: TESTED_COMMIT_SHA,
    trustVerifier: async input => verifierFor(evidence)(input),
    now,
  });
  assert.equal(result.eligible, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(result.productionApproval, false);
  assert.equal(result.editorAuthorityGranted, false);
  assert.equal(result.releaseAuthorityGranted, false);
});

test('D6 is bound to accepted D5 commit, exact D5 evidence head and fresh artifact digest', async () => {
  const evidence = validDeviceEvidence();
  evidence.d5EvidenceArtifactDigest = `sha256:${'f'.repeat(64)}`;
  const result = await assessTrusted(evidence);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('D5_ROOT_DRIFT'));
});

test('tested commit must exactly match the trusted caller expectation', async () => {
  const evidence = validDeviceEvidence();
  evidence.testedCommitSha = '2'.repeat(40);
  const result = await assessTinySdD6RealDeviceEvidence(evidence, {
    expectedTestedCommitSha: TESTED_COMMIT_SHA,
    trustVerifier: verifierFor(evidence),
    now,
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('TESTED_COMMIT_DRIFT'));
});

test('missing expected tested commit fails closed even with a valid payload verifier', async () => {
  const evidence = validDeviceEvidence();
  const result = await assessTinySdD6RealDeviceEvidence(evidence, {
    trustVerifier: verifierFor(evidence),
    now,
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('TESTED_COMMIT_DRIFT'));
});

test('detached attestationVerified boolean cannot grant trust', async () => {
  const evidence = validDeviceEvidence();
  const result = await assessTinySdD6RealDeviceEvidence(evidence, {
    expectedTestedCommitSha: TESTED_COMMIT_SHA,
    attestationVerified: true,
    now,
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('ATTESTATION_UNVERIFIED'));
});

test('attestation verifier is bound to the exact canonical assessed payload', async () => {
  const evidence = validDeviceEvidence();
  const verifier = verifierFor(evidence);
  evidence.device.vendor = 'different-physical-vendor';
  const result = await assessTinySdD6RealDeviceEvidence(evidence, {
    expectedTestedCommitSha: TESTED_COMMIT_SHA,
    trustVerifier: verifier,
    now,
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('ATTESTATION_UNVERIFIED'));
});

test('canonical payload excludes only attestation and is stable across object key order', async () => {
  const evidence = validDeviceEvidence();
  const canonical = canonicalizeTinySdD6EvidencePayload(evidence);
  const reordered = Object.fromEntries(Object.entries(evidence).reverse());
  reordered.attestation = { ...evidence.attestation, extraTransportMetadata: 'ignored-by-payload' };
  assert.equal(canonicalizeTinySdD6EvidencePayload(reordered), canonical);
  assert.doesNotMatch(canonical, /signatureUrl/);
  assert.match(canonical, new RegExp(TESTED_COMMIT_SHA));
});

test('assessment snapshots untrusted evidence before signature and semantic validation', async () => {
  const signedEvidence = validDeviceEvidence();
  signedEvidence.device.softwareAdapter = true;
  const signedPayload = canonicalizeTinySdD6EvidencePayload(signedEvidence);

  const evidence = validDeviceEvidence();
  let softwareAdapterReads = 0;
  Object.defineProperty(evidence.device, 'softwareAdapter', {
    enumerable: true,
    configurable: true,
    get() {
      softwareAdapterReads += 1;
      return softwareAdapterReads <= 2;
    },
  });

  const result = await assessTinySdD6RealDeviceEvidence(evidence, {
    expectedTestedCommitSha: TESTED_COMMIT_SHA,
    trustVerifier: ({ canonicalPayload }) => ({ verified: canonicalPayload === signedPayload }),
    now,
  });

  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('SOFTWARE_OR_UNKNOWN_ADAPTER'));
  assert.equal(softwareAdapterReads, 1, 'untrusted getter must be read only once into the immutable assessment snapshot');
});

test('software adapter spoofing and missing shader-f16 fail closed', async () => {
  const evidence = validDeviceEvidence();
  evidence.device.softwareAdapter = true;
  evidence.device.adapterKind = 'SOFTWARE';
  evidence.device.architecture = 'swiftshader';
  evidence.device.features = [];
  const result = await assessTrusted(evidence);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('SOFTWARE_OR_UNKNOWN_ADAPTER'));
  assert.ok(result.blockers.includes('REQUIRED_FEATURE_MISSING'));
});

test('known Mesa software renderers cannot masquerade as physical adapters', async () => {
  for (const softwareName of ['llvmpipe', 'lavapipe']) {
    const evidence = validDeviceEvidence();
    evidence.device.vendor = 'Mesa';
    evidence.device.architecture = softwareName;
    evidence.device.description = `${softwareName} renderer`;
    evidence.device.softwareAdapter = false;
    evidence.device.adapterKind = 'PHYSICAL';
    const result = await assessTrusted(evidence);
    assert.equal(result.eligible, false);
    assert.ok(result.blockers.includes('SOFTWARE_OR_UNKNOWN_ADAPTER'));
  }
});

test('device identifier alone cannot hide a software renderer', async () => {
  const evidence = validDeviceEvidence();
  evidence.device.device = 'ANGLE (Mesa, llvmpipe)';
  evidence.device.softwareAdapter = false;
  evidence.device.adapterKind = 'PHYSICAL';
  const result = await assessTrusted(evidence);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('SOFTWARE_OR_UNKNOWN_ADAPTER'));
});

test('sparse evidence arrays are rejected before signing or semantic validation', async () => {
  const evidence = validDeviceEvidence();
  evidence.control.timesteps = new Array(evidence.control.stepCount);
  let verifierCalled = false;
  const result = await assessTinySdD6RealDeviceEvidence(evidence, {
    expectedTestedCommitSha: TESTED_COMMIT_SHA,
    trustVerifier: () => {
      verifierCalled = true;
      return { verified: true };
    },
    now,
  });
  assert.equal(result.eligible, false);
  assert.deepEqual(result.blockers, ['INVALID_CANONICAL_PAYLOAD']);
  assert.equal(verifierCalled, false);
});

test('snapshotting arrays does not call input-controlled map methods', async () => {
  const evidence = validDeviceEvidence();
  let mapCalled = false;
  Object.defineProperty(evidence.control.timesteps, 'map', {
    enumerable: false,
    value() {
      mapCalled = true;
      throw new Error('input-controlled map must not run');
    },
  });
  const result = await assessTrusted(evidence);
  assert.equal(result.eligible, true);
  assert.equal(mapCalled, false);
});

test('provider fallback, cloud usage and authority escalation fail closed', async () => {
  const evidence = validDeviceEvidence();
  evidence.device.executionProviders = ['webgpu', 'wasm'];
  evidence.device.providerFallbackAllowed = true;
  evidence.localExecution.externalModelRuntimeHttpRequests = 1;
  evidence.localExecution.providerApiCalls = 1;
  evidence.localExecution.aiCreditsConsumed = 3;
  evidence.productionApproval = true;
  const result = await assessTrusted(evidence);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('PROVIDER_FALLBACK_OR_DRIFT'));
  assert.ok(result.blockers.includes('NON_LOCAL_EXECUTION_DETECTED'));
  assert.ok(result.blockers.includes('AUTHORITY_ESCALATION'));
});

test('wrong candidate identity and missing verifier are rejected independently', async () => {
  const evidence = validDeviceEvidence();
  evidence.components.unet.sha256 = 'f'.repeat(64);
  const result = await assessTinySdD6RealDeviceEvidence(evidence, {
    expectedTestedCommitSha: TESTED_COMMIT_SHA,
    now,
  });
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('WRONG_MODEL_IDENTITY'));
  assert.ok(result.blockers.includes('ATTESTATION_UNVERIFIED'));
});

test('short D5-style three-step fixture cannot masquerade as practical quality evidence', async () => {
  const evidence = validDeviceEvidence();
  evidence.control.stepCount = 3;
  evidence.quality.cases = evidence.quality.cases.slice(0, 3);
  evidence.quality.reviewer.decision = 'NOT_REVIEWED';
  const result = await assessTrusted(evidence);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('PRACTICAL_GENERATION_PROTOCOL_REQUIRED'));
  assert.ok(result.blockers.includes('QUALITY_REVIEW_REQUIRED'));
  assert.ok(result.blockers.includes('HUMAN_REVIEW_REQUIRED'));
});

test('stale evidence, fabricated memory and incomplete device identity are rejected independently', async () => {
  const evidence = validDeviceEvidence();
  evidence.capturedAt = now - (31 * 24 * 60 * 60 * 1000);
  evidence.expiresAt = now + 60_000;
  evidence.device.coarseDeviceEvidenceKey = '';
  evidence.benchmark.peakRamBytes = '8GB';
  const result = await assessTrusted(evidence);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('INVALID_TIME'));
  assert.ok(result.blockers.includes('STALE_EVIDENCE'));
  assert.ok(result.blockers.includes('INCOMPLETE_DEVICE_IDENTITY'));
  assert.ok(result.blockers.includes('INVALID_MEMORY_EVIDENCE'));
});

test('quality evidence must be hash-bound to the exact practical prompt corpus', async () => {
  const evidence = validDeviceEvidence();
  evidence.quality.corpusId = 'different-corpus';
  evidence.quality.corpusSha256 = 'not-a-sha';
  evidence.quality.reviewer.reviewSha256 = 'not-a-sha';
  const result = await assessTrusted(evidence);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('QUALITY_REVIEW_REQUIRED'));
  assert.ok(result.blockers.includes('HUMAN_REVIEW_REQUIRED'));
  assert.ok(result.blockers.includes('EVIDENCE_BINDING_MISMATCH'));
});

test('quality matrix cannot duplicate easy cases while omitting required prompt-seed entries', async () => {
  const evidence = validDeviceEvidence();
  const duplicate = { ...evidence.quality.cases[0], caseId: 'duplicate-easy-case' };
  evidence.quality.cases[evidence.quality.cases.length - 1] = duplicate;
  const result = await assessTrusted(evidence);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('QUALITY_REVIEW_REQUIRED'));
});

test('runtime identity and platform-device-class pairing are exact admission inputs', async () => {
  const evidence = validDeviceEvidence();
  evidence.device.runtimeName = 'different-runtime';
  evidence.device.runtimeVersion = '1.28.0';
  evidence.device.platform = 'ANDROID';
  evidence.device.deviceClass = 'DESKTOP';
  const result = await assessTrusted(evidence);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('RUNTIME_IDENTITY_DRIFT'));
  assert.ok(result.blockers.includes('INCOMPLETE_DEVICE_IDENTITY'));
});

test('human review must follow device capture and cannot be future-dated', async () => {
  const beforeCapture = validDeviceEvidence();
  beforeCapture.quality.reviewer.reviewedAt = beforeCapture.capturedAt - 1;
  const first = await assessTrusted(beforeCapture);
  assert.equal(first.eligible, false);
  assert.ok(first.blockers.includes('HUMAN_REVIEW_REQUIRED'));

  const future = validDeviceEvidence();
  future.quality.reviewer.reviewedAt = now + 1;
  const second = await assessTrusted(future);
  assert.equal(second.eligible, false);
  assert.ok(second.blockers.includes('HUMAN_REVIEW_REQUIRED'));
});

test('quality evidence cannot reuse case identities or output hashes even with a complete matrix', async () => {
  const evidence = validDeviceEvidence();
  evidence.quality.cases[1].caseId = evidence.quality.cases[0].caseId;
  evidence.quality.cases[1].outputImageSha256 = evidence.quality.cases[0].outputImageSha256;
  const result = await assessTrusted(evidence);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('QUALITY_REVIEW_REQUIRED'));
});
