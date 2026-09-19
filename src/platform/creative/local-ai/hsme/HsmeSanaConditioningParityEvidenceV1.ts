export const HSME_SANA_CONDITIONING_PARITY_PLAN_V1_SCHEMA = 'BERS_HSME_SANA_CONDITIONING_PARITY_PLAN_V1' as const;
export const HSME_SANA_CONDITIONING_PARITY_EVIDENCE_V1_SCHEMA = 'BERS_HSME_SANA_CONDITIONING_PARITY_EVIDENCE_V1' as const;
export const HSME_SANA_CONDITIONING_PARITY_QUALITY_POLICY = 'QUALITY_FLOOR_BEFORE_EFFICIENCY' as const;
export const HSME_SANA_CONDITIONING_PARITY_DIGEST_DOMAIN = 'bers:hsme:sana-conditioning-parity-plan:v1\0' as const;
export const HSME_SANA_CONDITIONING_GENERATION_DIGEST_DOMAIN = 'bers:hsme:sana-conditioning-generation:v1\0' as const;

const HEX64 = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const RIGHTS = Object.freeze(['UNRESOLVED', 'EVIDENCE_RUN_ALLOWED', 'BLOCKED'] as const);
const PROVIDERS = Object.freeze(['CUDA_SAME_DEVICE', 'CPU_SAME_HOST'] as const);
const VAE_DTYPES = Object.freeze(['BF16', 'FP32'] as const);
const OUTCOMES = Object.freeze([
  'EVIDENCE_PENDING',
  'EXACT_PARITY_PASS',
  'CONDITIONING_MISMATCH',
  'GENERATION_PARITY_FAIL',
  'RIGHTS_BLOCKED',
  'RUNTIME_BLOCKED',
] as const);

export type HsmeSanaConditioningParityIdentityV1 = Readonly<{
  sourceRoot: string;
  immutableRevision: string;
  contentSha256: string;
}>;

export type HsmeSanaConditioningParityGenerationV1 = Readonly<{
  width: 1024;
  height: 1024;
  inferenceSteps: number;
  seed: number;
  latentSha256: string;
  schedulerTimestepsSha256: string;
  guidanceScaleMilli: number;
  transformerDtype: 'BF16';
  textEncoderDtype: 'BF16';
  vaeDtype: typeof VAE_DTYPES[number];
  executionProvider: typeof PROVIDERS[number];
}>;

export type HsmeSanaConditioningParityPlanV1 = Readonly<{
  schemaVersion: typeof HSME_SANA_CONDITIONING_PARITY_PLAN_V1_SCHEMA;
  candidateId: 'sana-sprint-0.6b-exact-conditioning-parity';
  qualityPolicy: typeof HSME_SANA_CONDITIONING_PARITY_QUALITY_POLICY;
  phase0EnvelopeDigest: string;
  sanaSnapshot: HsmeSanaConditioningParityIdentityV1;
  transformer: HsmeSanaConditioningParityIdentityV1;
  vae: HsmeSanaConditioningParityIdentityV1;
  scheduler: HsmeSanaConditioningParityIdentityV1;
  textEncoder: HsmeSanaConditioningParityIdentityV1;
  tokenizer: HsmeSanaConditioningParityIdentityV1;
  diffusersRuntime: HsmeSanaConditioningParityIdentityV1;
  transformersRuntime: HsmeSanaConditioningParityIdentityV1;
  torchRuntime: HsmeSanaConditioningParityIdentityV1;
  runtimeLockSha256: string;
  promptCommitmentKeyId: string;
  promptCommitmentHmacSha256: string;
  generation: HsmeSanaConditioningParityGenerationV1;
  parityPolicy: Readonly<{
    embeddingBytes: 'EXACT_SHA256';
    attentionMaskBytes: 'EXACT_SHA256';
    generationConfig: 'EXACT_CANONICAL_DIGEST';
    imageOutput: 'EXACT_SHA256_SAME_BACKEND';
    postObservationThresholdChangesAllowed: false;
  }>;
  rights: Readonly<{
    status: typeof RIGHTS[number];
    evidenceSha256: string | 'UNKNOWN';
  }>;
  rawPromptPersisted: false;
  modelRepositoryCodeExecutionAllowed: false;
  productionAuthorityGranted: false;
  providerAuthorityGranted: false;
  billingAuthorityGranted: false;
  projectArtifactMutationAllowed: false;
  binaryArtifactsPublishable: false;
}>;

export type HsmeSanaConditioningParityEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_SANA_CONDITIONING_PARITY_EVIDENCE_V1_SCHEMA;
  planDigest: string;
  phase0EnvelopeDigest: string;
  generationConfigSha256: string | 'UNKNOWN';
  referenceEmbeddingSha256: string | 'UNKNOWN';
  transportedEmbeddingSha256: string | 'UNKNOWN';
  referenceMaskSha256: string | 'UNKNOWN';
  transportedMaskSha256: string | 'UNKNOWN';
  referenceImageSha256: string | 'UNKNOWN';
  splitImageSha256: string | 'UNKNOWN';
  referenceTextEncoderInvocations: number;
  splitTextEncoderInvocations: number;
  outcome: typeof OUTCOMES[number];
  binaryArtifactsPublished: false;
}>;

export type HsmeSanaConditioningParityProofV1 = Readonly<{
  planDigest: string;
  generationConfigSha256: string;
  outcome: typeof OUTCOMES[number];
  conditioningExact: boolean;
  generationConfigExact: boolean;
  imageExact: boolean;
  splitGenerationTextEncoderFree: boolean;
  exactParityAccepted: boolean;
}>;

export interface HsmeSanaConditioningParityHashPortV1 {
  sha256(bytes: Uint8Array): Promise<string>;
}

export class HsmeSanaConditioningParityV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeSanaConditioningParityV1Error';
    this.code = code;
  }
}

/**
 * Evidence-only plan for the first real same-backend SANA split-conditioning
 * comparison. V1 deliberately admits exact parity only; a numerical tolerance
 * requires a separately reviewed future policy committed before observing output.
 */
export function normalizeHsmeSanaConditioningParityPlanV1(raw: unknown): HsmeSanaConditioningParityPlanV1 {
  const record = exactRecord(raw, [
    'schemaVersion', 'candidateId', 'qualityPolicy', 'phase0EnvelopeDigest',
    'sanaSnapshot', 'transformer', 'vae', 'scheduler', 'textEncoder', 'tokenizer',
    'diffusersRuntime', 'transformersRuntime', 'torchRuntime', 'runtimeLockSha256',
    'promptCommitmentKeyId', 'promptCommitmentHmacSha256', 'generation', 'parityPolicy',
    'rights', 'rawPromptPersisted', 'modelRepositoryCodeExecutionAllowed',
    'productionAuthorityGranted', 'providerAuthorityGranted', 'billingAuthorityGranted',
    'projectArtifactMutationAllowed', 'binaryArtifactsPublishable',
  ], [
    'schemaVersion', 'candidateId', 'qualityPolicy', 'phase0EnvelopeDigest',
    'sanaSnapshot', 'transformer', 'vae', 'scheduler', 'textEncoder', 'tokenizer',
    'diffusersRuntime', 'transformersRuntime', 'torchRuntime', 'runtimeLockSha256',
    'promptCommitmentKeyId', 'promptCommitmentHmacSha256', 'generation', 'parityPolicy',
    'rights', 'rawPromptPersisted', 'modelRepositoryCodeExecutionAllowed',
    'productionAuthorityGranted', 'providerAuthorityGranted', 'billingAuthorityGranted',
    'projectArtifactMutationAllowed', 'binaryArtifactsPublishable',
  ], 'plan');

  if (record.schemaVersion !== HSME_SANA_CONDITIONING_PARITY_PLAN_V1_SCHEMA) {
    fail('hsme_sana_parity_schema_unsupported', 'unsupported parity plan schema');
  }
  if (record.candidateId !== 'sana-sprint-0.6b-exact-conditioning-parity') {
    fail('hsme_sana_parity_candidate_invalid', 'candidateId must identify the exact SANA-Sprint parity experiment');
  }
  if (record.qualityPolicy !== HSME_SANA_CONDITIONING_PARITY_QUALITY_POLICY) {
    fail('hsme_sana_parity_quality_policy_invalid', 'quality floor must precede efficiency');
  }

  const parityPolicy = normalizeParityPolicy(record.parityPolicy);
  const rights = normalizeRights(record.rights);

  assertFalse(record.rawPromptPersisted, 'rawPromptPersisted', 'hsme_sana_parity_raw_prompt_forbidden');
  assertFalse(record.modelRepositoryCodeExecutionAllowed, 'modelRepositoryCodeExecutionAllowed', 'hsme_sana_parity_remote_code_forbidden');
  assertFalse(record.productionAuthorityGranted, 'productionAuthorityGranted', 'hsme_sana_parity_production_authority_forbidden');
  assertFalse(record.providerAuthorityGranted, 'providerAuthorityGranted', 'hsme_sana_parity_provider_authority_forbidden');
  assertFalse(record.billingAuthorityGranted, 'billingAuthorityGranted', 'hsme_sana_parity_billing_authority_forbidden');
  assertFalse(record.projectArtifactMutationAllowed, 'projectArtifactMutationAllowed', 'hsme_sana_parity_project_mutation_forbidden');
  assertFalse(record.binaryArtifactsPublishable, 'binaryArtifactsPublishable', 'hsme_sana_parity_binary_publication_forbidden');

  return deepFreeze({
    schemaVersion: HSME_SANA_CONDITIONING_PARITY_PLAN_V1_SCHEMA,
    candidateId: 'sana-sprint-0.6b-exact-conditioning-parity',
    qualityPolicy: HSME_SANA_CONDITIONING_PARITY_QUALITY_POLICY,
    phase0EnvelopeDigest: sha256(record.phase0EnvelopeDigest, 'plan.phase0EnvelopeDigest'),
    sanaSnapshot: normalizeIdentity(record.sanaSnapshot, 'plan.sanaSnapshot'),
    transformer: normalizeIdentity(record.transformer, 'plan.transformer'),
    vae: normalizeIdentity(record.vae, 'plan.vae'),
    scheduler: normalizeIdentity(record.scheduler, 'plan.scheduler'),
    textEncoder: normalizeIdentity(record.textEncoder, 'plan.textEncoder'),
    tokenizer: normalizeIdentity(record.tokenizer, 'plan.tokenizer'),
    diffusersRuntime: normalizeIdentity(record.diffusersRuntime, 'plan.diffusersRuntime'),
    transformersRuntime: normalizeIdentity(record.transformersRuntime, 'plan.transformersRuntime'),
    torchRuntime: normalizeIdentity(record.torchRuntime, 'plan.torchRuntime'),
    runtimeLockSha256: sha256(record.runtimeLockSha256, 'plan.runtimeLockSha256'),
    promptCommitmentKeyId: boundedString(record.promptCommitmentKeyId, 'plan.promptCommitmentKeyId', 128),
    promptCommitmentHmacSha256: sha256(record.promptCommitmentHmacSha256, 'plan.promptCommitmentHmacSha256'),
    generation: normalizeGeneration(record.generation),
    parityPolicy,
    rights,
    rawPromptPersisted: false,
    modelRepositoryCodeExecutionAllowed: false,
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    billingAuthorityGranted: false,
    projectArtifactMutationAllowed: false,
    binaryArtifactsPublishable: false,
  });
}

export function normalizeHsmeSanaConditioningParityEvidenceV1(raw: unknown): HsmeSanaConditioningParityEvidenceV1 {
  const record = exactRecord(raw, [
    'schemaVersion', 'planDigest', 'phase0EnvelopeDigest', 'generationConfigSha256',
    'referenceEmbeddingSha256', 'transportedEmbeddingSha256', 'referenceMaskSha256',
    'transportedMaskSha256', 'referenceImageSha256', 'splitImageSha256',
    'referenceTextEncoderInvocations', 'splitTextEncoderInvocations', 'outcome',
    'binaryArtifactsPublished',
  ], [
    'schemaVersion', 'planDigest', 'phase0EnvelopeDigest', 'generationConfigSha256',
    'referenceEmbeddingSha256', 'transportedEmbeddingSha256', 'referenceMaskSha256',
    'transportedMaskSha256', 'referenceImageSha256', 'splitImageSha256',
    'referenceTextEncoderInvocations', 'splitTextEncoderInvocations', 'outcome',
    'binaryArtifactsPublished',
  ], 'evidence');

  if (record.schemaVersion !== HSME_SANA_CONDITIONING_PARITY_EVIDENCE_V1_SCHEMA) {
    fail('hsme_sana_parity_evidence_schema_unsupported', 'unsupported parity evidence schema');
  }
  assertFalse(record.binaryArtifactsPublished, 'binaryArtifactsPublished', 'hsme_sana_parity_binary_evidence_forbidden');

  return deepFreeze({
    schemaVersion: HSME_SANA_CONDITIONING_PARITY_EVIDENCE_V1_SCHEMA,
    planDigest: sha256(record.planDigest, 'evidence.planDigest'),
    phase0EnvelopeDigest: sha256(record.phase0EnvelopeDigest, 'evidence.phase0EnvelopeDigest'),
    generationConfigSha256: unknownOrSha256(record.generationConfigSha256, 'evidence.generationConfigSha256'),
    referenceEmbeddingSha256: unknownOrSha256(record.referenceEmbeddingSha256, 'evidence.referenceEmbeddingSha256'),
    transportedEmbeddingSha256: unknownOrSha256(record.transportedEmbeddingSha256, 'evidence.transportedEmbeddingSha256'),
    referenceMaskSha256: unknownOrSha256(record.referenceMaskSha256, 'evidence.referenceMaskSha256'),
    transportedMaskSha256: unknownOrSha256(record.transportedMaskSha256, 'evidence.transportedMaskSha256'),
    referenceImageSha256: unknownOrSha256(record.referenceImageSha256, 'evidence.referenceImageSha256'),
    splitImageSha256: unknownOrSha256(record.splitImageSha256, 'evidence.splitImageSha256'),
    referenceTextEncoderInvocations: safeInteger(record.referenceTextEncoderInvocations, 'evidence.referenceTextEncoderInvocations', 0, 16),
    splitTextEncoderInvocations: safeInteger(record.splitTextEncoderInvocations, 'evidence.splitTextEncoderInvocations', 0, 16),
    outcome: enumValue(record.outcome, OUTCOMES, 'evidence.outcome'),
    binaryArtifactsPublished: false,
  });
}

export async function hsmeSanaConditioningParityPlanV1Digest(
  raw: unknown,
  hash: HsmeSanaConditioningParityHashPortV1,
): Promise<string> {
  const plan = normalizeHsmeSanaConditioningParityPlanV1(raw);
  return checkedDigest(new TextEncoder().encode(
    `${HSME_SANA_CONDITIONING_PARITY_DIGEST_DOMAIN}${JSON.stringify(plan)}`,
  ), hash);
}

export async function hsmeSanaConditioningGenerationV1Digest(
  rawPlan: unknown,
  hash: HsmeSanaConditioningParityHashPortV1,
): Promise<string> {
  const plan = normalizeHsmeSanaConditioningParityPlanV1(rawPlan);
  return checkedDigest(new TextEncoder().encode(
    `${HSME_SANA_CONDITIONING_GENERATION_DIGEST_DOMAIN}${JSON.stringify(plan.generation)}`,
  ), hash);
}

export async function proveHsmeSanaConditioningParityEvidenceV1(
  rawPlan: unknown,
  rawEvidence: unknown,
  hash: HsmeSanaConditioningParityHashPortV1,
): Promise<HsmeSanaConditioningParityProofV1> {
  const plan = normalizeHsmeSanaConditioningParityPlanV1(rawPlan);
  const evidence = normalizeHsmeSanaConditioningParityEvidenceV1(rawEvidence);
  const [planDigest, generationConfigSha256] = await Promise.all([
    hsmeSanaConditioningParityPlanV1Digest(plan, hash),
    hsmeSanaConditioningGenerationV1Digest(plan, hash),
  ]);

  if (evidence.planDigest !== planDigest) {
    fail('hsme_sana_parity_plan_digest_mismatch', 'evidence is not bound to the canonical plan');
  }
  if (evidence.phase0EnvelopeDigest !== plan.phase0EnvelopeDigest) {
    fail('hsme_sana_parity_phase0_digest_mismatch', 'evidence is not bound to the accepted Phase-0 envelope');
  }

  const conditioningKnown = allKnown([
    evidence.referenceEmbeddingSha256,
    evidence.transportedEmbeddingSha256,
    evidence.referenceMaskSha256,
    evidence.transportedMaskSha256,
  ]);
  const conditioningExact = conditioningKnown
    && evidence.referenceEmbeddingSha256 === evidence.transportedEmbeddingSha256
    && evidence.referenceMaskSha256 === evidence.transportedMaskSha256;
  const generationConfigExact = evidence.generationConfigSha256 !== 'UNKNOWN'
    && evidence.generationConfigSha256 === generationConfigSha256;
  const imageKnown = allKnown([evidence.referenceImageSha256, evidence.splitImageSha256]);
  const imageExact = imageKnown && evidence.referenceImageSha256 === evidence.splitImageSha256;
  const splitGenerationTextEncoderFree = evidence.splitTextEncoderInvocations === 0;

  if (evidence.outcome === 'EVIDENCE_PENDING') {
    if (evidence.referenceTextEncoderInvocations !== 0 || evidence.splitTextEncoderInvocations !== 0) {
      fail('hsme_sana_parity_pending_execution_forbidden', 'pending evidence cannot claim model execution');
    }
  } else if (evidence.outcome === 'RIGHTS_BLOCKED') {
    if (plan.rights.status !== 'BLOCKED') {
      fail('hsme_sana_parity_rights_block_not_proven', 'RIGHTS_BLOCKED requires a blocked rights plan');
    }
    assertNoExecutionEvidence(evidence, 'rights-blocked');
  } else {
    if (plan.rights.status !== 'EVIDENCE_RUN_ALLOWED') {
      fail('hsme_sana_parity_rights_not_admitted', 'real parity evidence requires an admitted evidence-use rights gate');
    }
    if (evidence.referenceTextEncoderInvocations < 1) {
      fail('hsme_sana_parity_reference_conditioner_missing', 'reference path must execute the pinned text encoder');
    }
    if (!splitGenerationTextEncoderFree) {
      fail('hsme_sana_parity_split_text_encoder_invoked', 'split generation path must not execute a text encoder');
    }

    if (evidence.outcome === 'RUNTIME_BLOCKED') {
      if (conditioningKnown || imageKnown) {
        fail('hsme_sana_parity_runtime_block_execution_conflict', 'runtime-blocked evidence cannot claim completed tensor/image evidence');
      }
    } else {
      if (!generationConfigExact) {
        fail('hsme_sana_parity_generation_config_mismatch', 'generation config must match the predeclared canonical digest');
      }
      if (evidence.outcome === 'CONDITIONING_MISMATCH') {
        if (!conditioningKnown || conditioningExact) {
          fail('hsme_sana_parity_conditioning_mismatch_not_proven', 'conditioning mismatch requires measured unequal embedding or mask digests');
        }
      } else if (evidence.outcome === 'GENERATION_PARITY_FAIL') {
        if (!conditioningExact) {
          fail('hsme_sana_parity_generation_fail_conditioning_invalid', 'generation parity can be evaluated only after exact conditioning');
        }
        if (!imageKnown || imageExact) {
          fail('hsme_sana_parity_generation_fail_not_proven', 'generation parity failure requires measured unequal image digests');
        }
      } else if (evidence.outcome === 'EXACT_PARITY_PASS') {
        if (!conditioningExact) {
          fail('hsme_sana_parity_exact_conditioning_required', 'EXACT_PARITY_PASS requires exact embedding and mask identity');
        }
        if (!imageExact) {
          fail('hsme_sana_parity_exact_image_required', 'EXACT_PARITY_PASS requires exact same-backend image identity');
        }
      }
    }
  }

  return deepFreeze({
    planDigest,
    generationConfigSha256,
    outcome: evidence.outcome,
    conditioningExact,
    generationConfigExact,
    imageExact,
    splitGenerationTextEncoderFree,
    exactParityAccepted: evidence.outcome === 'EXACT_PARITY_PASS'
      && conditioningExact
      && generationConfigExact
      && imageExact
      && splitGenerationTextEncoderFree,
  });
}

function normalizeGeneration(raw: unknown): HsmeSanaConditioningParityGenerationV1 {
  const record = exactRecord(raw, [
    'width', 'height', 'inferenceSteps', 'seed', 'latentSha256',
    'schedulerTimestepsSha256', 'guidanceScaleMilli', 'transformerDtype',
    'textEncoderDtype', 'vaeDtype', 'executionProvider',
  ], [
    'width', 'height', 'inferenceSteps', 'seed', 'latentSha256',
    'schedulerTimestepsSha256', 'guidanceScaleMilli', 'transformerDtype',
    'textEncoderDtype', 'vaeDtype', 'executionProvider',
  ], 'plan.generation');

  literalInteger(record.width, 1024, 'plan.generation.width');
  literalInteger(record.height, 1024, 'plan.generation.height');
  if (record.transformerDtype !== 'BF16') fail('hsme_sana_parity_transformer_dtype_invalid', 'transformer dtype must be BF16');
  if (record.textEncoderDtype !== 'BF16') fail('hsme_sana_parity_text_encoder_dtype_invalid', 'text encoder dtype must be BF16');

  return Object.freeze({
    width: 1024,
    height: 1024,
    inferenceSteps: safeInteger(record.inferenceSteps, 'plan.generation.inferenceSteps', 1, 4),
    seed: safeInteger(record.seed, 'plan.generation.seed', 0, 0xffffffff),
    latentSha256: sha256(record.latentSha256, 'plan.generation.latentSha256'),
    schedulerTimestepsSha256: sha256(record.schedulerTimestepsSha256, 'plan.generation.schedulerTimestepsSha256'),
    guidanceScaleMilli: safeInteger(record.guidanceScaleMilli, 'plan.generation.guidanceScaleMilli', 0, 100_000),
    transformerDtype: 'BF16',
    textEncoderDtype: 'BF16',
    vaeDtype: enumValue(record.vaeDtype, VAE_DTYPES, 'plan.generation.vaeDtype'),
    executionProvider: enumValue(record.executionProvider, PROVIDERS, 'plan.generation.executionProvider'),
  });
}

function normalizeParityPolicy(raw: unknown): HsmeSanaConditioningParityPlanV1['parityPolicy'] {
  const record = exactRecord(raw, [
    'embeddingBytes', 'attentionMaskBytes', 'generationConfig', 'imageOutput',
    'postObservationThresholdChangesAllowed',
  ], [
    'embeddingBytes', 'attentionMaskBytes', 'generationConfig', 'imageOutput',
    'postObservationThresholdChangesAllowed',
  ], 'plan.parityPolicy');

  if (record.embeddingBytes !== 'EXACT_SHA256') fail('hsme_sana_parity_embedding_policy_invalid', 'V1 requires exact embedding SHA-256');
  if (record.attentionMaskBytes !== 'EXACT_SHA256') fail('hsme_sana_parity_mask_policy_invalid', 'V1 requires exact attention-mask SHA-256');
  if (record.generationConfig !== 'EXACT_CANONICAL_DIGEST') fail('hsme_sana_parity_generation_policy_invalid', 'V1 requires exact generation config digest');
  if (record.imageOutput !== 'EXACT_SHA256_SAME_BACKEND') fail('hsme_sana_parity_image_policy_invalid', 'V1 requires exact same-backend image SHA-256');
  assertFalse(record.postObservationThresholdChangesAllowed, 'postObservationThresholdChangesAllowed', 'hsme_sana_parity_threshold_mutation_forbidden');

  return Object.freeze({
    embeddingBytes: 'EXACT_SHA256',
    attentionMaskBytes: 'EXACT_SHA256',
    generationConfig: 'EXACT_CANONICAL_DIGEST',
    imageOutput: 'EXACT_SHA256_SAME_BACKEND',
    postObservationThresholdChangesAllowed: false,
  });
}

function normalizeRights(raw: unknown): HsmeSanaConditioningParityPlanV1['rights'] {
  const record = exactRecord(raw, ['status', 'evidenceSha256'], ['status', 'evidenceSha256'], 'plan.rights');
  const status = enumValue(record.status, RIGHTS, 'plan.rights.status');
  const evidenceSha256 = unknownOrSha256(record.evidenceSha256, 'plan.rights.evidenceSha256');
  if (status !== 'UNRESOLVED' && evidenceSha256 === 'UNKNOWN') {
    fail('hsme_sana_parity_rights_evidence_missing', 'resolved rights status requires evidence digest');
  }
  return Object.freeze({ status, evidenceSha256 });
}

function normalizeIdentity(raw: unknown, path: string): HsmeSanaConditioningParityIdentityV1 {
  const record = exactRecord(raw, ['sourceRoot', 'immutableRevision', 'contentSha256'], ['sourceRoot', 'immutableRevision', 'contentSha256'], path);
  const sourceRoot = boundedString(record.sourceRoot, `${path}.sourceRoot`, 240);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sourceRoot)) {
    fail('hsme_sana_parity_source_invalid', `${path}.sourceRoot must be owner/name`);
  }
  const immutableRevision = boundedString(record.immutableRevision, `${path}.immutableRevision`, 64);
  if (!IMMUTABLE_REVISION.test(immutableRevision)) {
    fail('hsme_sana_parity_revision_invalid', `${path}.immutableRevision must be immutable 40/64-hex`);
  }
  return Object.freeze({
    sourceRoot,
    immutableRevision,
    contentSha256: sha256(record.contentSha256, `${path}.contentSha256`),
  });
}

function assertNoExecutionEvidence(evidence: HsmeSanaConditioningParityEvidenceV1, label: string): void {
  if (
    evidence.referenceTextEncoderInvocations !== 0
    || evidence.splitTextEncoderInvocations !== 0
    || evidence.generationConfigSha256 !== 'UNKNOWN'
    || evidence.referenceEmbeddingSha256 !== 'UNKNOWN'
    || evidence.transportedEmbeddingSha256 !== 'UNKNOWN'
    || evidence.referenceMaskSha256 !== 'UNKNOWN'
    || evidence.transportedMaskSha256 !== 'UNKNOWN'
    || evidence.referenceImageSha256 !== 'UNKNOWN'
    || evidence.splitImageSha256 !== 'UNKNOWN'
  ) {
    fail('hsme_sana_parity_blocked_execution_evidence_forbidden', `${label} evidence cannot claim model execution`);
  }
}

async function checkedDigest(bytes: Uint8Array, hash: HsmeSanaConditioningParityHashPortV1): Promise<string> {
  const digest = await hash.sha256(bytes);
  if (!HEX64.test(digest)) fail('hsme_sana_parity_hash_port_invalid', 'hash port must return lowercase SHA-256');
  return digest;
}

function allKnown(values: readonly (string | 'UNKNOWN')[]): boolean {
  return values.every(value => value !== 'UNKNOWN');
}

function unknownOrSha256(value: unknown, path: string): string | 'UNKNOWN' {
  return value === 'UNKNOWN' ? 'UNKNOWN' : sha256(value, path);
}

function sha256(value: unknown, path: string): string {
  const result = boundedString(value, path, 64);
  if (!HEX64.test(result)) fail('hsme_sana_parity_hash_invalid', `${path} must be lowercase SHA-256`);
  return result;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail('hsme_sana_parity_enum_invalid', `${path} is invalid`);
  }
  return value as T[number];
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_sana_parity_record_invalid', `${path} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) fail('hsme_sana_parity_field_unknown', `${path}.${key} is not allowed`);
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) fail('hsme_sana_parity_field_missing', `${path}.${key} is required`);
  }
  return record;
}

function boundedString(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    fail('hsme_sana_parity_text_invalid', `${path} is invalid`);
  }
  return value;
}

function safeInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_sana_parity_integer_invalid', `${path} is invalid`);
  }
  return value as number;
}

function literalInteger(value: unknown, expected: number, path: string): void {
  if (value !== expected) fail('hsme_sana_parity_literal_invalid', `${path} must equal ${expected}`);
}

function assertFalse(value: unknown, field: string, code: string): void {
  if (value !== false) fail(code, `${field} must be false`);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new HsmeSanaConditioningParityV1Error(code, message);
}
