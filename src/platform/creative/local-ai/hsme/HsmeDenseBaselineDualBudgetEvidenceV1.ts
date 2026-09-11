export const HSME_DENSE_BASELINE_DUAL_BUDGET_EVIDENCE_V1_SCHEMA = 'BERS_HSME_DENSE_BASELINE_DUAL_BUDGET_EVIDENCE_V1' as const;

const DISPOSITIONS = Object.freeze([
  'R&D_ONLY',
  'REJECT',
  'COMPACT_DEFAULT_CANDIDATE',
  'OPTIONAL_EXTENDED_CANDIDATE',
  'LIMITED_DEVICE_TIER_CANDIDATE',
] as const);

const MVM_STATES = Object.freeze(['NOT_EVALUATED', 'RESIDENT', 'MVM_CANDIDATE'] as const);
const QUALITY_PER_BYTE_STATES = Object.freeze(['PENDING', 'MEASURED'] as const);

export type HsmeDenseDualBudgetNumberV1 = number | 'UNKNOWN';

export type HsmeDenseInstalledFootprintV1 = Readonly<{
  mandatoryInstalledBytes: HsmeDenseDualBudgetNumberV1;
  optionalInstalledBytes: HsmeDenseDualBudgetNumberV1;
  firstUseDownloadBytes: HsmeDenseDualBudgetNumberV1;
  knownInstalledLowerBoundBytes: HsmeDenseDualBudgetNumberV1;
  duplicateRepresentationBytes: HsmeDenseDualBudgetNumberV1;
  cacheHighWaterBytes: HsmeDenseDualBudgetNumberV1;
}>;

export type HsmeDenseWorkingMemoryFootprintV1 = Readonly<{
  activeWeightsBytes: HsmeDenseDualBudgetNumberV1;
  peakRamBytes: HsmeDenseDualBudgetNumberV1;
  peakAcceleratorBytes: HsmeDenseDualBudgetNumberV1;
  flashBytesMovedPerRun: HsmeDenseDualBudgetNumberV1;
}>;

export type HsmeDenseDualBudgetCandidateV1 = Readonly<{
  candidateId: string;
  installed: HsmeDenseInstalledFootprintV1;
  workingMemory: HsmeDenseWorkingMemoryFootprintV1;
  qualityPerInstalledGbStatus: typeof QUALITY_PER_BYTE_STATES[number];
  mvmState: typeof MVM_STATES[number];
  efficiencyDisposition: typeof DISPOSITIONS[number];
  notes: readonly string[];
}>;

export type HsmeDenseDualBudgetEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_DENSE_BASELINE_DUAL_BUDGET_EVIDENCE_V1_SCHEMA;
  policyPath: 'BERS_LOCAL_MODEL_EFFICIENCY_POLICY.md';
  policyMode: 'DUAL_BUDGET_COMPACT_FIRST';
  mvmLaw: 'MVM_IS_NOT_A_SIZE_WAIVER';
  candidates: readonly HsmeDenseDualBudgetCandidateV1[];
  requiredInstalledMetrics: readonly string[];
  requiredWorkingMemoryMetrics: readonly string[];
}>;

export class HsmeDenseDualBudgetEvidenceV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeDenseDualBudgetEvidenceV1Error';
    this.code = code;
  }
}

/**
 * R&D resource evidence only. This contract deliberately separates installed/download
 * footprint from working-memory/residency footprint and grants no model/runtime authority.
 */
export function normalizeHsmeDenseDualBudgetEvidenceV1(raw: unknown): HsmeDenseDualBudgetEvidenceV1 {
  const record = exactRecord(
    raw,
    ['schemaVersion', 'policyPath', 'policyMode', 'mvmLaw', 'candidates', 'requiredInstalledMetrics', 'requiredWorkingMemoryMetrics'],
    ['schemaVersion', 'policyPath', 'policyMode', 'mvmLaw', 'candidates', 'requiredInstalledMetrics', 'requiredWorkingMemoryMetrics'],
    'evidence',
  );

  if (record.schemaVersion !== HSME_DENSE_BASELINE_DUAL_BUDGET_EVIDENCE_V1_SCHEMA) {
    fail('hsme_dense_dual_budget_schema_unsupported', `schemaVersion must be ${HSME_DENSE_BASELINE_DUAL_BUDGET_EVIDENCE_V1_SCHEMA}`);
  }
  if (record.policyPath !== 'BERS_LOCAL_MODEL_EFFICIENCY_POLICY.md') {
    fail('hsme_dense_dual_budget_policy_invalid', 'policyPath must bind the canonical local model efficiency policy');
  }
  if (record.policyMode !== 'DUAL_BUDGET_COMPACT_FIRST') {
    fail('hsme_dense_dual_budget_policy_invalid', 'policyMode must be DUAL_BUDGET_COMPACT_FIRST');
  }
  if (record.mvmLaw !== 'MVM_IS_NOT_A_SIZE_WAIVER') {
    fail('hsme_dense_dual_budget_policy_invalid', 'MVM cannot waive compact-first model efficiency');
  }

  if (!Array.isArray(record.candidates) || record.candidates.length < 3 || record.candidates.length > 12) {
    fail('hsme_dense_dual_budget_candidate_count_invalid', 'candidates must contain 3..12 entries');
  }
  const candidates = record.candidates.map((candidate, index) => normalizeCandidate(candidate, index));
  const candidateIds = candidates.map(candidate => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    fail('hsme_dense_dual_budget_candidate_duplicate', 'candidateId must be unique');
  }

  const requiredInstalledMetrics = stringSet(record.requiredInstalledMetrics, 'requiredInstalledMetrics', 5, 16, 120);
  const requiredWorkingMemoryMetrics = stringSet(record.requiredWorkingMemoryMetrics, 'requiredWorkingMemoryMetrics', 4, 16, 120);

  for (const metric of [
    'mandatory-installed-bytes',
    'first-use-download-bytes',
    'duplicate-representation-bytes',
    'cache-high-water-bytes',
    'update-or-delta-download-bytes',
  ]) {
    if (!requiredInstalledMetrics.includes(metric)) {
      fail('hsme_dense_dual_budget_metric_missing', `requiredInstalledMetrics must include ${metric}`);
    }
  }
  for (const metric of [
    'active-weights-bytes',
    'peak-ram-bytes',
    'peak-accelerator-bytes',
    'flash-bytes-moved-per-run',
  ]) {
    if (!requiredWorkingMemoryMetrics.includes(metric)) {
      fail('hsme_dense_dual_budget_metric_missing', `requiredWorkingMemoryMetrics must include ${metric}`);
    }
  }

  return deepFreeze({
    schemaVersion: HSME_DENSE_BASELINE_DUAL_BUDGET_EVIDENCE_V1_SCHEMA,
    policyPath: 'BERS_LOCAL_MODEL_EFFICIENCY_POLICY.md',
    policyMode: 'DUAL_BUDGET_COMPACT_FIRST',
    mvmLaw: 'MVM_IS_NOT_A_SIZE_WAIVER',
    candidates: Object.freeze([...candidates].sort((a, b) => a.candidateId.localeCompare(b.candidateId))),
    requiredInstalledMetrics,
    requiredWorkingMemoryMetrics,
  });
}

function normalizeCandidate(raw: unknown, index: number): HsmeDenseDualBudgetCandidateV1 {
  const path = `candidates[${index}]`;
  const record = exactRecord(
    raw,
    ['candidateId', 'installed', 'workingMemory', 'qualityPerInstalledGbStatus', 'mvmState', 'efficiencyDisposition', 'notes'],
    ['candidateId', 'installed', 'workingMemory', 'qualityPerInstalledGbStatus', 'mvmState', 'efficiencyDisposition', 'notes'],
    path,
  );

  const candidateId = identifier(record.candidateId, `${path}.candidateId`);
  const installed = normalizeInstalled(record.installed, `${path}.installed`);
  const workingMemory = normalizeWorkingMemory(record.workingMemory, `${path}.workingMemory`);
  const qualityPerInstalledGbStatus = enumValue(record.qualityPerInstalledGbStatus, QUALITY_PER_BYTE_STATES, `${path}.qualityPerInstalledGbStatus`);
  const mvmState = enumValue(record.mvmState, MVM_STATES, `${path}.mvmState`);
  const efficiencyDisposition = enumValue(record.efficiencyDisposition, DISPOSITIONS, `${path}.efficiencyDisposition`);
  const notes = stringSet(record.notes, `${path}.notes`, 1, 12, 320);

  const productCandidate = efficiencyDisposition === 'COMPACT_DEFAULT_CANDIDATE'
    || efficiencyDisposition === 'OPTIONAL_EXTENDED_CANDIDATE'
    || efficiencyDisposition === 'LIMITED_DEVICE_TIER_CANDIDATE';
  if (productCandidate) {
    if (qualityPerInstalledGbStatus !== 'MEASURED') {
      fail('hsme_dense_dual_budget_product_candidate_invalid', `${path} cannot claim a product candidate without quality-per-installed-GB evidence`);
    }
    if (installed.mandatoryInstalledBytes === 'UNKNOWN' || workingMemory.peakRamBytes === 'UNKNOWN') {
      fail('hsme_dense_dual_budget_product_candidate_invalid', `${path} requires measured installed bytes and peak RAM before product candidacy`);
    }
  }

  if (mvmState === 'MVM_CANDIDATE' && workingMemory.flashBytesMovedPerRun === 'UNKNOWN') {
    fail('hsme_dense_dual_budget_mvm_invalid', `${path} cannot claim MVM_CANDIDATE without flash movement evidence`);
  }

  return deepFreeze({
    candidateId,
    installed,
    workingMemory,
    qualityPerInstalledGbStatus,
    mvmState,
    efficiencyDisposition,
    notes,
  });
}

function normalizeInstalled(raw: unknown, path: string): HsmeDenseInstalledFootprintV1 {
  const record = exactRecord(
    raw,
    ['mandatoryInstalledBytes', 'optionalInstalledBytes', 'firstUseDownloadBytes', 'knownInstalledLowerBoundBytes', 'duplicateRepresentationBytes', 'cacheHighWaterBytes'],
    ['mandatoryInstalledBytes', 'optionalInstalledBytes', 'firstUseDownloadBytes', 'knownInstalledLowerBoundBytes', 'duplicateRepresentationBytes', 'cacheHighWaterBytes'],
    path,
  );
  const mandatoryInstalledBytes = unknownOrInteger(record.mandatoryInstalledBytes, `${path}.mandatoryInstalledBytes`, 0);
  const optionalInstalledBytes = unknownOrInteger(record.optionalInstalledBytes, `${path}.optionalInstalledBytes`, 0);
  const firstUseDownloadBytes = unknownOrInteger(record.firstUseDownloadBytes, `${path}.firstUseDownloadBytes`, 0);
  const knownInstalledLowerBoundBytes = unknownOrInteger(record.knownInstalledLowerBoundBytes, `${path}.knownInstalledLowerBoundBytes`, 0);
  const duplicateRepresentationBytes = unknownOrInteger(record.duplicateRepresentationBytes, `${path}.duplicateRepresentationBytes`, 0);
  const cacheHighWaterBytes = unknownOrInteger(record.cacheHighWaterBytes, `${path}.cacheHighWaterBytes`, 0);

  if (mandatoryInstalledBytes !== 'UNKNOWN' && knownInstalledLowerBoundBytes !== 'UNKNOWN' && knownInstalledLowerBoundBytes > mandatoryInstalledBytes) {
    fail('hsme_dense_dual_budget_installed_invalid', `${path}.knownInstalledLowerBoundBytes cannot exceed measured mandatoryInstalledBytes`);
  }

  return deepFreeze({
    mandatoryInstalledBytes,
    optionalInstalledBytes,
    firstUseDownloadBytes,
    knownInstalledLowerBoundBytes,
    duplicateRepresentationBytes,
    cacheHighWaterBytes,
  });
}

function normalizeWorkingMemory(raw: unknown, path: string): HsmeDenseWorkingMemoryFootprintV1 {
  const record = exactRecord(
    raw,
    ['activeWeightsBytes', 'peakRamBytes', 'peakAcceleratorBytes', 'flashBytesMovedPerRun'],
    ['activeWeightsBytes', 'peakRamBytes', 'peakAcceleratorBytes', 'flashBytesMovedPerRun'],
    path,
  );
  return deepFreeze({
    activeWeightsBytes: unknownOrInteger(record.activeWeightsBytes, `${path}.activeWeightsBytes`, 0),
    peakRamBytes: unknownOrInteger(record.peakRamBytes, `${path}.peakRamBytes`, 0),
    peakAcceleratorBytes: unknownOrInteger(record.peakAcceleratorBytes, `${path}.peakAcceleratorBytes`, 0),
    flashBytesMovedPerRun: unknownOrInteger(record.flashBytesMovedPerRun, `${path}.flashBytesMovedPerRun`, 0),
  });
}

function exactRecord(raw: unknown, allowed: readonly string[], required: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('hsme_dense_dual_budget_exact_schema_violation', `${path} must be an object`);
  const prototype = Object.getPrototypeOf(raw);
  if (prototype !== Object.prototype && prototype !== null) fail('hsme_dense_dual_budget_exact_schema_violation', `${path} must be a plain object`);
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(record, key))) {
    fail('hsme_dense_dual_budget_exact_schema_violation', `${path} contains unknown or missing fields`);
  }
  return record;
}

function enumValue<T extends readonly string[]>(raw: unknown, values: T, path: string): T[number] {
  if (typeof raw !== 'string' || !(values as readonly string[]).includes(raw)) fail('hsme_dense_dual_budget_value_invalid', `${path} is unsupported`);
  return raw as T[number];
}

function identifier(raw: unknown, path: string): string {
  const value = stringValue(raw, path, 120);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/.test(value)) fail('hsme_dense_dual_budget_value_invalid', `${path} contains unsupported characters`);
  return value;
}

function stringSet(raw: unknown, path: string, minItems: number, maxItems: number, maxLength: number): readonly string[] {
  if (!Array.isArray(raw) || raw.length < minItems || raw.length > maxItems) fail('hsme_dense_dual_budget_value_invalid', `${path} must contain ${minItems}..${maxItems} entries`);
  const values = raw.map((value, index) => stringValue(value, `${path}[${index}]`, maxLength));
  if (new Set(values).size !== values.length) fail('hsme_dense_dual_budget_value_invalid', `${path} must not contain duplicates`);
  return Object.freeze([...values].sort());
}

function stringValue(raw: unknown, path: string, maxLength: number): string {
  if (typeof raw !== 'string') fail('hsme_dense_dual_budget_value_invalid', `${path} must be a string`);
  const value = raw.trim();
  if (!value || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) fail('hsme_dense_dual_budget_value_invalid', `${path} is invalid`);
  return value;
}

function unknownOrInteger(raw: unknown, path: string, min: number): HsmeDenseDualBudgetNumberV1 {
  if (raw === 'UNKNOWN') return 'UNKNOWN';
  if (!Number.isSafeInteger(raw) || (raw as number) < min) fail('hsme_dense_dual_budget_value_invalid', `${path} must be UNKNOWN or a safe integer >= ${min}`);
  return raw as number;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new HsmeDenseDualBudgetEvidenceV1Error(code, message);
}
