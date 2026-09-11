import {
  HSME_QUALITY_POLICY_V1,
  normalizeHsmeTeacherDecisionV1,
} from './HsmeTrainingProvenanceV1';

export const HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA = 'BERS_HSME_TEACHER_QUALITY_BAKEOFF_V1' as const;

const HEX64 = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const CAPABILITIES = Object.freeze([
  'TEXT_TO_IMAGE',
  'IMAGE_EDITING',
  'MULTI_REFERENCE_EDITING',
] as const);
const METRIC_DIRECTIONS = Object.freeze(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER'] as const);
const HUMAN_DECISIONS = Object.freeze(['PASS', 'FAIL'] as const);

type HsmeTeacherQualityCapabilityV1 = typeof CAPABILITIES[number];
type HsmeTeacherMetricDirectionV1 = typeof METRIC_DIRECTIONS[number];

export type HsmeTeacherAutomatedQualityCheckV1 = Readonly<{
  metricId: string;
  capability: HsmeTeacherQualityCapabilityV1;
  direction: HsmeTeacherMetricDirectionV1;
  observedMicrounits: number;
  thresholdMicrounits: number;
  evidenceSha256: string;
  passed: boolean;
}>;

export type HsmeTeacherHumanQualityCheckV1 = Readonly<{
  dimensionId: string;
  capability: HsmeTeacherQualityCapabilityV1;
  rubricSha256: string;
  panelSha256: string;
  evidenceSha256: string;
  decision: typeof HUMAN_DECISIONS[number];
}>;

export type HsmeTeacherQualityCandidateResultV1 = Readonly<{
  teacherCandidateId: string;
  immutableRevision: string;
  modelContentSha256: string;
  capabilities: readonly HsmeTeacherQualityCapabilityV1[];
  outputSetSha256: string;
  automatedChecks: readonly HsmeTeacherAutomatedQualityCheckV1[];
  humanChecks: readonly HsmeTeacherHumanQualityCheckV1[];
  qualityGatePassed: boolean;
}>;

export type HsmeTeacherQualityBakeoffV1 = Readonly<{
  schemaVersion: typeof HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA;
  policy: typeof HSME_QUALITY_POLICY_V1;
  benchmarkPolicySha256: string;
  fixtureSetSha256: string;
  requiredCapabilities: readonly HsmeTeacherQualityCapabilityV1[];
  candidateResults: readonly HsmeTeacherQualityCandidateResultV1[];
  selectionRationaleSha256: string;
}>;

export type HsmeTeacherQualityAdmissionEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA;
  policy: typeof HSME_QUALITY_POLICY_V1;
  selectedTeacherIds: readonly string[];
  requiredCapabilities: readonly HsmeTeacherQualityCapabilityV1[];
  coveredCapabilities: readonly HsmeTeacherQualityCapabilityV1[];
  comparedCandidateCount: number;
}>;

export class HsmeTeacherQualityEvidenceV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeTeacherQualityEvidenceV1Error';
    this.code = code;
  }
}

export function normalizeHsmeTeacherQualityBakeoffV1(raw: unknown): HsmeTeacherQualityBakeoffV1 {
  const record = exactRecord(raw, [
    'schemaVersion',
    'policy',
    'benchmarkPolicySha256',
    'fixtureSetSha256',
    'requiredCapabilities',
    'candidateResults',
    'selectionRationaleSha256',
  ], 'teacherQualityBakeoff');
  if (record.schemaVersion !== HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA) {
    fail('hsme_teacher_quality_schema_unsupported', 'teacher quality bakeoff schema is unsupported');
  }
  if (record.policy !== HSME_QUALITY_POLICY_V1) {
    fail('hsme_teacher_quality_policy_invalid', `teacher quality policy must be ${HSME_QUALITY_POLICY_V1}`);
  }
  if (!Array.isArray(record.candidateResults) || record.candidateResults.length < 3 || record.candidateResults.length > 12) {
    fail('hsme_teacher_quality_candidate_count_invalid', 'teacher quality bakeoff requires 3..12 candidate results');
  }
  const candidateResults = record.candidateResults.map((value, index) => normalizeCandidateResult(value, `candidateResults[${index}]`));
  const candidateIds = candidateResults.map(result => result.teacherCandidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    fail('hsme_teacher_quality_candidate_duplicate', 'teacher quality candidate ids must be unique');
  }
  const requiredCapabilities = capabilitySet(record.requiredCapabilities, 'requiredCapabilities', 1, CAPABILITIES.length);
  for (const capability of requiredCapabilities) {
    if (!candidateResults.some(result => result.capabilities.includes(capability))) {
      fail('hsme_teacher_quality_capability_unmeasured', `required capability ${capability} has no measured candidate`);
    }
  }

  return Object.freeze({
    schemaVersion: HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA,
    policy: HSME_QUALITY_POLICY_V1,
    benchmarkPolicySha256: sha256(record.benchmarkPolicySha256, 'benchmarkPolicySha256'),
    fixtureSetSha256: sha256(record.fixtureSetSha256, 'fixtureSetSha256'),
    requiredCapabilities,
    candidateResults: Object.freeze([...candidateResults].sort((left, right) => lexical(left.teacherCandidateId, right.teacherCandidateId))),
    selectionRationaleSha256: sha256(record.selectionRationaleSha256, 'selectionRationaleSha256'),
  });
}

export function proveHsmeTeacherQualityAdmissionV1(
  rawDecision: unknown,
  rawBakeoff: unknown,
): HsmeTeacherQualityAdmissionEvidenceV1 {
  const decision = normalizeHsmeTeacherDecisionV1(rawDecision);
  if (decision.decisionStatus !== 'TEACHER_SET_ADMITTED' || decision.selectedCandidateIds.length < 1) {
    fail('hsme_teacher_quality_decision_not_admitted', 'quality admission requires a selected admitted teacher set');
  }
  const bakeoff = normalizeHsmeTeacherQualityBakeoffV1(rawBakeoff);

  const decisionIds = [...decision.candidates.map(candidate => candidate.candidateId)].sort(lexical);
  const resultIds = [...bakeoff.candidateResults.map(result => result.teacherCandidateId)].sort(lexical);
  if (!sameStrings(decisionIds, resultIds)) {
    fail('hsme_teacher_quality_candidate_set_mismatch', 'quality bakeoff must compare exactly every teacher candidate in the decision');
  }

  const selectedIds = Object.freeze([...decision.selectedCandidateIds].sort(lexical));
  const selectedResults: HsmeTeacherQualityCandidateResultV1[] = [];
  for (const teacherCandidateId of selectedIds) {
    const candidate = decision.candidates.find(value => value.candidateId === teacherCandidateId)!;
    const result = bakeoff.candidateResults.find(value => value.teacherCandidateId === teacherCandidateId)!;
    if (!result.qualityGatePassed) {
      fail('hsme_teacher_quality_gate_failed', `${teacherCandidateId} cannot be admitted because measured quality checks failed`);
    }
    if (!candidate.immutableRevision || candidate.immutableRevision !== result.immutableRevision) {
      fail('hsme_teacher_quality_revision_mismatch', `${teacherCandidateId} quality evidence does not bind the admitted immutable revision`);
    }
    if (!candidate.contentSha256 || candidate.contentSha256 !== result.modelContentSha256) {
      fail('hsme_teacher_quality_content_mismatch', `${teacherCandidateId} quality evidence does not bind the admitted model content`);
    }
    selectedResults.push(result);
  }

  const covered = new Set<HsmeTeacherQualityCapabilityV1>();
  for (const result of selectedResults) {
    for (const capability of result.capabilities) covered.add(capability);
  }
  for (const capability of bakeoff.requiredCapabilities) {
    if (!covered.has(capability)) {
      fail('hsme_teacher_quality_selected_coverage_incomplete', `selected teacher set does not cover required capability ${capability}`);
    }
  }

  return Object.freeze({
    schemaVersion: HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA,
    policy: HSME_QUALITY_POLICY_V1,
    selectedTeacherIds: selectedIds,
    requiredCapabilities: bakeoff.requiredCapabilities,
    coveredCapabilities: Object.freeze([...covered].sort(lexical)),
    comparedCandidateCount: bakeoff.candidateResults.length,
  });
}

function normalizeCandidateResult(raw: unknown, path: string): HsmeTeacherQualityCandidateResultV1 {
  const record = exactRecord(raw, [
    'teacherCandidateId',
    'immutableRevision',
    'modelContentSha256',
    'capabilities',
    'outputSetSha256',
    'automatedChecks',
    'humanChecks',
  ], path);
  const capabilities = capabilitySet(record.capabilities, `${path}.capabilities`, 1, CAPABILITIES.length);
  if (!Array.isArray(record.automatedChecks) || record.automatedChecks.length < capabilities.length || record.automatedChecks.length > 64) {
    fail('hsme_teacher_quality_automated_check_count_invalid', `${path}.automatedChecks must contain ${capabilities.length}..64 checks`);
  }
  if (!Array.isArray(record.humanChecks) || record.humanChecks.length < capabilities.length || record.humanChecks.length > 64) {
    fail('hsme_teacher_quality_human_check_count_invalid', `${path}.humanChecks must contain ${capabilities.length}..64 checks`);
  }
  const automatedChecks = record.automatedChecks.map((value, index) => normalizeAutomatedCheck(value, `${path}.automatedChecks[${index}]`));
  const humanChecks = record.humanChecks.map((value, index) => normalizeHumanCheck(value, `${path}.humanChecks[${index}]`));
  assertUniqueIds(automatedChecks.map(check => check.metricId), `${path}.automatedChecks`, 'hsme_teacher_quality_metric_duplicate');
  assertUniqueIds(humanChecks.map(check => check.dimensionId), `${path}.humanChecks`, 'hsme_teacher_quality_human_dimension_duplicate');
  for (const capability of capabilities) {
    if (!automatedChecks.some(check => check.capability === capability)) {
      fail('hsme_teacher_quality_automated_capability_missing', `${path} lacks automated evidence for ${capability}`);
    }
    if (!humanChecks.some(check => check.capability === capability)) {
      fail('hsme_teacher_quality_human_capability_missing', `${path} lacks human review evidence for ${capability}`);
    }
  }
  for (const check of automatedChecks) {
    if (!capabilities.includes(check.capability)) {
      fail('hsme_teacher_quality_check_capability_unclaimed', `${path} automated check references unclaimed capability ${check.capability}`);
    }
  }
  for (const check of humanChecks) {
    if (!capabilities.includes(check.capability)) {
      fail('hsme_teacher_quality_check_capability_unclaimed', `${path} human check references unclaimed capability ${check.capability}`);
    }
  }
  const qualityGatePassed = automatedChecks.every(check => check.passed) && humanChecks.every(check => check.decision === 'PASS');

  return Object.freeze({
    teacherCandidateId: identifier(record.teacherCandidateId, `${path}.teacherCandidateId`, 120),
    immutableRevision: immutableRevision(record.immutableRevision, `${path}.immutableRevision`),
    modelContentSha256: sha256(record.modelContentSha256, `${path}.modelContentSha256`),
    capabilities,
    outputSetSha256: sha256(record.outputSetSha256, `${path}.outputSetSha256`),
    automatedChecks: Object.freeze([...automatedChecks].sort((left, right) => lexical(left.metricId, right.metricId))),
    humanChecks: Object.freeze([...humanChecks].sort((left, right) => lexical(left.dimensionId, right.dimensionId))),
    qualityGatePassed,
  });
}

function normalizeAutomatedCheck(raw: unknown, path: string): HsmeTeacherAutomatedQualityCheckV1 {
  const record = exactRecord(raw, [
    'metricId',
    'capability',
    'direction',
    'observedMicrounits',
    'thresholdMicrounits',
    'evidenceSha256',
  ], path);
  const direction = enumValue(record.direction, METRIC_DIRECTIONS, `${path}.direction`);
  const observedMicrounits = integer(record.observedMicrounits, `${path}.observedMicrounits`, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const thresholdMicrounits = integer(record.thresholdMicrounits, `${path}.thresholdMicrounits`, -Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  const passed = direction === 'HIGHER_IS_BETTER'
    ? observedMicrounits >= thresholdMicrounits
    : observedMicrounits <= thresholdMicrounits;
  return Object.freeze({
    metricId: identifier(record.metricId, `${path}.metricId`, 120),
    capability: enumValue(record.capability, CAPABILITIES, `${path}.capability`),
    direction,
    observedMicrounits,
    thresholdMicrounits,
    evidenceSha256: sha256(record.evidenceSha256, `${path}.evidenceSha256`),
    passed,
  });
}

function normalizeHumanCheck(raw: unknown, path: string): HsmeTeacherHumanQualityCheckV1 {
  const record = exactRecord(raw, [
    'dimensionId',
    'capability',
    'rubricSha256',
    'panelSha256',
    'evidenceSha256',
    'decision',
  ], path);
  return Object.freeze({
    dimensionId: identifier(record.dimensionId, `${path}.dimensionId`, 120),
    capability: enumValue(record.capability, CAPABILITIES, `${path}.capability`),
    rubricSha256: sha256(record.rubricSha256, `${path}.rubricSha256`),
    panelSha256: sha256(record.panelSha256, `${path}.panelSha256`),
    evidenceSha256: sha256(record.evidenceSha256, `${path}.evidenceSha256`),
    decision: enumValue(record.decision, HUMAN_DECISIONS, `${path}.decision`),
  });
}

function exactRecord(raw: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('hsme_teacher_quality_record_invalid', `${path} must be an object`);
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.includes(key)) fail('hsme_teacher_quality_field_unknown', `${path}.${key} is not allowed`);
  for (const key of allowed) if (!Object.hasOwn(record, key)) fail('hsme_teacher_quality_field_missing', `${path}.${key} is required`);
  return record;
}

function capabilitySet(value: unknown, path: string, min: number, max: number): readonly HsmeTeacherQualityCapabilityV1[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail('hsme_teacher_quality_capability_count_invalid', `${path} must contain ${min}..${max} capabilities`);
  const result = value.map((entry, index) => enumValue(entry, CAPABILITIES, `${path}[${index}]`));
  if (new Set(result).size !== result.length) fail('hsme_teacher_quality_capability_duplicate', `${path} must be unique`);
  return Object.freeze([...result].sort(lexical));
}

function assertUniqueIds(values: readonly string[], path: string, code: string): void {
  if (new Set(values).size !== values.length) fail(code, `${path} identifiers must be unique`);
}

function immutableRevision(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!IMMUTABLE_REVISION.test(result)) fail('hsme_teacher_quality_revision_invalid', `${path} must be immutable 40/64-hex`);
  return result;
}

function sha256(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!HEX64.test(result)) fail('hsme_teacher_quality_hash_invalid', `${path} must be lowercase SHA-256`);
  return result;
}

function identifier(value: unknown, path: string, max: number): string {
  const result = text(value, path, max);
  if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) fail('hsme_teacher_quality_identifier_invalid', `${path} is invalid`);
  return result;
}

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    fail('hsme_teacher_quality_text_invalid', `${path} is invalid`);
  }
  return value;
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_teacher_quality_integer_invalid', `${path} is invalid`);
  }
  return value as number;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) fail('hsme_teacher_quality_enum_invalid', `${path} is invalid`);
  return value as T[number];
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string, message: string): never {
  throw new HsmeTeacherQualityEvidenceV1Error(code, message);
}
