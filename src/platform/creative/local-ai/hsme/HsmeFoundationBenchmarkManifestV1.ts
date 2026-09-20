import {
  HSME_FOUNDATION_REUSE_QUALITY_POLICY,
} from './HsmeFoundationReuseDecisionV1';

export const HSME_FOUNDATION_BENCHMARK_MANIFEST_V1_SCHEMA = 'BERS_HSME_FOUNDATION_BENCHMARK_MANIFEST_V1' as const;
export const HSME_FOUNDATION_BENCHMARK_MANIFEST_V1_DIGEST_DOMAIN = 'bers:hsme:foundation-benchmark-manifest:v1\0' as const;

const ROLES = Object.freeze([
  'CONTROL_BASELINE',
  'DIRECT_FOUNDATION',
  'MOBILE_REUSE',
  'QUALITY_REFERENCE',
] as const);
const CAPABILITIES = Object.freeze([
  'TEXT_TO_IMAGE',
  'IMAGE_EDITING',
  'MULTI_REFERENCE_EDITING',
  'TEXT_RENDERING',
] as const);
const MODES = Object.freeze([
  'ZERO_TRAINING',
  'PROJECTOR_BRIDGE',
  'LORA',
] as const);
const LICENSE_STATES = Object.freeze([
  'COMMERCIAL_ADMISSIBLE',
  'REVIEW_REQUIRED',
  'REFERENCE_ONLY',
] as const);
const REVIEW_MODES = Object.freeze([
  'AUTOMATED',
  'BLINDED_HUMAN',
  'HYBRID',
] as const);
const DIMENSIONS = Object.freeze([
  'identity-preservation',
  'garment-logo-pattern-preservation',
  'non-target-preservation',
  'semantic-adherence',
  'anatomy-artifact-rate',
  'photorealism',
  'material-realism',
  'text-fidelity',
  'edit-compliance',
  'multi-reference-consistency',
] as const);
const REQUIRED_DIMENSIONS = Object.freeze([
  'identity-preservation',
  'garment-logo-pattern-preservation',
  'non-target-preservation',
  'semantic-adherence',
  'anatomy-artifact-rate',
] as const);

const HEX64 = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

type Role = typeof ROLES[number];
type Capability = typeof CAPABILITIES[number];
type Mode = typeof MODES[number];
type LicenseState = typeof LICENSE_STATES[number];
type ReviewMode = typeof REVIEW_MODES[number];
type Dimension = typeof DIMENSIONS[number];

export type HsmeFoundationBenchmarkCandidateV1 = Readonly<{
  candidateId: string;
  roles: readonly Role[];
  sourceRoot: string;
  immutableRevision: string;
  modelContentSha256: string;
  capabilities: readonly Capability[];
  executionProfileSha256: string;
  licenseState: LicenseState;
  licenseEvidenceSha256: string;
  benchmarkMode: Mode;
}>;

export type HsmeFoundationBenchmarkDimensionV1 = Readonly<{
  dimensionId: Dimension;
  referenceCandidateId: string;
  maxLossMicrounits: number;
  reviewMode: ReviewMode;
}>;

export type HsmeFoundationBenchmarkManifestV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_BENCHMARK_MANIFEST_V1_SCHEMA;
  qualityPolicy: typeof HSME_FOUNDATION_REUSE_QUALITY_POLICY;
  fixtureSetSha256: string;
  fixturePolicySha256: string;
  promptInputSetSha256: string;
  blindedReviewRubricSha256: string;
  deterministicInputPolicySha256: string;
  outputSetContractSha256: string;
  requiredCapabilities: readonly Capability[];
  candidates: readonly HsmeFoundationBenchmarkCandidateV1[];
  dimensions: readonly HsmeFoundationBenchmarkDimensionV1[];
  postObservationCandidateChangesAllowed: false;
  postObservationThresholdChangesAllowed: false;
  postObservationDimensionOrderChangesAllowed: false;
  postObservationReferenceChangesAllowed: false;
  productionAuthorityGranted: false;
  providerAuthorityGranted: false;
  billingAuthorityGranted: false;
  projectArtifactMutationAllowed: false;
  aeeExecutionAuthorityGranted: false;
  trainingOrDistillationAllowed: false;
}>;

export interface HsmeFoundationBenchmarkManifestHashPortV1 {
  sha256(bytes: Uint8Array): Promise<string>;
}

export class HsmeFoundationBenchmarkManifestV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeFoundationBenchmarkManifestV1Error';
    this.code = code;
  }
}

export function normalizeHsmeFoundationBenchmarkManifestV1(raw: unknown): HsmeFoundationBenchmarkManifestV1 {
  const record = exactRecord(raw, [
    'schemaVersion',
    'qualityPolicy',
    'fixtureSetSha256',
    'fixturePolicySha256',
    'promptInputSetSha256',
    'blindedReviewRubricSha256',
    'deterministicInputPolicySha256',
    'outputSetContractSha256',
    'requiredCapabilities',
    'candidates',
    'dimensions',
    'postObservationCandidateChangesAllowed',
    'postObservationThresholdChangesAllowed',
    'postObservationDimensionOrderChangesAllowed',
    'postObservationReferenceChangesAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'trainingOrDistillationAllowed',
  ], 'manifest');

  if (record.schemaVersion !== HSME_FOUNDATION_BENCHMARK_MANIFEST_V1_SCHEMA) {
    fail('hsme_foundation_benchmark_manifest_schema_unsupported', 'unsupported benchmark manifest schema');
  }
  if (record.qualityPolicy !== HSME_FOUNDATION_REUSE_QUALITY_POLICY) {
    fail('hsme_foundation_benchmark_manifest_quality_policy_invalid', 'quality-first policy is mandatory');
  }

  const requiredCapabilities = enumSet(record.requiredCapabilities, CAPABILITIES, 'requiredCapabilities', 1, CAPABILITIES.length);

  if (!Array.isArray(record.candidates) || record.candidates.length < 4 || record.candidates.length > 12) {
    fail('hsme_foundation_benchmark_manifest_candidate_count_invalid', 'candidates must contain 4..12 entries');
  }
  const candidates = record.candidates.map((value, index) => normalizeCandidate(value, `candidates[${index}]`));
  const candidateIds = candidates.map(candidate => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    fail('hsme_foundation_benchmark_manifest_candidate_duplicate', 'candidate ids must be unique');
  }
  for (const role of ROLES) {
    if (!candidates.some(candidate => candidate.roles.includes(role))) {
      fail('hsme_foundation_benchmark_manifest_role_missing', `candidate set must include role ${role}`);
    }
  }
  for (const capability of requiredCapabilities) {
    const selectable = candidates.some(candidate =>
      (candidate.roles.includes('DIRECT_FOUNDATION') || candidate.roles.includes('MOBILE_REUSE'))
      && candidate.capabilities.includes(capability),
    );
    if (!selectable) {
      fail(
        'hsme_foundation_benchmark_manifest_selectable_capability_uncovered',
        `required capability has no selectable reuse candidate: ${capability}`,
      );
    }
    const reference = candidates.some(candidate =>
      candidate.roles.includes('QUALITY_REFERENCE')
      && candidate.capabilities.includes(capability),
    );
    if (!reference) {
      fail(
        'hsme_foundation_benchmark_manifest_reference_capability_uncovered',
        `required capability has no quality reference: ${capability}`,
      );
    }
  }

  if (!Array.isArray(record.dimensions) || record.dimensions.length < REQUIRED_DIMENSIONS.length || record.dimensions.length > DIMENSIONS.length) {
    fail('hsme_foundation_benchmark_manifest_dimension_count_invalid', 'dimension count is invalid');
  }
  const dimensions = record.dimensions.map((value, index) => normalizeDimension(value, `dimensions[${index}]`));
  const dimensionIds = dimensions.map(dimension => dimension.dimensionId);
  if (new Set(dimensionIds).size !== dimensionIds.length) {
    fail('hsme_foundation_benchmark_manifest_dimension_duplicate', 'dimension ids must be unique');
  }
  for (const required of REQUIRED_DIMENSIONS) {
    if (!dimensionIds.includes(required)) {
      fail('hsme_foundation_benchmark_manifest_required_dimension_missing', `required dimension missing: ${required}`);
    }
  }
  for (const dimension of dimensions) {
    const reference = candidates.find(candidate => candidate.candidateId === dimension.referenceCandidateId);
    if (!reference) {
      fail('hsme_foundation_benchmark_manifest_reference_missing', `reference candidate is missing: ${dimension.referenceCandidateId}`);
    }
    if (!reference.roles.includes('QUALITY_REFERENCE')) {
      fail('hsme_foundation_benchmark_manifest_reference_role_invalid', `${dimension.referenceCandidateId} must carry QUALITY_REFERENCE role`);
    }
  }

  const falseFlags = [
    'postObservationCandidateChangesAllowed',
    'postObservationThresholdChangesAllowed',
    'postObservationDimensionOrderChangesAllowed',
    'postObservationReferenceChangesAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'trainingOrDistillationAllowed',
  ] as const;
  for (const flag of falseFlags) {
    if (record[flag] !== false) {
      fail('hsme_foundation_benchmark_manifest_authority_or_mutation_invalid', `${flag} must be false`);
    }
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_BENCHMARK_MANIFEST_V1_SCHEMA,
    qualityPolicy: HSME_FOUNDATION_REUSE_QUALITY_POLICY,
    fixtureSetSha256: sha256(record.fixtureSetSha256, 'fixtureSetSha256'),
    fixturePolicySha256: sha256(record.fixturePolicySha256, 'fixturePolicySha256'),
    promptInputSetSha256: sha256(record.promptInputSetSha256, 'promptInputSetSha256'),
    blindedReviewRubricSha256: sha256(record.blindedReviewRubricSha256, 'blindedReviewRubricSha256'),
    deterministicInputPolicySha256: sha256(record.deterministicInputPolicySha256, 'deterministicInputPolicySha256'),
    outputSetContractSha256: sha256(record.outputSetContractSha256, 'outputSetContractSha256'),
    requiredCapabilities,
    candidates: Object.freeze([...candidates].sort((left, right) => lexical(left.candidateId, right.candidateId))),
    dimensions: Object.freeze([...dimensions]),
    postObservationCandidateChangesAllowed: false,
    postObservationThresholdChangesAllowed: false,
    postObservationDimensionOrderChangesAllowed: false,
    postObservationReferenceChangesAllowed: false,
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    billingAuthorityGranted: false,
    projectArtifactMutationAllowed: false,
    aeeExecutionAuthorityGranted: false,
    trainingOrDistillationAllowed: false,
  });
}

export function serializeHsmeFoundationBenchmarkManifestV1(raw: unknown): string {
  return JSON.stringify(normalizeHsmeFoundationBenchmarkManifestV1(raw));
}

export async function hsmeFoundationBenchmarkManifestV1Digest(
  raw: unknown,
  hash: HsmeFoundationBenchmarkManifestHashPortV1,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${HSME_FOUNDATION_BENCHMARK_MANIFEST_V1_DIGEST_DOMAIN}${serializeHsmeFoundationBenchmarkManifestV1(raw)}`,
  );
  const digest = await hash.sha256(bytes);
  if (!HEX64.test(digest)) {
    fail('hsme_foundation_benchmark_manifest_hash_port_invalid', 'hash port must return lowercase SHA-256');
  }
  return digest;
}

function normalizeCandidate(raw: unknown, path: string): HsmeFoundationBenchmarkCandidateV1 {
  const record = exactRecord(raw, [
    'candidateId',
    'roles',
    'sourceRoot',
    'immutableRevision',
    'modelContentSha256',
    'capabilities',
    'executionProfileSha256',
    'licenseState',
    'licenseEvidenceSha256',
    'benchmarkMode',
  ], path);

  const sourceRoot = text(record.sourceRoot, `${path}.sourceRoot`, 240);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sourceRoot)) {
    fail('hsme_foundation_benchmark_manifest_source_invalid', `${path}.sourceRoot must be owner/name`);
  }
  const immutableRevision = text(record.immutableRevision, `${path}.immutableRevision`, 64);
  if (!IMMUTABLE_REVISION.test(immutableRevision)) {
    fail('hsme_foundation_benchmark_manifest_revision_invalid', `${path}.immutableRevision must be immutable hex`);
  }
  const candidateId = identifier(record.candidateId, `${path}.candidateId`);
  const roles = enumSet(record.roles, ROLES, `${path}.roles`, 1, ROLES.length);
  if (
    roles.includes('QUALITY_REFERENCE')
    && (roles.includes('DIRECT_FOUNDATION') || roles.includes('MOBILE_REUSE'))
  ) {
    fail(
      'hsme_foundation_benchmark_manifest_reference_selection_role_conflict',
      `${candidateId} quality reference cannot also be selectable reuse`,
    );
  }
  if (roles.includes('CONTROL_BASELINE') && roles.length !== 1) {
    fail(
      'hsme_foundation_benchmark_manifest_control_role_conflict',
      `${candidateId} control baseline must remain control-only`,
    );
  }

  return Object.freeze({
    candidateId,
    roles,
    sourceRoot,
    immutableRevision,
    modelContentSha256: sha256(record.modelContentSha256, `${path}.modelContentSha256`),
    capabilities: enumSet(record.capabilities, CAPABILITIES, `${path}.capabilities`, 1, CAPABILITIES.length),
    executionProfileSha256: sha256(record.executionProfileSha256, `${path}.executionProfileSha256`),
    licenseState: enumValue(record.licenseState, LICENSE_STATES, `${path}.licenseState`),
    licenseEvidenceSha256: sha256(record.licenseEvidenceSha256, `${path}.licenseEvidenceSha256`),
    benchmarkMode: enumValue(record.benchmarkMode, MODES, `${path}.benchmarkMode`),
  });
}

function normalizeDimension(raw: unknown, path: string): HsmeFoundationBenchmarkDimensionV1 {
  const record = exactRecord(raw, [
    'dimensionId',
    'referenceCandidateId',
    'maxLossMicrounits',
    'reviewMode',
  ], path);
  return Object.freeze({
    dimensionId: enumValue(record.dimensionId, DIMENSIONS, `${path}.dimensionId`),
    referenceCandidateId: identifier(record.referenceCandidateId, `${path}.referenceCandidateId`),
    maxLossMicrounits: safeInteger(record.maxLossMicrounits, `${path}.maxLossMicrounits`, 0, 1_000_000_000),
    reviewMode: enumValue(record.reviewMode, REVIEW_MODES, `${path}.reviewMode`),
  });
}

function exactRecord(raw: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_foundation_benchmark_manifest_record_invalid', `${path} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      fail('hsme_foundation_benchmark_manifest_field_unknown', `${path}.${key} is not allowed`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) {
      fail('hsme_foundation_benchmark_manifest_field_missing', `${path}.${key} is required`);
    }
  }
  return record;
}

function enumSet<T extends readonly string[]>(
  raw: unknown,
  values: T,
  path: string,
  min: number,
  max: number,
): readonly T[number][] {
  if (!Array.isArray(raw) || raw.length < min || raw.length > max) {
    fail('hsme_foundation_benchmark_manifest_set_invalid', `${path} must contain ${min}..${max} values`);
  }
  const result = raw.map((value, index) => enumValue(value, values, `${path}[${index}]`));
  if (new Set(result).size !== result.length) {
    fail('hsme_foundation_benchmark_manifest_set_duplicate', `${path} must be unique`);
  }
  return Object.freeze([...result].sort(lexical));
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail('hsme_foundation_benchmark_manifest_enum_invalid', `${path} is invalid`);
  }
  return value as T[number];
}

function identifier(value: unknown, path: string): string {
  const result = text(value, path, 120);
  if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) {
    fail('hsme_foundation_benchmark_manifest_identifier_invalid', `${path} is invalid`);
  }
  return result;
}

function sha256(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!HEX64.test(result)) {
    fail('hsme_foundation_benchmark_manifest_hash_invalid', `${path} must be lowercase SHA-256`);
  }
  return result;
}

function text(value: unknown, path: string, max: number): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > max
    || value.trim() !== value
    || /[\u0000-\u001f\u007f]/.test(value)
  ) {
    fail('hsme_foundation_benchmark_manifest_text_invalid', `${path} is invalid`);
  }
  return value;
}

function safeInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_foundation_benchmark_manifest_integer_invalid', `${path} is invalid`);
  }
  return value as number;
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function fail(code: string, message: string): never {
  throw new HsmeFoundationBenchmarkManifestV1Error(code, message);
}
