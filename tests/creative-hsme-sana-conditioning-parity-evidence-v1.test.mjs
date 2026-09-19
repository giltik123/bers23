import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  HSME_SANA_CONDITIONING_PARITY_EVIDENCE_V1_SCHEMA,
  HSME_SANA_CONDITIONING_PARITY_PLAN_V1_SCHEMA,
  HSME_SANA_CONDITIONING_PARITY_QUALITY_POLICY,
  hsmeSanaConditioningGenerationV1Digest,
  hsmeSanaConditioningParityPlanV1Digest,
  normalizeHsmeSanaConditioningParityPlanV1,
  proveHsmeSanaConditioningParityEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeSanaConditioningParityEvidenceV1.ts';

const H = char => char.repeat(64);
const R = char => char.repeat(40);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

function identity(sourceRoot, revisionChar, hashChar) {
  return { sourceRoot, immutableRevision: R(revisionChar), contentSha256: H(hashChar) };
}

function parityPlan(rights = { status: 'EVIDENCE_RUN_ALLOWED', evidenceSha256: H('e') }) {
  return {
    schemaVersion: HSME_SANA_CONDITIONING_PARITY_PLAN_V1_SCHEMA,
    candidateId: 'sana-sprint-0.6b-exact-conditioning-parity',
    qualityPolicy: HSME_SANA_CONDITIONING_PARITY_QUALITY_POLICY,
    phase0EnvelopeDigest: H('0'),
    sanaSnapshot: identity('Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers', 'a', '1'),
    transformer: identity('Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers', 'a', '2'),
    vae: identity('Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers', 'a', '3'),
    scheduler: identity('Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers', 'a', '4'),
    textEncoder: identity('google/gemma-2-2b-it', 'b', '5'),
    tokenizer: identity('google/gemma-2-2b-it', 'b', '6'),
    diffusersRuntime: identity('huggingface/diffusers', 'c', '7'),
    transformersRuntime: identity('huggingface/transformers', 'd', '8'),
    torchRuntime: identity('pytorch/pytorch', 'e', '9'),
    runtimeLockSha256: H('a'),
    promptCommitmentKeyId: 'test-hsme-sana-parity-key-v1',
    promptCommitmentHmacSha256: H('b'),
    generation: {
      width: 1024,
      height: 1024,
      inferenceSteps: 2,
      seed: 424242,
      latentSha256: H('c'),
      schedulerTimestepsSha256: H('d'),
      guidanceScaleMilli: 4500,
      transformerDtype: 'BF16',
      textEncoderDtype: 'BF16',
      vaeDtype: 'BF16',
      executionProvider: 'CUDA_SAME_DEVICE',
    },
    parityPolicy: {
      embeddingBytes: 'EXACT_SHA256',
      attentionMaskBytes: 'EXACT_SHA256',
      generationConfig: 'EXACT_CANONICAL_DIGEST',
      imageOutput: 'EXACT_SHA256_SAME_BACKEND',
      postObservationThresholdChangesAllowed: false,
    },
    rights,
    rawPromptPersisted: false,
    modelRepositoryCodeExecutionAllowed: false,
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    billingAuthorityGranted: false,
    projectArtifactMutationAllowed: false,
    binaryArtifactsPublishable: false,
  };
}

async function exactEvidence(rawPlan, outcome = 'EXACT_PARITY_PASS') {
  return {
    schemaVersion: HSME_SANA_CONDITIONING_PARITY_EVIDENCE_V1_SCHEMA,
    planDigest: await hsmeSanaConditioningParityPlanV1Digest(rawPlan, hashPort),
    phase0EnvelopeDigest: rawPlan.phase0EnvelopeDigest,
    generationConfigSha256: await hsmeSanaConditioningGenerationV1Digest(rawPlan, hashPort),
    referenceEmbeddingSha256: H('1'),
    transportedEmbeddingSha256: H('1'),
    referenceMaskSha256: H('2'),
    transportedMaskSha256: H('2'),
    referenceImageSha256: H('3'),
    splitImageSha256: H('3'),
    referenceTextEncoderInvocations: 1,
    splitTextEncoderInvocations: 0,
    outcome,
    binaryArtifactsPublished: false,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

async function expectAsyncCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code, `expected ${code}`);
}

test('plan fixes quality-first exact parity before real evidence is observed', () => {
  const normalized = normalizeHsmeSanaConditioningParityPlanV1(parityPlan());
  assert.equal(normalized.qualityPolicy, 'QUALITY_FLOOR_BEFORE_EFFICIENCY');
  assert.equal(normalized.parityPolicy.imageOutput, 'EXACT_SHA256_SAME_BACKEND');
  assert.equal(normalized.parityPolicy.postObservationThresholdChangesAllowed, false);
});

test('numeric or post-observation threshold substitution is not representable in V1', () => {
  const raw = parityPlan();
  raw.parityPolicy.imageOutput = 'LPIPS_LT_0.2';
  expectCode(() => normalizeHsmeSanaConditioningParityPlanV1(raw), 'hsme_sana_parity_image_policy_invalid');

  const raw2 = parityPlan();
  raw2.parityPolicy.postObservationThresholdChangesAllowed = true;
  expectCode(() => normalizeHsmeSanaConditioningParityPlanV1(raw2), 'hsme_sana_parity_threshold_mutation_forbidden');
});

test('every model/runtime identity requires an immutable 40/64 hex revision', () => {
  const raw = parityPlan();
  raw.textEncoder.immutableRevision = 'main';
  expectCode(() => normalizeHsmeSanaConditioningParityPlanV1(raw), 'hsme_sana_parity_revision_invalid');
});

test('resolved rights state cannot omit evidence', () => {
  const raw = parityPlan({ status: 'EVIDENCE_RUN_ALLOWED', evidenceSha256: 'UNKNOWN' });
  expectCode(() => normalizeHsmeSanaConditioningParityPlanV1(raw), 'hsme_sana_parity_rights_evidence_missing');
});

test('authority, raw prompt, remote repository code and binary publication remain fail closed', () => {
  for (const [field, code] of [
    ['rawPromptPersisted', 'hsme_sana_parity_raw_prompt_forbidden'],
    ['modelRepositoryCodeExecutionAllowed', 'hsme_sana_parity_remote_code_forbidden'],
    ['productionAuthorityGranted', 'hsme_sana_parity_production_authority_forbidden'],
    ['providerAuthorityGranted', 'hsme_sana_parity_provider_authority_forbidden'],
    ['billingAuthorityGranted', 'hsme_sana_parity_billing_authority_forbidden'],
    ['projectArtifactMutationAllowed', 'hsme_sana_parity_project_mutation_forbidden'],
    ['binaryArtifactsPublishable', 'hsme_sana_parity_binary_publication_forbidden'],
  ]) {
    const raw = parityPlan();
    raw[field] = true;
    expectCode(() => normalizeHsmeSanaConditioningParityPlanV1(raw), code);
  }
});

test('generation seed participates in the canonical plan digest', async () => {
  const left = parityPlan();
  const right = parityPlan();
  right.generation.seed += 1;
  assert.notEqual(
    await hsmeSanaConditioningParityPlanV1Digest(left, hashPort),
    await hsmeSanaConditioningParityPlanV1Digest(right, hashPort),
  );
});

test('exact parity accepts only identical conditioning, config and image with zero split conditioner calls', async () => {
  const rawPlan = parityPlan();
  const evidence = await exactEvidence(rawPlan);
  const proof = await proveHsmeSanaConditioningParityEvidenceV1(rawPlan, evidence, hashPort);
  assert.equal(proof.outcome, 'EXACT_PARITY_PASS');
  assert.equal(proof.conditioningExact, true);
  assert.equal(proof.generationConfigExact, true);
  assert.equal(proof.imageExact, true);
  assert.equal(proof.splitGenerationTextEncoderFree, true);
  assert.equal(proof.exactParityAccepted, true);
});

test('a forged exact pass cannot hide text encoder execution on the split generation path', async () => {
  const rawPlan = parityPlan();
  const evidence = await exactEvidence(rawPlan);
  evidence.splitTextEncoderInvocations = 1;
  await expectAsyncCode(
    proveHsmeSanaConditioningParityEvidenceV1(rawPlan, evidence, hashPort),
    'hsme_sana_parity_split_text_encoder_invoked',
  );
});

test('conditioning mismatch requires measured unequal embedding or mask digests', async () => {
  const rawPlan = parityPlan();
  const evidence = await exactEvidence(rawPlan, 'CONDITIONING_MISMATCH');
  await expectAsyncCode(
    proveHsmeSanaConditioningParityEvidenceV1(rawPlan, evidence, hashPort),
    'hsme_sana_parity_conditioning_mismatch_not_proven',
  );

  evidence.transportedEmbeddingSha256 = H('4');
  const proof = await proveHsmeSanaConditioningParityEvidenceV1(rawPlan, evidence, hashPort);
  assert.equal(proof.outcome, 'CONDITIONING_MISMATCH');
  assert.equal(proof.conditioningExact, false);
});

test('generation parity failure is valid only after exact conditioning and exact config', async () => {
  const rawPlan = parityPlan();
  const evidence = await exactEvidence(rawPlan, 'GENERATION_PARITY_FAIL');
  evidence.splitImageSha256 = H('4');
  const proof = await proveHsmeSanaConditioningParityEvidenceV1(rawPlan, evidence, hashPort);
  assert.equal(proof.conditioningExact, true);
  assert.equal(proof.generationConfigExact, true);
  assert.equal(proof.imageExact, false);
  assert.equal(proof.exactParityAccepted, false);
});

test('evidence cannot be rebound to another Phase-0 envelope', async () => {
  const rawPlan = parityPlan();
  const evidence = await exactEvidence(rawPlan);
  evidence.phase0EnvelopeDigest = H('f');
  await expectAsyncCode(
    proveHsmeSanaConditioningParityEvidenceV1(rawPlan, evidence, hashPort),
    'hsme_sana_parity_phase0_digest_mismatch',
  );
});

test('real evidence stays fail closed while rights remain unresolved', async () => {
  const rawPlan = parityPlan({ status: 'UNRESOLVED', evidenceSha256: 'UNKNOWN' });
  const evidence = await exactEvidence(rawPlan);
  await expectAsyncCode(
    proveHsmeSanaConditioningParityEvidenceV1(rawPlan, evidence, hashPort),
    'hsme_sana_parity_rights_not_admitted',
  );
});

test('rights-blocked outcome cannot claim model execution', async () => {
  const rawPlan = parityPlan({ status: 'BLOCKED', evidenceSha256: H('e') });
  const evidence = {
    schemaVersion: HSME_SANA_CONDITIONING_PARITY_EVIDENCE_V1_SCHEMA,
    planDigest: await hsmeSanaConditioningParityPlanV1Digest(rawPlan, hashPort),
    phase0EnvelopeDigest: rawPlan.phase0EnvelopeDigest,
    generationConfigSha256: 'UNKNOWN',
    referenceEmbeddingSha256: 'UNKNOWN',
    transportedEmbeddingSha256: 'UNKNOWN',
    referenceMaskSha256: 'UNKNOWN',
    transportedMaskSha256: 'UNKNOWN',
    referenceImageSha256: 'UNKNOWN',
    splitImageSha256: 'UNKNOWN',
    referenceTextEncoderInvocations: 0,
    splitTextEncoderInvocations: 0,
    outcome: 'RIGHTS_BLOCKED',
    binaryArtifactsPublished: false,
  };
  const proof = await proveHsmeSanaConditioningParityEvidenceV1(rawPlan, evidence, hashPort);
  assert.equal(proof.outcome, 'RIGHTS_BLOCKED');
  assert.equal(proof.exactParityAccepted, false);
});

test('unknown raw prompt fields and binary evidence publication are forbidden', async () => {
  const raw = parityPlan();
  raw.rawPrompt = 'must never enter parity evidence';
  expectCode(() => normalizeHsmeSanaConditioningParityPlanV1(raw), 'hsme_sana_parity_field_unknown');

  const rawPlan = parityPlan();
  const evidence = await exactEvidence(rawPlan);
  evidence.binaryArtifactsPublished = true;
  await expectAsyncCode(
    proveHsmeSanaConditioningParityEvidenceV1(rawPlan, evidence, hashPort),
    'hsme_sana_parity_binary_evidence_forbidden',
  );
});
