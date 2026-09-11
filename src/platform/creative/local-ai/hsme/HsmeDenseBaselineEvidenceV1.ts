export const HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA = 'BERS_HSME_DENSE_BASELINE_EVIDENCE_V1' as const;
export const HSME_DENSE_BASELINE_DIGEST_DOMAIN = 'bers:hsme:dense-baseline-evidence:v1\0' as const;

const STRATEGIES = Object.freeze([
  'CONTROL_BASELINE',
  'OFF_THE_SHELF_DIT',
  'MOBILE_ARCHITECTURE_REFERENCE',
  'BERS_DISTILLED_CORE',
] as const);

const VERDICTS = Object.freeze([
  'CONTROL_ONLY',
  'REJECT_RUNTIME_FOOTPRINT',
  'REFERENCE_ONLY_NO_PINNABLE_CHECKPOINT',
  'REJECT_LICENSE',
  'SELECTED_FOR_TRAINING',
  'SELECTED_BASELINE',
] as const);

const DECISIONS = Object.freeze(['REDESIGN_REQUIRED', 'BASELINE_PINNED'] as const);
const SOURCE_CLASSES = Object.freeze(['PINNED_MODEL_EVIDENCE', 'RESEARCH_REFERENCE'] as const);
const LICENSE_STATES = Object.freeze([
  'COMMERCIAL_REVIEWED_WITH_OBLIGATIONS',
  'COMMERCIAL_REVIEW_REQUIRED',
  'NON_COMMERCIAL',
  'REFERENCE_ONLY_UNKNOWN',
] as const);

export type HsmeDenseBaselineStrategyV1 = typeof STRATEGIES[number];
export type HsmeDenseBaselineVerdictV1 = typeof VERDICTS[number];
export type HsmeDenseBaselineDecisionStatusV1 = typeof DECISIONS[number];

export type HsmeDenseBaselineSourceV1 = Readonly<{
  sourceClass: typeof SOURCE_CLASSES[number];
  uri: string;
  revision?: string;
  license: string;
  licenseState: typeof LICENSE_STATES[number];
}>;

export type HsmeDenseBaselineMetricsV1 = Readonly<{
  parametersMillions: number | 'UNKNOWN';
  fullPipelineBytes: number | 'UNKNOWN';
  textConditionerBytes: number | 'UNKNOWN';
  supportedStepCounts: readonly number[];
  reportedMobileLatencyMs: number | 'UNKNOWN';
  reportedMobileDevice: string | 'UNKNOWN';
}>;

export type HsmeDenseBaselineCandidateV1 = Readonly<{
  candidateId: string;
  strategy: HsmeDenseBaselineStrategyV1;
  architectureFamily: string;
  verdict: HsmeDenseBaselineVerdictV1;
  reasons: readonly string[];
  sources: readonly HsmeDenseBaselineSourceV1[];
  metrics: HsmeDenseBaselineMetricsV1;
}>;

export type HsmeDenseBaselinePinV1 = Readonly<{
  modelId: string;
  version: string;
  sourceUri: string;
  sourceRevision: string;
  contentSha256: string;
  packageBytes: number;
  license: string;
  licenseConclusion: 'COMMERCIAL_ADMISSIBLE';
  licenseEvidenceSha256: string;
  toolchainLockSha256: string;
  architectureConfigSha256: string;
  representationManifestSha256: string;
  evaluationContractSha256: string;
  qualityEvidenceSha256: string;
  runtimeEvidenceSha256: string;
  hsmeBindingEvidenceSha256: string;
}>;

export type HsmeDenseTrainingTargetV1 = Readonly<{
  candidateId: string;
  architectureFamily: 'COMPACT_DIT';
  activeParametersMillions: Readonly<{ min: number; max: number }>;
  initialUsefulPackBytes: Readonly<{ min: number; max: number }>;
  activeWeightsMaxBytes: number;
  textConditionerMaxBytes: number;
  targetStepCounts: readonly number[];
  requiredEvidence: readonly string[];
  architectureReferences: readonly string[];
}>;

export type HsmeDenseBaselineDecisionV1 = Readonly<{
  schemaVersion: typeof HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA;
  decisionStatus: HsmeDenseBaselineDecisionStatusV1;
  rationale: readonly string[];
  candidates: readonly HsmeDenseBaselineCandidateV1[];
  selectedCandidateId: string;
  trainingTarget?: HsmeDenseTrainingTargetV1;
  baselinePin?: HsmeDenseBaselinePinV1;
}>;

export interface HsmeDenseBaselineHashPortV1 {
  sha256(bytes: Uint8Array): Promise<string>;
}

export class HsmeDenseBaselineEvidenceV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeDenseBaselineEvidenceV1Error';
    this.code = code;
  }
}

/**
 * R&D evidence only. This contract can compare and pin a dense baseline identity,
 * but cannot promote it into the model fleet or widen execution authority.
 */
export function normalizeHsmeDenseBaselineDecisionV1(raw: unknown): HsmeDenseBaselineDecisionV1 {
  const record = exactRecord(
    raw,
    ['schemaVersion', 'decisionStatus', 'rationale', 'candidates', 'selectedCandidateId', 'trainingTarget', 'baselinePin'],
    ['schemaVersion', 'decisionStatus', 'rationale', 'candidates', 'selectedCandidateId'],
    'decision',
  );
  if (record.schemaVersion !== HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA) {
    fail('hsme_dense_baseline_schema_unsupported', `schemaVersion must be ${HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA}`);
  }
  const decisionStatus = enumValue(record.decisionStatus, DECISIONS, 'decisionStatus');
  const rationale = boundedStringSet(record.rationale, 'rationale', 1, 16, 400);
  const selectedCandidateId = identifier(record.selectedCandidateId, 'selectedCandidateId', 120);
  if (!Array.isArray(record.candidates) || record.candidates.length < 3 || record.candidates.length > 12) {
    fail('hsme_dense_baseline_candidate_count_invalid', 'candidates must contain 3..12 entries');
  }
  const candidates = record.candidates.map((candidate, index) => normalizeCandidate(candidate, index));
  const ids = candidates.map(candidate => candidate.candidateId);
  if (new Set(ids).size !== ids.length) fail('hsme_dense_baseline_candidate_duplicate', 'candidateId must be unique');
  if (!candidates.some(candidate => candidate.strategy === 'CONTROL_BASELINE')) {
    fail('hsme_dense_baseline_control_missing', 'one CONTROL_BASELINE candidate is required');
  }
  if (!candidates.some(candidate => candidate.strategy === 'OFF_THE_SHELF_DIT')) {
    fail('hsme_dense_baseline_dit_comparison_missing', 'one OFF_THE_SHELF_DIT candidate is required');
  }
  if (!candidates.some(candidate => candidate.strategy === 'MOBILE_ARCHITECTURE_REFERENCE')) {
    fail('hsme_dense_baseline_mobile_reference_missing', 'one MOBILE_ARCHITECTURE_REFERENCE candidate is required');
  }
  const selected = candidates.find(candidate => candidate.candidateId === selectedCandidateId);
  if (!selected) fail('hsme_dense_baseline_selection_invalid', 'selectedCandidateId must identify a candidate');

  const trainingTarget = Object.hasOwn(record, 'trainingTarget')
    ? normalizeTrainingTarget(record.trainingTarget)
    : undefined;
  const baselinePin = Object.hasOwn(record, 'baselinePin')
    ? normalizePin(record.baselinePin)
    : undefined;

  if (decisionStatus === 'BASELINE_PINNED') {
    if (!baselinePin) fail('hsme_dense_baseline_pin_required', 'BASELINE_PINNED requires baselinePin');
    if (trainingTarget) fail('hsme_dense_baseline_pin_invalid', 'BASELINE_PINNED cannot carry an unresolved trainingTarget');
    if (selected.verdict !== 'SELECTED_BASELINE') {
      fail('hsme_dense_baseline_pin_invalid', 'selected pinned candidate must be SELECTED_BASELINE');
    }
  } else {
    if (baselinePin) fail('hsme_dense_baseline_redesign_invalid', 'REDESIGN_REQUIRED cannot claim baselinePin');
    if (!trainingTarget) fail('hsme_dense_baseline_training_target_required', 'REDESIGN_REQUIRED requires trainingTarget');
    if (trainingTarget.candidateId !== selectedCandidateId || selected.strategy !== 'BERS_DISTILLED_CORE' || selected.verdict !== 'SELECTED_FOR_TRAINING') {
      fail('hsme_dense_baseline_training_target_invalid', 'REDESIGN_REQUIRED must select the BERS_DISTILLED_CORE training target');
    }
  }

  return deepFreeze({
    schemaVersion: HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA,
    decisionStatus,
    rationale,
    candidates: Object.freeze([...candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId))),
    selectedCandidateId,
    ...(trainingTarget ? { trainingTarget } : {}),
    ...(baselinePin ? { baselinePin } : {}),
  });
}

export function serializeHsmeDenseBaselineDecisionV1(decision: HsmeDenseBaselineDecisionV1): string {
  return JSON.stringify(decision);
}

export async function hsmeDenseBaselineDecisionV1Digest(
  decision: HsmeDenseBaselineDecisionV1,
  hash: HsmeDenseBaselineHashPortV1,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${HSME_DENSE_BASELINE_DIGEST_DOMAIN}${serializeHsmeDenseBaselineDecisionV1(decision)}`,
  );
  const digest = await hash.sha256(bytes);
  if (!/^[0-9a-f]{64}$/.test(digest)) fail('hsme_dense_baseline_hash_port_invalid', 'hash port must return lowercase SHA-256 hex');
  return digest;
}

function normalizeCandidate(raw: unknown, index: number): HsmeDenseBaselineCandidateV1 {
  const path = `candidates[${index}]`;
  const record = exactRecord(
    raw,
    ['candidateId', 'strategy', 'architectureFamily', 'verdict', 'reasons', 'sources', 'metrics'],
    ['candidateId', 'strategy', 'architectureFamily', 'verdict', 'reasons', 'sources', 'metrics'],
    path,
  );
  const candidateId = identifier(record.candidateId, `${path}.candidateId`, 120);
  const strategy = enumValue(record.strategy, STRATEGIES, `${path}.strategy`);
  const architectureFamily = boundedString(record.architectureFamily, `${path}.architectureFamily`, 120);
  const verdict = enumValue(record.verdict, VERDICTS, `${path}.verdict`);
  const reasons = boundedStringSet(record.reasons, `${path}.reasons`, 1, 12, 320);
  if (!Array.isArray(record.sources) || record.sources.length < 1 || record.sources.length > 8) {
    fail('hsme_dense_baseline_source_count_invalid', `${path}.sources must contain 1..8 entries`);
  }
  const sources = record.sources.map((source, sourceIndex) => normalizeSource(source, `${path}.sources[${sourceIndex}]`));
  const metrics = normalizeMetrics(record.metrics, `${path}.metrics`);

  if (strategy === 'BERS_DISTILLED_CORE' && verdict !== 'SELECTED_FOR_TRAINING' && verdict !== 'SELECTED_BASELINE') {
    fail('hsme_dense_baseline_candidate_invalid', 'BERS_DISTILLED_CORE must be selected for training or as the pinned baseline');
  }
  if (verdict === 'CONTROL_ONLY' && strategy !== 'CONTROL_BASELINE') {
    fail('hsme_dense_baseline_candidate_invalid', 'CONTROL_ONLY is reserved for CONTROL_BASELINE');
  }

  return deepFreeze({
    candidateId,
    strategy,
    architectureFamily,
    verdict,
    reasons,
    sources: Object.freeze([...sources].sort((a, b) => `${a.sourceClass}:${a.uri}`.localeCompare(`${b.sourceClass}:${b.uri}`))),
    metrics,
  });
}

function normalizeSource(raw: unknown, path: string): HsmeDenseBaselineSourceV1 {
  const record = exactRecord(
    raw,
    ['sourceClass', 'uri', 'revision', 'license', 'licenseState'],
    ['sourceClass', 'uri', 'license', 'licenseState'],
    path,
  );
  const sourceClass = enumValue(record.sourceClass, SOURCE_CLASSES, `${path}.sourceClass`);
  const uri = boundedString(record.uri, `${path}.uri`, 500);
  const license = boundedString(record.license, `${path}.license`, 160);
  const licenseState = enumValue(record.licenseState, LICENSE_STATES, `${path}.licenseState`);
  const revision = Object.hasOwn(record, 'revision')
    ? boundedString(record.revision, `${path}.revision`, 160)
    : undefined;
  if (sourceClass === 'PINNED_MODEL_EVIDENCE' && !revision) {
    fail('hsme_dense_baseline_source_invalid', `${path}.revision is required for PINNED_MODEL_EVIDENCE`);
  }
  return Object.freeze({ sourceClass, uri, ...(revision ? { revision } : {}), license, licenseState });
}

function normalizeMetrics(raw: unknown, path: string): HsmeDenseBaselineMetricsV1 {
  const record = exactRecord(
    raw,
    ['parametersMillions', 'fullPipelineBytes', 'textConditionerBytes', 'supportedStepCounts', 'reportedMobileLatencyMs', 'reportedMobileDevice'],
    ['parametersMillions', 'fullPipelineBytes', 'textConditionerBytes', 'supportedStepCounts', 'reportedMobileLatencyMs', 'reportedMobileDevice'],
    path,
  );
  const parametersMillions = unknownOrInteger(record.parametersMillions, `${path}.parametersMillions`, 1, 100_000);
  const fullPipelineBytes = unknownOrInteger(record.fullPipelineBytes, `${path}.fullPipelineBytes`, 1, Number.MAX_SAFE_INTEGER);
  const textConditionerBytes = unknownOrInteger(record.textConditionerBytes, `${path}.textConditionerBytes`, 0, Number.MAX_SAFE_INTEGER);
  const supportedStepCounts = boundedIntegerSet(record.supportedStepCounts, `${path}.supportedStepCounts`, 0, 16, 1, 1000);
  const reportedMobileLatencyMs = unknownOrInteger(record.reportedMobileLatencyMs, `${path}.reportedMobileLatencyMs`, 1, 3_600_000);
  const reportedMobileDevice = record.reportedMobileDevice === 'UNKNOWN'
    ? 'UNKNOWN' as const
    : boundedString(record.reportedMobileDevice, `${path}.reportedMobileDevice`, 160);
  return deepFreeze({
    parametersMillions,
    fullPipelineBytes,
    textConditionerBytes,
    supportedStepCounts,
    reportedMobileLatencyMs,
    reportedMobileDevice,
  });
}

function normalizeTrainingTarget(raw: unknown): HsmeDenseTrainingTargetV1 {
  const record = exactRecord(
    raw,
    ['candidateId', 'architectureFamily', 'activeParametersMillions', 'initialUsefulPackBytes', 'activeWeightsMaxBytes', 'textConditionerMaxBytes', 'targetStepCounts', 'requiredEvidence', 'architectureReferences'],
    ['candidateId', 'architectureFamily', 'activeParametersMillions', 'initialUsefulPackBytes', 'activeWeightsMaxBytes', 'textConditionerMaxBytes', 'targetStepCounts', 'requiredEvidence', 'architectureReferences'],
    'trainingTarget',
  );
  if (record.architectureFamily !== 'COMPACT_DIT') fail('hsme_dense_baseline_training_target_invalid', 'trainingTarget.architectureFamily must be COMPACT_DIT');
  const activeParametersMillions = normalizeRange(record.activeParametersMillions, 'trainingTarget.activeParametersMillions', 1, 10_000);
  const initialUsefulPackBytes = normalizeRange(record.initialUsefulPackBytes, 'trainingTarget.initialUsefulPackBytes', 1, Number.MAX_SAFE_INTEGER);
  const activeWeightsMaxBytes = safeInteger(record.activeWeightsMaxBytes, 'trainingTarget.activeWeightsMaxBytes', 1, Number.MAX_SAFE_INTEGER);
  const textConditionerMaxBytes = safeInteger(record.textConditionerMaxBytes, 'trainingTarget.textConditionerMaxBytes', 1, Number.MAX_SAFE_INTEGER);
  const targetStepCounts = boundedIntegerSet(record.targetStepCounts, 'trainingTarget.targetStepCounts', 2, 8, 1, 100);
  const requiredEvidence = boundedStringSet(record.requiredEvidence, 'trainingTarget.requiredEvidence', 6, 32, 160);
  const architectureReferences = boundedStringSet(record.architectureReferences, 'trainingTarget.architectureReferences', 2, 12, 500);
  if (textConditionerMaxBytes > activeWeightsMaxBytes) fail('hsme_dense_baseline_training_target_invalid', 'text conditioner cannot consume more than the active-weight target');
  return deepFreeze({
    candidateId: identifier(record.candidateId, 'trainingTarget.candidateId', 120),
    architectureFamily: 'COMPACT_DIT',
    activeParametersMillions,
    initialUsefulPackBytes,
    activeWeightsMaxBytes,
    textConditionerMaxBytes,
    targetStepCounts,
    requiredEvidence,
    architectureReferences,
  });
}

function normalizePin(raw: unknown): HsmeDenseBaselinePinV1 {
  const record = exactRecord(
    raw,
    [
      'modelId', 'version', 'sourceUri', 'sourceRevision', 'contentSha256', 'packageBytes', 'license', 'licenseConclusion',
      'licenseEvidenceSha256', 'toolchainLockSha256', 'architectureConfigSha256', 'representationManifestSha256',
      'evaluationContractSha256', 'qualityEvidenceSha256', 'runtimeEvidenceSha256', 'hsmeBindingEvidenceSha256',
    ],
    [
      'modelId', 'version', 'sourceUri', 'sourceRevision', 'contentSha256', 'packageBytes', 'license', 'licenseConclusion',
      'licenseEvidenceSha256', 'toolchainLockSha256', 'architectureConfigSha256', 'representationManifestSha256',
      'evaluationContractSha256', 'qualityEvidenceSha256', 'runtimeEvidenceSha256', 'hsmeBindingEvidenceSha256',
    ],
    'baselinePin',
  );
  if (record.licenseConclusion !== 'COMMERCIAL_ADMISSIBLE') fail('hsme_dense_baseline_pin_invalid', 'baseline pin requires commercial admissibility');
  const sourceRevision = boundedString(record.sourceRevision, 'baselinePin.sourceRevision', 64);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sourceRevision)) {
    fail('hsme_dense_baseline_pin_invalid', 'baseline pin sourceRevision must be an immutable 40- or 64-hex revision');
  }
  return deepFreeze({
    modelId: identifier(record.modelId, 'baselinePin.modelId', 120),
    version: identifier(record.version, 'baselinePin.version', 80),
    sourceUri: boundedString(record.sourceUri, 'baselinePin.sourceUri', 500),
    sourceRevision,
    contentSha256: sha256Value(record.contentSha256, 'baselinePin.contentSha256'),
    packageBytes: safeInteger(record.packageBytes, 'baselinePin.packageBytes', 1, Number.MAX_SAFE_INTEGER),
    license: boundedString(record.license, 'baselinePin.license', 160),
    licenseConclusion: 'COMMERCIAL_ADMISSIBLE',
    licenseEvidenceSha256: sha256Value(record.licenseEvidenceSha256, 'baselinePin.licenseEvidenceSha256'),
    toolchainLockSha256: sha256Value(record.toolchainLockSha256, 'baselinePin.toolchainLockSha256'),
    architectureConfigSha256: sha256Value(record.architectureConfigSha256, 'baselinePin.architectureConfigSha256'),
    representationManifestSha256: sha256Value(record.representationManifestSha256, 'baselinePin.representationManifestSha256'),
    evaluationContractSha256: sha256Value(record.evaluationContractSha256, 'baselinePin.evaluationContractSha256'),
    qualityEvidenceSha256: sha256Value(record.qualityEvidenceSha256, 'baselinePin.qualityEvidenceSha256'),
    runtimeEvidenceSha256: sha256Value(record.runtimeEvidenceSha256, 'baselinePin.runtimeEvidenceSha256'),
    hsmeBindingEvidenceSha256: sha256Value(record.hsmeBindingEvidenceSha256, 'baselinePin.hsmeBindingEvidenceSha256'),
  });
}

function normalizeRange(raw: unknown, path: string, min: number, max: number): Readonly<{ min: number; max: number }> {
  const record = exactRecord(raw, ['min', 'max'], ['min', 'max'], path);
  const low = safeInteger(record.min, `${path}.min`, min, max);
  const high = safeInteger(record.max, `${path}.max`, min, max);
  if (low > high) fail('hsme_dense_baseline_range_invalid', `${path}.min must be <= max`);
  return Object.freeze({ min: low, max: high });
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('hsme_dense_baseline_exact_schema_violation', `${path} must be an object`);
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) fail('hsme_dense_baseline_exact_schema_violation', `${path} must be a plain object`);
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(record, key))) {
    fail('hsme_dense_baseline_exact_schema_violation', `${path} contains unknown or missing fields`);
  }
  return record;
}

function enumValue<T extends readonly string[]>(raw: unknown, values: T, path: string): T[number] {
  if (typeof raw !== 'string' || !(values as readonly string[]).includes(raw)) fail('hsme_dense_baseline_value_invalid', `${path} is unsupported`);
  return raw as T[number];
}

function identifier(raw: unknown, path: string, maxLength: number): string {
  const value = boundedString(raw, path, maxLength);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value)) fail('hsme_dense_baseline_value_invalid', `${path} contains unsupported characters`);
  return value;
}

function boundedString(raw: unknown, path: string, maxLength: number): string {
  if (typeof raw !== 'string') fail('hsme_dense_baseline_value_invalid', `${path} must be a string`);
  const value = raw.trim();
  if (!value || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) fail('hsme_dense_baseline_value_invalid', `${path} is invalid`);
  return value;
}

function boundedStringSet(raw: unknown, path: string, minItems: number, maxItems: number, maxLength: number): readonly string[] {
  if (!Array.isArray(raw) || raw.length < minItems || raw.length > maxItems) fail('hsme_dense_baseline_value_invalid', `${path} must contain ${minItems}..${maxItems} entries`);
  const values = raw.map((value, index) => boundedString(value, `${path}[${index}]`, maxLength));
  if (new Set(values).size !== values.length) fail('hsme_dense_baseline_value_invalid', `${path} must not contain duplicates`);
  return Object.freeze([...values].sort());
}

function boundedIntegerSet(raw: unknown, path: string, minItems: number, maxItems: number, min: number, max: number): readonly number[] {
  if (!Array.isArray(raw) || raw.length < minItems || raw.length > maxItems) fail('hsme_dense_baseline_value_invalid', `${path} must contain ${minItems}..${maxItems} entries`);
  const values = raw.map((value, index) => safeInteger(value, `${path}[${index}]`, min, max));
  if (new Set(values).size !== values.length) fail('hsme_dense_baseline_value_invalid', `${path} must not contain duplicates`);
  return Object.freeze([...values].sort((a, b) => a - b));
}

function safeInteger(raw: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(raw) || (raw as number) < min || (raw as number) > max) fail('hsme_dense_baseline_value_invalid', `${path} must be a safe integer in [${min}, ${max}]`);
  return raw as number;
}

function unknownOrInteger(raw: unknown, path: string, min: number, max: number): number | 'UNKNOWN' {
  return raw === 'UNKNOWN' ? 'UNKNOWN' : safeInteger(raw, path, min, max);
}

function sha256Value(raw: unknown, path: string): string {
  if (typeof raw !== 'string' || !/^[0-9a-f]{64}$/.test(raw)) fail('hsme_dense_baseline_pin_invalid', `${path} must be lowercase SHA-256 hex`);
  return raw;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new HsmeDenseBaselineEvidenceV1Error(code, message);
}
