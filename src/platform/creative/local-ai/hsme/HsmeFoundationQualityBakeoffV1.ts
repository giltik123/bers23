import {
  HSME_FOUNDATION_REUSE_QUALITY_POLICY,
  normalizeHsmeFoundationReuseDecisionV1,
} from './HsmeFoundationReuseDecisionV1';

export const HSME_FOUNDATION_QUALITY_BAKEOFF_V1_SCHEMA = 'BERS_HSME_FOUNDATION_QUALITY_BAKEOFF_V1' as const;
export const HSME_FOUNDATION_QUALITY_BAKEOFF_DIGEST_DOMAIN = 'bers:hsme:foundation-quality-bakeoff:v1\0' as const;

const ROLES = Object.freeze([
  'CONTROL_BASELINE',
  'DIRECT_FOUNDATION',
  'MOBILE_REUSE',
  'QUALITY_REFERENCE',
] as const);

const REVIEW_MODES = Object.freeze([
  'AUTOMATED',
  'BLINDED_HUMAN',
  'HYBRID',
] as const);

const DIMENSIONS = Object.freeze([
  'semantic-adherence',
  'identity-preservation',
  'garment-logo-pattern-preservation',
  'non-target-preservation',
  'anatomy-artifact-rate',
  'photorealism',
  'material-realism',
  'text-fidelity',
  'edit-compliance',
  'multi-reference-consistency',
  'composition-count-spatial-correctness',
] as const);

const MANDATORY_DIMENSIONS = Object.freeze([
  'semantic-adherence',
  'identity-preservation',
  'garment-logo-pattern-preservation',
  'non-target-preservation',
  'anatomy-artifact-rate',
] as const);

const HEX64 = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

type HsmeFoundationQualityRoleV1 = typeof ROLES[number];
type HsmeFoundationQualityReviewModeV1 = typeof REVIEW_MODES[number];
type HsmeFoundationQualityDimensionV1 = typeof DIMENSIONS[number];

export type HsmeFoundationQualityDimensionPolicyV1 = Readonly<{
  dimensionId: HsmeFoundationQualityDimensionV1;
  referenceCandidateId: string;
  maxLossMicrounits: number;
  reviewMode: HsmeFoundationQualityReviewModeV1;
}>;

export type HsmeFoundationQualityDimensionResultV1 = Readonly<{
  dimensionId: HsmeFoundationQualityDimensionV1;
  lossMicrounits: number;
  evidenceSha256: string;
}>;

export type HsmeFoundationQualityCandidateResultV1 = Readonly<{
  candidateId: string;
  roles: readonly HsmeFoundationQualityRoleV1[];
  immutableRevision: string;
  modelContentSha256: string;
  outputSetSha256: string;
  dimensionResults: readonly HsmeFoundationQualityDimensionResultV1[];
}>;

export type HsmeFoundationQualityBakeoffV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_QUALITY_BAKEOFF_V1_SCHEMA;
  qualityPolicy: typeof HSME_FOUNDATION_REUSE_QUALITY_POLICY;
  benchmarkPolicySha256: string;
  fixtureSetSha256: string;
  selectionCandidateIds: readonly string[];
  dimensionPolicies: readonly HsmeFoundationQualityDimensionPolicyV1[];
  candidateResults: readonly HsmeFoundationQualityCandidateResultV1[];
}>;

export type HsmeFoundationQualityPreferredSetV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_QUALITY_BAKEOFF_V1_SCHEMA;
  qualityPolicy: typeof HSME_FOUNDATION_REUSE_QUALITY_POLICY;
  preferredCandidateIds: readonly string[];
  qualityEligibleCandidateIds: readonly string[];
  comparedSelectionCandidateCount: number;
  dimensionPriority: readonly HsmeFoundationQualityDimensionV1[];
}>;

export type HsmeFoundationQualityReuseSelectionEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_QUALITY_BAKEOFF_V1_SCHEMA;
  qualityPolicy: typeof HSME_FOUNDATION_REUSE_QUALITY_POLICY;
  selectedCandidateId: string;
  preferredCandidateIds: readonly string[];
  comparedSelectionCandidateCount: number;
  dimensionPriority: readonly HsmeFoundationQualityDimensionV1[];
}>;

export interface HsmeFoundationQualityHashPortV1 {
  sha256(bytes: Uint8Array): Promise<string>;
}

export class HsmeFoundationQualityBakeoffV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeFoundationQualityBakeoffV1Error';
    this.code = code;
  }
}

/**
 * Quality-first comparison contract for HSME foundation reuse.
 *
 * Every dimension is expressed as non-negative measured loss against a pinned
 * quality reference. Lower is better. The ordered dimensionPolicies array is a
 * predeclared lexicographic quality vector: efficiency is intentionally absent.
 *
 * This contract is R&D evidence only and grants no production, provider,
 * Billing, Project, Artifact, DurableModelFleet or AEE authority.
 */
export function normalizeHsmeFoundationQualityBakeoffV1(raw: unknown): HsmeFoundationQualityBakeoffV1 {
  const record = exactRecord(
    raw,
    [
      'schemaVersion',
      'qualityPolicy',
      'benchmarkPolicySha256',
      'fixtureSetSha256',
      'selectionCandidateIds',
      'dimensionPolicies',
      'candidateResults',
    ],
    'bakeoff',
  );

  if (record.schemaVersion !== HSME_FOUNDATION_QUALITY_BAKEOFF_V1_SCHEMA) {
    fail('hsme_foundation_quality_schema_unsupported', `schemaVersion must be ${HSME_FOUNDATION_QUALITY_BAKEOFF_V1_SCHEMA}`);
  }
  if (record.qualityPolicy !== HSME_FOUNDATION_REUSE_QUALITY_POLICY) {
    fail('hsme_foundation_quality_policy_invalid', `qualityPolicy must be ${HSME_FOUNDATION_REUSE_QUALITY_POLICY}`);
  }

  if (!Array.isArray(record.dimensionPolicies) || record.dimensionPolicies.length < MANDATORY_DIMENSIONS.length || record.dimensionPolicies.length > DIMENSIONS.length) {
    fail('hsme_foundation_quality_dimension_count_invalid', `dimensionPolicies must contain ${MANDATORY_DIMENSIONS.length}..${DIMENSIONS.length} entries`);
  }
  const dimensionPolicies = record.dimensionPolicies.map((value, index) => normalizeDimensionPolicy(value, `dimensionPolicies[${index}]`));
  const policyIds = dimensionPolicies.map(policy => policy.dimensionId);
  if (new Set(policyIds).size !== policyIds.length) {
    fail('hsme_foundation_quality_dimension_duplicate', 'dimensionPolicies dimensionId values must be unique');
  }
  for (const dimensionId of MANDATORY_DIMENSIONS) {
    if (!policyIds.includes(dimensionId)) {
      fail('hsme_foundation_quality_mandatory_dimension_missing', `mandatory quality dimension missing: ${dimensionId}`);
    }
  }

  if (!Array.isArray(record.candidateResults) || record.candidateResults.length < 4 || record.candidateResults.length > 12) {
    fail('hsme_foundation_quality_candidate_count_invalid', 'candidateResults must contain 4..12 entries');
  }
  const candidateResults = record.candidateResults.map((value, index) =>
    normalizeCandidateResult(value, dimensionPolicies, `candidateResults[${index}]`),
  );
  const candidateIds = candidateResults.map(candidate => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    fail('hsme_foundation_quality_candidate_duplicate', 'candidateId must be unique');
  }
  for (const role of ROLES) {
    if (!candidateResults.some(candidate => candidate.roles.includes(role))) {
      fail('hsme_foundation_quality_role_missing', `candidate set must represent role ${role}`);
    }
  }

  const selectionCandidateIds = identifierSet(record.selectionCandidateIds, 'selectionCandidateIds', 2, 10);
  for (const candidateId of selectionCandidateIds) {
    const candidate = candidateResults.find(value => value.candidateId === candidateId);
    if (!candidate) {
      fail('hsme_foundation_quality_selection_candidate_missing', `selection candidate does not exist: ${candidateId}`);
    }
    if (!candidate.roles.includes('DIRECT_FOUNDATION') && !candidate.roles.includes('MOBILE_REUSE')) {
      fail('hsme_foundation_quality_selection_role_invalid', `${candidateId} must be DIRECT_FOUNDATION or MOBILE_REUSE`);
    }
  }

  for (const policy of dimensionPolicies) {
    const reference = candidateResults.find(candidate => candidate.candidateId === policy.referenceCandidateId);
    if (!reference) {
      fail('hsme_foundation_quality_reference_missing', `reference candidate does not exist: ${policy.referenceCandidateId}`);
    }
    if (!reference.roles.includes('QUALITY_REFERENCE')) {
      fail('hsme_foundation_quality_reference_role_invalid', `${policy.referenceCandidateId} must carry QUALITY_REFERENCE role`);
    }
    const referenceResult = reference.dimensionResults.find(result => result.dimensionId === policy.dimensionId)!;
    if (referenceResult.lossMicrounits !== 0) {
      fail('hsme_foundation_quality_reference_loss_nonzero', `${policy.dimensionId} quality reference must have zero loss`);
    }
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_QUALITY_BAKEOFF_V1_SCHEMA,
    qualityPolicy: HSME_FOUNDATION_REUSE_QUALITY_POLICY,
    benchmarkPolicySha256: sha256(record.benchmarkPolicySha256, 'benchmarkPolicySha256'),
    fixtureSetSha256: sha256(record.fixtureSetSha256, 'fixtureSetSha256'),
    selectionCandidateIds,
    dimensionPolicies: Object.freeze([...dimensionPolicies]),
    candidateResults: Object.freeze([...candidateResults].sort((left, right) => lexical(left.candidateId, right.candidateId))),
  });
}

export function proveHsmeFoundationQualityPreferredSetV1(
  rawBakeoff: unknown,
): HsmeFoundationQualityPreferredSetV1 {
  const bakeoff = normalizeHsmeFoundationQualityBakeoffV1(rawBakeoff);
  const qualityEligible = bakeoff.selectionCandidateIds
    .map(candidateId => bakeoff.candidateResults.find(candidate => candidate.candidateId === candidateId)!)
    .filter(candidate => candidatePassesHardQuality(candidate, bakeoff.dimensionPolicies));

  let preferred: HsmeFoundationQualityCandidateResultV1[] = [];
  for (const candidate of qualityEligible) {
    if (preferred.length === 0) {
      preferred = [candidate];
      continue;
    }
    const comparison = compareQualityVectors(candidate, preferred[0], bakeoff.dimensionPolicies);
    if (comparison < 0) {
      preferred = [candidate];
    } else if (comparison === 0) {
      preferred.push(candidate);
    }
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_QUALITY_BAKEOFF_V1_SCHEMA,
    qualityPolicy: HSME_FOUNDATION_REUSE_QUALITY_POLICY,
    preferredCandidateIds: Object.freeze(preferred.map(candidate => candidate.candidateId).sort(lexical)),
    qualityEligibleCandidateIds: Object.freeze(qualityEligible.map(candidate => candidate.candidateId).sort(lexical)),
    comparedSelectionCandidateCount: bakeoff.selectionCandidateIds.length,
    dimensionPriority: Object.freeze(bakeoff.dimensionPolicies.map(policy => policy.dimensionId)),
  });
}

/**
 * Compose the quality bakeoff with the accepted reuse-first gate.
 *
 * Existing reuse admission still owns license, execution, training and resource checks.
 * This proof adds the missing rule: an otherwise-valid reuse decision may only
 * select a candidate from the predeclared best-quality set. Resource efficiency
 * may therefore break an exact quality tie, but cannot compensate for a worse
 * quality vector.
 */
export function proveHsmeFoundationQualityFirstReuseSelectionV1(
  rawDecision: unknown,
  rawBakeoff: unknown,
): HsmeFoundationQualityReuseSelectionEvidenceV1 {
  const decision = normalizeHsmeFoundationReuseDecisionV1(rawDecision);
  if (decision.decisionStatus !== 'DIRECT_FOUNDATION_ADVANCE' && decision.decisionStatus !== 'BOUNDED_ADAPTATION_ADVANCE') {
    fail('hsme_foundation_quality_reuse_decision_not_advance', 'quality-first selection proof requires an advancing reuse decision');
  }
  const selectedCandidateId = decision.selectedCandidateId;
  if (!selectedCandidateId) {
    fail('hsme_foundation_quality_selected_candidate_missing', 'advancing reuse decision must select a candidate');
  }

  const bakeoff = normalizeHsmeFoundationQualityBakeoffV1(rawBakeoff);
  const decisionReuseCandidates = decision.candidates
    .filter(candidate => candidate.strategy !== 'CONTROL_BASELINE')
    .map(candidate => candidate.candidateId)
    .sort(lexical);

  if (!sameStrings(decisionReuseCandidates, bakeoff.selectionCandidateIds)) {
    fail(
      'hsme_foundation_quality_selection_set_mismatch',
      'quality bakeoff must compare exactly every non-control reuse candidate from the decision',
    );
  }

  for (const candidateId of decisionReuseCandidates) {
    const decisionCandidate = decision.candidates.find(candidate => candidate.candidateId === candidateId)!;
    const qualityCandidate = bakeoff.candidateResults.find(candidate => candidate.candidateId === candidateId);
    if (!qualityCandidate) {
      fail('hsme_foundation_quality_candidate_identity_missing', `quality candidate missing: ${candidateId}`);
    }
    if (qualityCandidate.immutableRevision !== decisionCandidate.source.immutableRevision) {
      fail('hsme_foundation_quality_revision_mismatch', `${candidateId} quality evidence revision mismatch`);
    }
    if (qualityCandidate.modelContentSha256 !== decisionCandidate.source.contentSha256) {
      fail('hsme_foundation_quality_content_mismatch', `${candidateId} quality evidence content mismatch`);
    }
  }

  const preferred = proveHsmeFoundationQualityPreferredSetV1(bakeoff);
  if (preferred.preferredCandidateIds.length < 1) {
    fail('hsme_foundation_quality_no_eligible_candidate', 'no reuse candidate passes the predeclared hard quality gates');
  }
  if (!preferred.preferredCandidateIds.includes(selectedCandidateId)) {
    fail(
      'hsme_foundation_quality_preferred_selection_required',
      `${selectedCandidateId} cannot advance while a better measured quality candidate exists`,
    );
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_QUALITY_BAKEOFF_V1_SCHEMA,
    qualityPolicy: HSME_FOUNDATION_REUSE_QUALITY_POLICY,
    selectedCandidateId,
    preferredCandidateIds: preferred.preferredCandidateIds,
    comparedSelectionCandidateCount: preferred.comparedSelectionCandidateCount,
    dimensionPriority: preferred.dimensionPriority,
  });
}

export function serializeHsmeFoundationQualityBakeoffV1(raw: unknown): string {
  return JSON.stringify(normalizeHsmeFoundationQualityBakeoffV1(raw));
}

export async function hsmeFoundationQualityBakeoffV1Digest(
  raw: unknown,
  hash: HsmeFoundationQualityHashPortV1,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${HSME_FOUNDATION_QUALITY_BAKEOFF_DIGEST_DOMAIN}${serializeHsmeFoundationQualityBakeoffV1(raw)}`,
  );
  const digest = await hash.sha256(bytes);
  if (!HEX64.test(digest)) {
    fail('hsme_foundation_quality_hash_port_invalid', 'hash port must return lowercase SHA-256 hex');
  }
  return digest;
}

function normalizeDimensionPolicy(raw: unknown, path: string): HsmeFoundationQualityDimensionPolicyV1 {
  const record = exactRecord(
    raw,
    ['dimensionId', 'referenceCandidateId', 'maxLossMicrounits', 'reviewMode'],
    path,
  );
  return Object.freeze({
    dimensionId: enumValue(record.dimensionId, DIMENSIONS, `${path}.dimensionId`),
    referenceCandidateId: identifier(record.referenceCandidateId, `${path}.referenceCandidateId`, 120),
    maxLossMicrounits: safeInteger(record.maxLossMicrounits, `${path}.maxLossMicrounits`, 0, 1_000_000_000),
    reviewMode: enumValue(record.reviewMode, REVIEW_MODES, `${path}.reviewMode`),
  });
}

function normalizeCandidateResult(
  raw: unknown,
  dimensionPolicies: readonly HsmeFoundationQualityDimensionPolicyV1[],
  path: string,
): HsmeFoundationQualityCandidateResultV1 {
  const record = exactRecord(
    raw,
    ['candidateId', 'roles', 'immutableRevision', 'modelContentSha256', 'outputSetSha256', 'dimensionResults'],
    path,
  );
  const candidateId = identifier(record.candidateId, `${path}.candidateId`, 120);
  const roles = enumSet(record.roles, ROLES, `${path}.roles`, 1, ROLES.length);
  const immutableRevision = text(record.immutableRevision, `${path}.immutableRevision`, 64);
  if (!IMMUTABLE_REVISION.test(immutableRevision)) {
    fail('hsme_foundation_quality_revision_invalid', `${path}.immutableRevision must be immutable 40/64-hex`);
  }

  if (!Array.isArray(record.dimensionResults) || record.dimensionResults.length !== dimensionPolicies.length) {
    fail('hsme_foundation_quality_result_count_invalid', `${path}.dimensionResults must match dimensionPolicies exactly`);
  }
  const rawResults = record.dimensionResults.map((value, index) =>
    normalizeDimensionResult(value, `${path}.dimensionResults[${index}]`),
  );
  const resultIds = rawResults.map(result => result.dimensionId);
  if (new Set(resultIds).size !== resultIds.length) {
    fail('hsme_foundation_quality_result_duplicate', `${path}.dimensionResults dimensionId values must be unique`);
  }
  for (const policy of dimensionPolicies) {
    if (!resultIds.includes(policy.dimensionId)) {
      fail('hsme_foundation_quality_result_missing', `${path} missing result for ${policy.dimensionId}`);
    }
  }
  for (const result of rawResults) {
    if (!dimensionPolicies.some(policy => policy.dimensionId === result.dimensionId)) {
      fail('hsme_foundation_quality_result_unplanned', `${path} contains unplanned dimension ${result.dimensionId}`);
    }
  }

  return Object.freeze({
    candidateId,
    roles,
    immutableRevision,
    modelContentSha256: sha256(record.modelContentSha256, `${path}.modelContentSha256`),
    outputSetSha256: sha256(record.outputSetSha256, `${path}.outputSetSha256`),
    dimensionResults: Object.freeze(
      dimensionPolicies.map(policy => rawResults.find(result => result.dimensionId === policy.dimensionId)!),
    ),
  });
}

function normalizeDimensionResult(raw: unknown, path: string): HsmeFoundationQualityDimensionResultV1 {
  const record = exactRecord(raw, ['dimensionId', 'lossMicrounits', 'evidenceSha256'], path);
  return Object.freeze({
    dimensionId: enumValue(record.dimensionId, DIMENSIONS, `${path}.dimensionId`),
    lossMicrounits: safeInteger(record.lossMicrounits, `${path}.lossMicrounits`, 0, 1_000_000_000),
    evidenceSha256: sha256(record.evidenceSha256, `${path}.evidenceSha256`),
  });
}

function candidatePassesHardQuality(
  candidate: HsmeFoundationQualityCandidateResultV1,
  dimensionPolicies: readonly HsmeFoundationQualityDimensionPolicyV1[],
): boolean {
  return dimensionPolicies.every((policy, index) =>
    candidate.dimensionResults[index].lossMicrounits <= policy.maxLossMicrounits,
  );
}

function compareQualityVectors(
  left: HsmeFoundationQualityCandidateResultV1,
  right: HsmeFoundationQualityCandidateResultV1,
  dimensionPolicies: readonly HsmeFoundationQualityDimensionPolicyV1[],
): number {
  for (let index = 0; index < dimensionPolicies.length; index += 1) {
    const leftLoss = left.dimensionResults[index].lossMicrounits;
    const rightLoss = right.dimensionResults[index].lossMicrounits;
    if (leftLoss < rightLoss) return -1;
    if (leftLoss > rightLoss) return 1;
  }
  return 0;
}

function exactRecord(raw: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_foundation_quality_record_invalid', `${path} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      fail('hsme_foundation_quality_field_unknown', `${path}.${key} is not allowed`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) {
      fail('hsme_foundation_quality_field_missing', `${path}.${key} is required`);
    }
  }
  return record;
}

function enumSet<T extends readonly string[]>(
  value: unknown,
  values: T,
  path: string,
  min: number,
  max: number,
): readonly T[number][] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail('hsme_foundation_quality_enum_set_invalid', `${path} must contain ${min}..${max} entries`);
  }
  const result = value.map((item, index) => enumValue(item, values, `${path}[${index}]`));
  if (new Set(result).size !== result.length) {
    fail('hsme_foundation_quality_enum_set_duplicate', `${path} must be unique`);
  }
  return Object.freeze([...result].sort(lexical));
}

function identifierSet(value: unknown, path: string, min: number, max: number): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail('hsme_foundation_quality_identifier_set_invalid', `${path} must contain ${min}..${max} entries`);
  }
  const result = value.map((item, index) => identifier(item, `${path}[${index}]`, 120));
  if (new Set(result).size !== result.length) {
    fail('hsme_foundation_quality_identifier_set_duplicate', `${path} must be unique`);
  }
  return Object.freeze([...result].sort(lexical));
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail('hsme_foundation_quality_enum_invalid', `${path} is invalid`);
  }
  return value as T[number];
}

function sha256(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!HEX64.test(result)) {
    fail('hsme_foundation_quality_hash_invalid', `${path} must be lowercase SHA-256`);
  }
  return result;
}

function identifier(value: unknown, path: string, max: number): string {
  const result = text(value, path, max);
  if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) {
    fail('hsme_foundation_quality_identifier_invalid', `${path} is invalid`);
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
    fail('hsme_foundation_quality_text_invalid', `${path} is invalid`);
  }
  return value;
}

function safeInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_foundation_quality_integer_invalid', `${path} is invalid`);
  }
  return value as number;
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
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
  throw new HsmeFoundationQualityBakeoffV1Error(code, message);
}
