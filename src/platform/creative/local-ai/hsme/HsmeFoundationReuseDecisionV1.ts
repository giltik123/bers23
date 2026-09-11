export const HSME_FOUNDATION_REUSE_DECISION_V1_SCHEMA = 'BERS_HSME_FOUNDATION_REUSE_DECISION_V1' as const;
export const HSME_FOUNDATION_REUSE_DIGEST_DOMAIN = 'bers:hsme:foundation-reuse-decision:v1\0' as const;
export const HSME_FOUNDATION_REUSE_QUALITY_POLICY = 'QUALITY_FLOOR_BEFORE_EFFICIENCY' as const;

const STRATEGIES = Object.freeze([
  'CONTROL_BASELINE',
  'DIRECT_FOUNDATION',
  'FROZEN_FOUNDATION_ADAPTATION',
] as const);
const TARGET_TIERS = Object.freeze(['MOBILE_DEFAULT', 'DESKTOP_HIGH_END', 'REFERENCE'] as const);
const EVIDENCE_STATES = Object.freeze(['UNRESOLVED', 'QUALIFIED', 'REJECTED'] as const);
const LICENSE_CONCLUSIONS = Object.freeze(['COMMERCIAL_ADMISSIBLE', 'REVIEW_REQUIRED', 'NON_COMMERCIAL'] as const);
const QUALITY_STATES = Object.freeze(['PASS', 'FAIL', 'UNKNOWN'] as const);
const TRAINING_MODES = Object.freeze([
  'ZERO_TRAINING',
  'LORA',
  'PROJECTOR_BRIDGE',
  'REPRESENTATION_DISTILLATION',
  'PARTIAL_UNFREEZE',
] as const);
const DECISION_STATUSES = Object.freeze([
  'EVALUATION_PENDING',
  'DIRECT_FOUNDATION_ADVANCE',
  'BOUNDED_ADAPTATION_ADVANCE',
  'REUSE_PATH_INSUFFICIENT',
  'REJECT',
] as const);

const HEX64 = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

export type HsmeFoundationReuseStrategyV1 = typeof STRATEGIES[number];
export type HsmeFoundationReuseTargetTierV1 = typeof TARGET_TIERS[number];
export type HsmeFoundationReuseEvidenceStateV1 = typeof EVIDENCE_STATES[number];
export type HsmeFoundationReuseDecisionStatusV1 = typeof DECISION_STATUSES[number];
export type HsmeFoundationReuseTrainingModeV1 = typeof TRAINING_MODES[number];

export type HsmeFoundationReuseSourceV1 = Readonly<{
  sourceRoot: string;
  immutableRevision: string;
  contentSha256: string;
}>;

export type HsmeFoundationReuseQualityV1 = Readonly<{
  status: typeof QUALITY_STATES[number];
  evidenceSha256: string | 'UNKNOWN';
}>;

export type HsmeFoundationReuseRuntimeV1 = Readonly<{
  backboneBytes: number | 'UNKNOWN';
  conditionerBytes: number | 'UNKNOWN';
  vaeBytes: number | 'UNKNOWN';
  adapterBytes: number | 'UNKNOWN';
  otherRequiredBytes: number | 'UNKNOWN';
  mandatoryInstalledBytes: number | 'UNKNOWN';
  workingMemoryBytes: number | 'UNKNOWN';
  evidenceSha256: string | 'UNKNOWN';
}>;

export type HsmeFoundationReuseTrainingV1 = Readonly<{
  mode: HsmeFoundationReuseTrainingModeV1;
  trainableParameters: number | 'UNKNOWN';
  frozenParameters: number | 'UNKNOWN';
  trainingExamples: number | 'UNKNOWN';
  gpuSeconds: number | 'UNKNOWN';
  trainingCostMicrousd: number | 'UNKNOWN';
  evidenceSha256: string | 'UNKNOWN';
}>;

export type HsmeFoundationReuseCandidateV1 = Readonly<{
  candidateId: string;
  strategy: HsmeFoundationReuseStrategyV1;
  targetTier: HsmeFoundationReuseTargetTierV1;
  evidenceState: HsmeFoundationReuseEvidenceStateV1;
  source: HsmeFoundationReuseSourceV1;
  licenseConclusion: typeof LICENSE_CONCLUSIONS[number];
  licenseEvidenceSha256: string | 'UNKNOWN';
  quality: HsmeFoundationReuseQualityV1;
  runtime: HsmeFoundationReuseRuntimeV1;
  training: HsmeFoundationReuseTrainingV1;
  rejectionReasons: readonly string[];
}>;

export type HsmeFoundationReuseDecisionV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_REUSE_DECISION_V1_SCHEMA;
  qualityPolicy: typeof HSME_FOUNDATION_REUSE_QUALITY_POLICY;
  decisionStatus: HsmeFoundationReuseDecisionStatusV1;
  mobileInstalledBudgetBytes: number;
  mobileWorkingMemoryBudgetBytes: number;
  rationale: readonly string[];
  candidates: readonly HsmeFoundationReuseCandidateV1[];
  selectedCandidateId?: string;
}>;

export interface HsmeFoundationReuseHashPortV1 {
  sha256(bytes: Uint8Array): Promise<string>;
}

export class HsmeFoundationReuseDecisionV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeFoundationReuseDecisionV1Error';
    this.code = code;
  }
}

/**
 * R&D evidence only. This contract decides whether already-existing foundation
 * weights can be reused/adapted before BERS spends on full image-student
 * distillation. It cannot promote a model, select a provider, spend credits,
 * mutate Project/Artifact state, or widen AEE execution authority.
 */
export function normalizeHsmeFoundationReuseDecisionV1(raw: unknown): HsmeFoundationReuseDecisionV1 {
  const record = exactRecord(
    raw,
    [
      'schemaVersion', 'qualityPolicy', 'decisionStatus', 'mobileInstalledBudgetBytes',
      'mobileWorkingMemoryBudgetBytes', 'rationale', 'candidates', 'selectedCandidateId',
    ],
    [
      'schemaVersion', 'qualityPolicy', 'decisionStatus', 'mobileInstalledBudgetBytes',
      'mobileWorkingMemoryBudgetBytes', 'rationale', 'candidates',
    ],
    'decision',
  );

  if (record.schemaVersion !== HSME_FOUNDATION_REUSE_DECISION_V1_SCHEMA) {
    fail('hsme_foundation_reuse_schema_unsupported', `schemaVersion must be ${HSME_FOUNDATION_REUSE_DECISION_V1_SCHEMA}`);
  }
  if (record.qualityPolicy !== HSME_FOUNDATION_REUSE_QUALITY_POLICY) {
    fail('hsme_foundation_reuse_quality_policy_invalid', `qualityPolicy must be ${HSME_FOUNDATION_REUSE_QUALITY_POLICY}`);
  }

  const decisionStatus = enumValue(record.decisionStatus, DECISION_STATUSES, 'decisionStatus');
  const mobileInstalledBudgetBytes = safeInteger(record.mobileInstalledBudgetBytes, 'mobileInstalledBudgetBytes', 1, Number.MAX_SAFE_INTEGER);
  const mobileWorkingMemoryBudgetBytes = safeInteger(record.mobileWorkingMemoryBudgetBytes, 'mobileWorkingMemoryBudgetBytes', 1, Number.MAX_SAFE_INTEGER);
  const rationale = boundedStringSet(record.rationale, 'rationale', 1, 24, 500);

  if (!Array.isArray(record.candidates) || record.candidates.length < 3 || record.candidates.length > 12) {
    fail('hsme_foundation_reuse_candidate_count_invalid', 'candidates must contain 3..12 entries');
  }
  const candidates = record.candidates.map((value, index) => normalizeCandidate(value, `candidates[${index}]`));
  const ids = candidates.map(candidate => candidate.candidateId);
  if (new Set(ids).size !== ids.length) {
    fail('hsme_foundation_reuse_candidate_duplicate', 'candidateId must be unique');
  }
  requireStrategy(candidates, 'CONTROL_BASELINE');
  requireStrategy(candidates, 'DIRECT_FOUNDATION');
  requireStrategy(candidates, 'FROZEN_FOUNDATION_ADAPTATION');

  const selectedCandidateId = Object.hasOwn(record, 'selectedCandidateId')
    ? identifier(record.selectedCandidateId, 'selectedCandidateId', 120)
    : undefined;
  const selected = selectedCandidateId
    ? candidates.find(candidate => candidate.candidateId === selectedCandidateId)
    : undefined;
  if (selectedCandidateId && !selected) {
    fail('hsme_foundation_reuse_selection_invalid', 'selectedCandidateId must identify a candidate');
  }

  if (decisionStatus === 'EVALUATION_PENDING') {
    if (selectedCandidateId) {
      fail('hsme_foundation_reuse_pending_selection_forbidden', 'EVALUATION_PENDING cannot select a candidate');
    }
    if (!candidates.some(candidate => candidate.evidenceState === 'UNRESOLVED')) {
      fail('hsme_foundation_reuse_pending_requires_unresolved', 'EVALUATION_PENDING requires unresolved evidence');
    }
  } else if (decisionStatus === 'DIRECT_FOUNDATION_ADVANCE') {
    assertAdvanceCandidate(selected, 'DIRECT_FOUNDATION', mobileInstalledBudgetBytes, mobileWorkingMemoryBudgetBytes);
    if (selected!.training.mode !== 'ZERO_TRAINING') {
      fail('hsme_foundation_reuse_direct_training_invalid', 'DIRECT_FOUNDATION_ADVANCE requires ZERO_TRAINING');
    }
  } else if (decisionStatus === 'BOUNDED_ADAPTATION_ADVANCE') {
    assertAdvanceCandidate(selected, 'FROZEN_FOUNDATION_ADAPTATION', mobileInstalledBudgetBytes, mobileWorkingMemoryBudgetBytes);
    if (selected!.training.mode === 'ZERO_TRAINING') {
      fail('hsme_foundation_reuse_adaptation_training_invalid', 'BOUNDED_ADAPTATION_ADVANCE requires a bounded adaptation mode');
    }
    if (selected!.training.trainableParameters === 'UNKNOWN' || selected!.training.frozenParameters === 'UNKNOWN') {
      fail('hsme_foundation_reuse_adaptation_parameter_evidence_missing', 'bounded adaptation requires trainable/frozen parameter evidence');
    }
    if (selected!.training.frozenParameters < 1 || selected!.training.trainableParameters < 1) {
      fail('hsme_foundation_reuse_adaptation_parameter_evidence_invalid', 'bounded adaptation must freeze and train non-zero parameter sets');
    }
    if (selected!.training.trainableParameters >= selected!.training.frozenParameters) {
      fail('hsme_foundation_reuse_adaptation_not_bounded', 'bounded adaptation must train fewer parameters than remain frozen');
    }
  } else if (decisionStatus === 'REUSE_PATH_INSUFFICIENT') {
    if (selectedCandidateId) {
      fail('hsme_foundation_reuse_insufficient_selection_forbidden', 'REUSE_PATH_INSUFFICIENT cannot select a candidate');
    }
    const reuseCandidates = candidates.filter(candidate => candidate.strategy !== 'CONTROL_BASELINE');
    if (reuseCandidates.some(candidate => candidate.evidenceState !== 'REJECTED')) {
      fail('hsme_foundation_reuse_insufficient_not_proven', 'every direct/adaptation candidate must be REJECTED before full-student escalation');
    }
    if (reuseCandidates.some(candidate => !hasHardReuseBlocker(candidate, mobileInstalledBudgetBytes, mobileWorkingMemoryBudgetBytes))) {
      fail('hsme_foundation_reuse_insufficient_hard_blocker_missing', 'every rejected reuse candidate requires measured quality/license/resource blocker evidence');
    }
  } else if (decisionStatus === 'REJECT') {
    if (selectedCandidateId) {
      fail('hsme_foundation_reuse_reject_selection_forbidden', 'REJECT cannot select a candidate');
    }
    if (!candidates.some(candidate => candidate.evidenceState === 'REJECTED')) {
      fail('hsme_foundation_reuse_reject_evidence_missing', 'REJECT requires at least one rejected candidate');
    }
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_REUSE_DECISION_V1_SCHEMA,
    qualityPolicy: HSME_FOUNDATION_REUSE_QUALITY_POLICY,
    decisionStatus,
    mobileInstalledBudgetBytes,
    mobileWorkingMemoryBudgetBytes,
    rationale,
    candidates: Object.freeze([...candidates].sort((left, right) => lexical(left.candidateId, right.candidateId))),
    ...(selectedCandidateId ? { selectedCandidateId } : {}),
  });
}

/**
 * This is intentionally a proof function, not a status accessor. Any caller,
 * including plain JavaScript, must pass the complete canonical decision gate.
 */
export function mayEscalateToFullHsmeStudentDistillationV1(raw: unknown): boolean {
  return normalizeHsmeFoundationReuseDecisionV1(raw).decisionStatus === 'REUSE_PATH_INSUFFICIENT';
}

export function serializeHsmeFoundationReuseDecisionV1(raw: unknown): string {
  return JSON.stringify(normalizeHsmeFoundationReuseDecisionV1(raw));
}

export async function hsmeFoundationReuseDecisionV1Digest(
  raw: unknown,
  hash: HsmeFoundationReuseHashPortV1,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${HSME_FOUNDATION_REUSE_DIGEST_DOMAIN}${serializeHsmeFoundationReuseDecisionV1(raw)}`,
  );
  const digest = await hash.sha256(bytes);
  if (!HEX64.test(digest)) {
    fail('hsme_foundation_reuse_hash_port_invalid', 'hash port must return lowercase SHA-256 hex');
  }
  return digest;
}

function normalizeCandidate(raw: unknown, path: string): HsmeFoundationReuseCandidateV1 {
  const record = exactRecord(
    raw,
    [
      'candidateId', 'strategy', 'targetTier', 'evidenceState', 'source',
      'licenseConclusion', 'licenseEvidenceSha256', 'quality', 'runtime', 'training', 'rejectionReasons',
    ],
    [
      'candidateId', 'strategy', 'targetTier', 'evidenceState', 'source',
      'licenseConclusion', 'licenseEvidenceSha256', 'quality', 'runtime', 'training', 'rejectionReasons',
    ],
    path,
  );

  const candidateId = identifier(record.candidateId, `${path}.candidateId`, 120);
  const strategy = enumValue(record.strategy, STRATEGIES, `${path}.strategy`);
  const targetTier = enumValue(record.targetTier, TARGET_TIERS, `${path}.targetTier`);
  const evidenceState = enumValue(record.evidenceState, EVIDENCE_STATES, `${path}.evidenceState`);
  const source = normalizeSource(record.source, `${path}.source`);
  const licenseConclusion = enumValue(record.licenseConclusion, LICENSE_CONCLUSIONS, `${path}.licenseConclusion`);
  const licenseEvidenceSha256 = unknownOrSha256(record.licenseEvidenceSha256, `${path}.licenseEvidenceSha256`);
  const quality = normalizeQuality(record.quality, `${path}.quality`);
  const runtime = normalizeRuntime(record.runtime, `${path}.runtime`);
  const training = normalizeTraining(record.training, `${path}.training`);
  const rejectionReasons = boundedStringSet(record.rejectionReasons, `${path}.rejectionReasons`, 0, 16, 400);

  if (strategy === 'DIRECT_FOUNDATION' && training.mode !== 'ZERO_TRAINING') {
    fail('hsme_foundation_reuse_direct_candidate_training_invalid', `${candidateId} DIRECT_FOUNDATION must use ZERO_TRAINING`);
  }
  if (strategy === 'CONTROL_BASELINE' && targetTier === 'DESKTOP_HIGH_END') {
    fail('hsme_foundation_reuse_control_tier_invalid', 'CONTROL_BASELINE cannot masquerade as a desktop-only target');
  }
  if (licenseConclusion !== 'REVIEW_REQUIRED' && licenseEvidenceSha256 === 'UNKNOWN') {
    fail('hsme_foundation_reuse_license_evidence_missing', `${candidateId} resolved license conclusion requires evidence digest`);
  }

  if (evidenceState === 'QUALIFIED') {
    if (licenseConclusion !== 'COMMERCIAL_ADMISSIBLE' || licenseEvidenceSha256 === 'UNKNOWN') {
      fail('hsme_foundation_reuse_qualified_license_invalid', `${candidateId} qualified evidence requires commercial license evidence`);
    }
    if (quality.status !== 'PASS' || quality.evidenceSha256 === 'UNKNOWN') {
      fail('hsme_foundation_reuse_qualified_quality_invalid', `${candidateId} qualified evidence requires measured PASS quality`);
    }
    if (runtime.mandatoryInstalledBytes === 'UNKNOWN' || runtime.workingMemoryBytes === 'UNKNOWN' || runtime.evidenceSha256 === 'UNKNOWN') {
      fail('hsme_foundation_reuse_qualified_runtime_invalid', `${candidateId} qualified evidence requires exact runtime/resource evidence`);
    }
    if (training.evidenceSha256 === 'UNKNOWN') {
      fail('hsme_foundation_reuse_qualified_training_invalid', `${candidateId} qualified evidence requires training/zero-training evidence`);
    }
    if (rejectionReasons.length !== 0) {
      fail('hsme_foundation_reuse_qualified_rejection_invalid', `${candidateId} qualified candidate cannot carry rejectionReasons`);
    }
  }

  if (evidenceState === 'REJECTED' && rejectionReasons.length < 1) {
    fail('hsme_foundation_reuse_rejection_reason_required', `${candidateId} rejected candidate requires a reason`);
  }
  if (evidenceState !== 'REJECTED' && rejectionReasons.length > 0) {
    fail('hsme_foundation_reuse_rejection_reason_invalid', `${candidateId} rejectionReasons are only valid for REJECTED evidence`);
  }

  return deepFreeze({
    candidateId,
    strategy,
    targetTier,
    evidenceState,
    source,
    licenseConclusion,
    licenseEvidenceSha256,
    quality,
    runtime,
    training,
    rejectionReasons,
  });
}

function normalizeSource(raw: unknown, path: string): HsmeFoundationReuseSourceV1 {
  const record = exactRecord(raw, ['sourceRoot', 'immutableRevision', 'contentSha256'], ['sourceRoot', 'immutableRevision', 'contentSha256'], path);
  const sourceRoot = boundedString(record.sourceRoot, `${path}.sourceRoot`, 240);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sourceRoot)) {
    fail('hsme_foundation_reuse_source_invalid', `${path}.sourceRoot must be owner/name`);
  }
  const immutableRevision = boundedString(record.immutableRevision, `${path}.immutableRevision`, 64);
  if (!IMMUTABLE_REVISION.test(immutableRevision)) {
    fail('hsme_foundation_reuse_revision_invalid', `${path}.immutableRevision must be immutable 40/64-hex`);
  }
  return Object.freeze({
    sourceRoot,
    immutableRevision,
    contentSha256: sha256(record.contentSha256, `${path}.contentSha256`),
  });
}

function normalizeQuality(raw: unknown, path: string): HsmeFoundationReuseQualityV1 {
  const record = exactRecord(raw, ['status', 'evidenceSha256'], ['status', 'evidenceSha256'], path);
  const status = enumValue(record.status, QUALITY_STATES, `${path}.status`);
  const evidenceSha256 = unknownOrSha256(record.evidenceSha256, `${path}.evidenceSha256`);
  if (status === 'UNKNOWN' && evidenceSha256 !== 'UNKNOWN') {
    fail('hsme_foundation_reuse_quality_evidence_invalid', `${path} UNKNOWN quality cannot claim evidence digest`);
  }
  if (status !== 'UNKNOWN' && evidenceSha256 === 'UNKNOWN') {
    fail('hsme_foundation_reuse_quality_evidence_missing', `${path} measured quality requires evidence digest`);
  }
  return Object.freeze({ status, evidenceSha256 });
}

function normalizeRuntime(raw: unknown, path: string): HsmeFoundationReuseRuntimeV1 {
  const record = exactRecord(
    raw,
    [
      'backboneBytes', 'conditionerBytes', 'vaeBytes', 'adapterBytes', 'otherRequiredBytes',
      'mandatoryInstalledBytes', 'workingMemoryBytes', 'evidenceSha256',
    ],
    [
      'backboneBytes', 'conditionerBytes', 'vaeBytes', 'adapterBytes', 'otherRequiredBytes',
      'workingMemoryBytes', 'evidenceSha256',
    ],
    path,
  );

  const backboneBytes = unknownOrInteger(record.backboneBytes, `${path}.backboneBytes`, 0, Number.MAX_SAFE_INTEGER);
  const conditionerBytes = unknownOrInteger(record.conditionerBytes, `${path}.conditionerBytes`, 0, Number.MAX_SAFE_INTEGER);
  const vaeBytes = unknownOrInteger(record.vaeBytes, `${path}.vaeBytes`, 0, Number.MAX_SAFE_INTEGER);
  const adapterBytes = unknownOrInteger(record.adapterBytes, `${path}.adapterBytes`, 0, Number.MAX_SAFE_INTEGER);
  const otherRequiredBytes = unknownOrInteger(record.otherRequiredBytes, `${path}.otherRequiredBytes`, 0, Number.MAX_SAFE_INTEGER);
  const workingMemoryBytes = unknownOrInteger(record.workingMemoryBytes, `${path}.workingMemoryBytes`, 1, Number.MAX_SAFE_INTEGER);
  const evidenceSha256 = unknownOrSha256(record.evidenceSha256, `${path}.evidenceSha256`);

  const parts = [backboneBytes, conditionerBytes, vaeBytes, adapterBytes, otherRequiredBytes];
  const mandatoryInstalledBytes = parts.some(value => value === 'UNKNOWN')
    ? 'UNKNOWN' as const
    : sumSafe(parts as number[], `${path}.mandatoryInstalledBytes`);

  if (Object.hasOwn(record, 'mandatoryInstalledBytes')) {
    const asserted = unknownOrInteger(record.mandatoryInstalledBytes, `${path}.mandatoryInstalledBytes`, 0, Number.MAX_SAFE_INTEGER);
    if (asserted !== mandatoryInstalledBytes) {
      fail(
        'hsme_foundation_reuse_installed_total_mismatch',
        `${path}.mandatoryInstalledBytes must equal the derived complete runtime total`,
      );
    }
  }

  if ((mandatoryInstalledBytes === 'UNKNOWN' || workingMemoryBytes === 'UNKNOWN') && evidenceSha256 !== 'UNKNOWN') {
    fail('hsme_foundation_reuse_runtime_evidence_invalid', `${path} unresolved runtime cannot claim exact resource evidence`);
  }

  return Object.freeze({
    backboneBytes,
    conditionerBytes,
    vaeBytes,
    adapterBytes,
    otherRequiredBytes,
    mandatoryInstalledBytes,
    workingMemoryBytes,
    evidenceSha256,
  });
}

function normalizeTraining(raw: unknown, path: string): HsmeFoundationReuseTrainingV1 {
  const record = exactRecord(
    raw,
    ['mode', 'trainableParameters', 'frozenParameters', 'trainingExamples', 'gpuSeconds', 'trainingCostMicrousd', 'evidenceSha256'],
    ['mode', 'trainableParameters', 'frozenParameters', 'trainingExamples', 'gpuSeconds', 'trainingCostMicrousd', 'evidenceSha256'],
    path,
  );
  const mode = enumValue(record.mode, TRAINING_MODES, `${path}.mode`);
  const trainableParameters = unknownOrInteger(record.trainableParameters, `${path}.trainableParameters`, 0, Number.MAX_SAFE_INTEGER);
  const frozenParameters = unknownOrInteger(record.frozenParameters, `${path}.frozenParameters`, 0, Number.MAX_SAFE_INTEGER);
  const trainingExamples = unknownOrInteger(record.trainingExamples, `${path}.trainingExamples`, 0, Number.MAX_SAFE_INTEGER);
  const gpuSeconds = unknownOrInteger(record.gpuSeconds, `${path}.gpuSeconds`, 0, Number.MAX_SAFE_INTEGER);
  const trainingCostMicrousd = unknownOrInteger(record.trainingCostMicrousd, `${path}.trainingCostMicrousd`, 0, Number.MAX_SAFE_INTEGER);
  const evidenceSha256 = unknownOrSha256(record.evidenceSha256, `${path}.evidenceSha256`);

  if (mode === 'ZERO_TRAINING') {
    for (const [name, value] of Object.entries({ trainableParameters, trainingExamples, gpuSeconds, trainingCostMicrousd })) {
      if (value !== 0) {
        fail('hsme_foundation_reuse_zero_training_invalid', `${path}.${name} must be zero for ZERO_TRAINING`);
      }
    }
  }

  return Object.freeze({
    mode,
    trainableParameters,
    frozenParameters,
    trainingExamples,
    gpuSeconds,
    trainingCostMicrousd,
    evidenceSha256,
  });
}

function assertAdvanceCandidate(
  selected: HsmeFoundationReuseCandidateV1 | undefined,
  expectedStrategy: HsmeFoundationReuseStrategyV1,
  mobileInstalledBudgetBytes: number,
  mobileWorkingMemoryBudgetBytes: number,
): void {
  if (!selected || selected.strategy !== expectedStrategy) {
    fail('hsme_foundation_reuse_advance_selection_invalid', `advance requires selected ${expectedStrategy} candidate`);
  }
  if (selected.targetTier !== 'MOBILE_DEFAULT') {
    fail('hsme_foundation_reuse_mobile_tier_required', 'HSME-2 reuse advance requires MOBILE_DEFAULT target tier');
  }
  if (selected.evidenceState !== 'QUALIFIED') {
    fail('hsme_foundation_reuse_advance_evidence_invalid', 'advance requires QUALIFIED evidence');
  }
  if (selected.licenseConclusion !== 'COMMERCIAL_ADMISSIBLE') {
    fail('hsme_foundation_reuse_advance_license_invalid', 'advance requires COMMERCIAL_ADMISSIBLE license conclusion');
  }
  if (selected.quality.status !== 'PASS') {
    fail('hsme_foundation_reuse_quality_floor_failed', 'quality floor must PASS before efficiency can advance a candidate');
  }
  if (selected.runtime.mandatoryInstalledBytes === 'UNKNOWN' || selected.runtime.mandatoryInstalledBytes > mobileInstalledBudgetBytes) {
    fail('hsme_foundation_reuse_installed_budget_failed', 'mandatory backbone+conditioner+VAE+adapter+other bytes exceed mobile installed budget');
  }
  if (selected.runtime.workingMemoryBytes === 'UNKNOWN' || selected.runtime.workingMemoryBytes > mobileWorkingMemoryBudgetBytes) {
    fail('hsme_foundation_reuse_memory_budget_failed', 'working-memory bytes exceed mobile budget');
  }
}

function hasHardReuseBlocker(
  candidate: HsmeFoundationReuseCandidateV1,
  mobileInstalledBudgetBytes: number,
  mobileWorkingMemoryBudgetBytes: number,
): boolean {
  if (candidate.licenseConclusion === 'NON_COMMERCIAL' && candidate.licenseEvidenceSha256 !== 'UNKNOWN') return true;
  if (candidate.quality.status === 'FAIL' && candidate.quality.evidenceSha256 !== 'UNKNOWN') return true;
  if (candidate.runtime.evidenceSha256 !== 'UNKNOWN') {
    if (candidate.runtime.mandatoryInstalledBytes !== 'UNKNOWN' && candidate.runtime.mandatoryInstalledBytes > mobileInstalledBudgetBytes) return true;
    if (candidate.runtime.workingMemoryBytes !== 'UNKNOWN' && candidate.runtime.workingMemoryBytes > mobileWorkingMemoryBudgetBytes) return true;
  }
  return false;
}

function requireStrategy(candidates: readonly HsmeFoundationReuseCandidateV1[], strategy: HsmeFoundationReuseStrategyV1): void {
  if (!candidates.some(candidate => candidate.strategy === strategy)) {
    fail('hsme_foundation_reuse_strategy_missing', `one ${strategy} candidate is required`);
  }
}

function exactRecord(
  raw: unknown,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_foundation_reuse_record_invalid', `${path} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      fail('hsme_foundation_reuse_field_unknown', `${path}.${key} is not allowed`);
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) {
      fail('hsme_foundation_reuse_field_missing', `${path}.${key} is required`);
    }
  }
  return record;
}

function unknownOrInteger(value: unknown, path: string, min: number, max: number): number | 'UNKNOWN' {
  return value === 'UNKNOWN' ? 'UNKNOWN' : safeInteger(value, path, min, max);
}

function unknownOrSha256(value: unknown, path: string): string | 'UNKNOWN' {
  return value === 'UNKNOWN' ? 'UNKNOWN' : sha256(value, path);
}

function sha256(value: unknown, path: string): string {
  const result = boundedString(value, path, 64);
  if (!HEX64.test(result)) {
    fail('hsme_foundation_reuse_hash_invalid', `${path} must be lowercase SHA-256`);
  }
  return result;
}

function identifier(value: unknown, path: string, max: number): string {
  const result = boundedString(value, path, max);
  if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) {
    fail('hsme_foundation_reuse_identifier_invalid', `${path} is invalid`);
  }
  return result;
}

function boundedString(value: unknown, path: string, max: number): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > max
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail('hsme_foundation_reuse_text_invalid', `${path} is invalid`);
  }
  return value;
}

function boundedStringSet(value: unknown, path: string, min: number, max: number, itemMax: number): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail('hsme_foundation_reuse_string_set_invalid', `${path} must contain ${min}..${max} entries`);
  }
  const result = value.map((item, index) => boundedString(item, `${path}[${index}]`, itemMax));
  if (new Set(result).size !== result.length) {
    fail('hsme_foundation_reuse_string_set_duplicate', `${path} must not contain duplicates`);
  }
  return Object.freeze([...result].sort(lexical));
}

function safeInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_foundation_reuse_integer_invalid', `${path} is invalid`);
  }
  return value as number;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail('hsme_foundation_reuse_enum_invalid', `${path} is invalid`);
  }
  return value as T[number];
}

function sumSafe(values: readonly number[], path: string): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) {
      fail('hsme_foundation_reuse_integer_overflow', `${path} overflow`);
    }
  }
  return total;
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreeze(child);
    }
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new HsmeFoundationReuseDecisionV1Error(code, message);
}
