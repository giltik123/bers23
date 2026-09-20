import { HSME_FOUNDATION_REUSE_QUALITY_POLICY } from './HsmeFoundationReuseDecisionV1';

export const HSME_FOUNDATION_QUALITY_FIXTURE_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_QUALITY_FIXTURE_V1' as const;
export const HSME_FOUNDATION_QUALITY_FIXTURE_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_QUALITY_FIXTURE_EVIDENCE_V1' as const;

export const HSME_FOUNDATION_CANDIDATE_LOCK_DIGEST_DOMAIN =
  'bers:hsme:foundation-candidate-lock:v1\0' as const;
export const HSME_FOUNDATION_FIXTURE_SET_DIGEST_DOMAIN =
  'bers:hsme:foundation-quality-fixture-set:v1\0' as const;
export const HSME_FOUNDATION_BENCHMARK_POLICY_DIGEST_DOMAIN =
  'bers:hsme:foundation-quality-benchmark-policy:v1\0' as const;
export const HSME_FOUNDATION_BLINDED_RUBRIC_DIGEST_DOMAIN =
  'bers:hsme:foundation-quality-blinded-rubric:v1\0' as const;

const ROLES = Object.freeze([
  'CONTROL_BASELINE',
  'DIRECT_FOUNDATION',
  'MOBILE_REUSE',
  'QUALITY_REFERENCE',
] as const);

const TRACKS = Object.freeze([
  'TEXT_TO_IMAGE',
  'SINGLE_IMAGE_EDIT',
  'MULTI_REFERENCE_EDIT',
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

const MANDATORY_DIMENSIONS = Object.freeze([
  'identity-preservation',
  'garment-logo-pattern-preservation',
  'non-target-preservation',
  'semantic-adherence',
  'anatomy-artifact-rate',
] as const);

const PROVENANCE_CLASSES = Object.freeze([
  'PROJECT_CREATED',
  'PROJECT_SYNTHETIC',
  'EXTERNAL_LICENSED',
  'PUBLIC_DOMAIN',
] as const);

const LICENSE_CONCLUSIONS = Object.freeze([
  'BENCHMARK_ALLOWED',
  'REVIEW_REQUIRED',
  'BLOCKED',
] as const);

const PERSON_CONSENT_STATES = Object.freeze([
  'NOT_APPLICABLE',
  'DOCUMENTED',
  'BLOCKED',
] as const);

const SCORING_MODES = Object.freeze([
  'BLINDED_HUMAN_LOSS',
  'AUTOMATED_LOSS',
  'HYBRID_MAX_LOSS',
] as const);

const REVIEW_MODES = Object.freeze([
  'AUTOMATED',
  'BLINDED_HUMAN',
  'HYBRID',
] as const);

const HEX64 = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

type HsmeFoundationFixtureRoleV1 = typeof ROLES[number];
type HsmeFoundationFixtureTrackV1 = typeof TRACKS[number];
type HsmeFoundationFixtureDimensionV1 = typeof DIMENSIONS[number];
type HsmeFoundationFixtureProvenanceClassV1 = typeof PROVENANCE_CLASSES[number];
type HsmeFoundationFixtureLicenseConclusionV1 = typeof LICENSE_CONCLUSIONS[number];
type HsmeFoundationFixturePersonConsentV1 = typeof PERSON_CONSENT_STATES[number];
type HsmeFoundationFixtureScoringModeV1 = typeof SCORING_MODES[number];
type HsmeFoundationFixtureReviewModeV1 = typeof REVIEW_MODES[number];

export type HsmeFoundationFixtureCandidateV1 = Readonly<{
  candidateId: string;
  role: HsmeFoundationFixtureRoleV1;
  sourceRoot: string;
  immutableRevision: string;
  contentSha256: string;
  representationId: string;
  precisionId: string;
  derivedFromContentSha256: string | 'NONE';
}>;

export type HsmeFoundationFixtureAssetV1 = Readonly<{
  assetId: string;
  mediaType: 'IMAGE' | 'MASK';
  contentSha256: string;
  provenanceClass: HsmeFoundationFixtureProvenanceClassV1;
  provenanceEvidenceSha256: string;
  licenseConclusion: HsmeFoundationFixtureLicenseConclusionV1;
  licenseEvidenceSha256: string;
  redistributionAllowed: boolean;
  retentionAllowed: boolean;
  containsIdentifiablePerson: boolean;
  personConsent: HsmeFoundationFixturePersonConsentV1;
  personConsentEvidenceSha256: string | 'NOT_APPLICABLE';
  benchmarkAllowed: true;
  trainingAllowed: false;
}>;

export type HsmeFoundationFixtureCaseV1 = Readonly<{
  caseId: string;
  track: HsmeFoundationFixtureTrackV1;
  promptUtf8: string;
  promptSha256: string;
  inputAssetIds: readonly string[];
  referenceAssetIds: readonly string[];
  dimensions: readonly HsmeFoundationFixtureDimensionV1[];
}>;

export type HsmeFoundationFixtureDimensionPolicyV1 = Readonly<{
  dimensionId: HsmeFoundationFixtureDimensionV1;
  maxLossMicrounits: number;
  scoringMode: HsmeFoundationFixtureScoringModeV1;
  reviewMode: HsmeFoundationFixtureReviewModeV1;
  referenceCandidateId: string;
}>;

export type HsmeFoundationFixtureMetricPolicyV1 = Readonly<{
  metricId: string;
  dimensionId: HsmeFoundationFixtureDimensionV1;
  methodId: string;
  toolchainSha256: string;
  policySha256: string;
}>;

export type HsmeFoundationFixtureBlindedRubricV1 = Readonly<{
  blindingMode: 'CANDIDATE_AND_EFFICIENCY_HIDDEN';
  randomizedPresentation: true;
  randomizationSeedSha256: string;
  candidateIdentityVisibleToReviewer: false;
  efficiencyIdentityVisibleToReviewer: false;
  sourceAndReferenceVisibleAsCaseRequires: true;
  independentDimensionScoring: true;
  rubricDocumentSha256: string;
  panelPolicySha256: string;
}>;

export type HsmeFoundationQualityFixtureV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_QUALITY_FIXTURE_V1_SCHEMA;
  qualityPolicy: typeof HSME_FOUNDATION_REUSE_QUALITY_POLICY;
  fixtureSetId: string;
  candidates: readonly HsmeFoundationFixtureCandidateV1[];
  assets: readonly HsmeFoundationFixtureAssetV1[];
  cases: readonly HsmeFoundationFixtureCaseV1[];
  dimensionPolicies: readonly HsmeFoundationFixtureDimensionPolicyV1[];
  automatedMetricPolicies: readonly HsmeFoundationFixtureMetricPolicyV1[];
  blindedRubric: HsmeFoundationFixtureBlindedRubricV1;
  outputsObserved: false;
  postObservationPolicyChangesAllowed: false;
  candidateSpecificPromptOverridesAllowed: false;
  benchmarkInputsTrainingAllowed: false;
  productionAuthorityGranted: false;
  providerAuthorityGranted: false;
  billingAuthorityGranted: false;
  projectArtifactMutationAllowed: false;
  durableModelFleetAuthorityGranted: false;
  aeeExecutionAuthorityGranted: false;
}>;

export type HsmeFoundationQualityFixtureEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_QUALITY_FIXTURE_EVIDENCE_V1_SCHEMA;
  qualityPolicy: typeof HSME_FOUNDATION_REUSE_QUALITY_POLICY;
  candidateLockSha256: string;
  fixtureSetSha256: string;
  benchmarkPolicySha256: string;
  blindedRubricSha256: string;
  candidateCount: number;
  assetCount: number;
  caseCount: number;
  tracks: readonly HsmeFoundationFixtureTrackV1[];
  dimensionPriority: readonly HsmeFoundationFixtureDimensionV1[];
  promptDigestsVerified: true;
  assetUseRightsVerified: true;
  candidateLockPreOutputVerified: true;
  trainingUseForbiddenVerified: true;
  blindedEfficiencyIdentityVerified: true;
}>;

export interface HsmeFoundationQualityFixtureHashPortV1 {
  sha256(bytes: Uint8Array): Promise<string>;
}

export class HsmeFoundationQualityFixtureV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeFoundationQualityFixtureV1Error';
    this.code = code;
  }
}

/**
 * Pre-output benchmark plan. This contract exists so model outputs cannot be
 * used to rewrite the candidate set, prompt set, hard quality dimensions,
 * thresholds or reviewer visibility policy.
 */
export function normalizeHsmeFoundationQualityFixtureV1(raw: unknown): HsmeFoundationQualityFixtureV1 {
  const record = exactRecord(
    raw,
    [
      'schemaVersion',
      'qualityPolicy',
      'fixtureSetId',
      'candidates',
      'assets',
      'cases',
      'dimensionPolicies',
      'automatedMetricPolicies',
      'blindedRubric',
      'outputsObserved',
      'postObservationPolicyChangesAllowed',
      'candidateSpecificPromptOverridesAllowed',
      'benchmarkInputsTrainingAllowed',
      'productionAuthorityGranted',
      'providerAuthorityGranted',
      'billingAuthorityGranted',
      'projectArtifactMutationAllowed',
      'durableModelFleetAuthorityGranted',
      'aeeExecutionAuthorityGranted',
    ],
    'fixture',
  );

  if (record.schemaVersion !== HSME_FOUNDATION_QUALITY_FIXTURE_V1_SCHEMA) {
    fail('hsme_foundation_fixture_schema_unsupported', `schemaVersion must be ${HSME_FOUNDATION_QUALITY_FIXTURE_V1_SCHEMA}`);
  }
  if (record.qualityPolicy !== HSME_FOUNDATION_REUSE_QUALITY_POLICY) {
    fail('hsme_foundation_fixture_quality_policy_invalid', `qualityPolicy must be ${HSME_FOUNDATION_REUSE_QUALITY_POLICY}`);
  }

  const fixtureSetId = identifier(record.fixtureSetId, 'fixtureSetId', 120);

  if (!Array.isArray(record.candidates) || record.candidates.length < 4 || record.candidates.length > 16) {
    fail('hsme_foundation_fixture_candidate_count_invalid', 'candidates must contain 4..16 entries');
  }
  const candidates = record.candidates.map((value, index) => normalizeCandidate(value, `candidates[${index}]`));
  assertUnique(candidates.map(value => value.candidateId), 'candidateId', 'hsme_foundation_fixture_candidate_duplicate');
  for (const candidate of candidates) {
    if (candidate.derivedFromContentSha256 !== 'NONE') {
      if (candidate.derivedFromContentSha256 === candidate.contentSha256) {
        fail('hsme_foundation_fixture_derived_self_reference', `${candidate.candidateId} cannot derive from itself`);
      }
      if (!candidates.some(parent => parent.contentSha256 === candidate.derivedFromContentSha256)) {
        fail(
          'hsme_foundation_fixture_derived_parent_missing',
          `${candidate.candidateId} derived representation parent is not in the frozen candidate lock`,
        );
      }
    }
  }
  for (const role of ROLES) {
    if (!candidates.some(candidate => candidate.role === role)) {
      fail('hsme_foundation_fixture_role_missing', `candidate set must contain role ${role}`);
    }
  }

  if (!Array.isArray(record.assets) || record.assets.length < 1 || record.assets.length > 512) {
    fail('hsme_foundation_fixture_asset_count_invalid', 'assets must contain 1..512 entries');
  }
  const assets = record.assets.map((value, index) => normalizeAsset(value, `assets[${index}]`));
  assertUnique(assets.map(value => value.assetId), 'assetId', 'hsme_foundation_fixture_asset_duplicate');

  if (!Array.isArray(record.dimensionPolicies) || record.dimensionPolicies.length < MANDATORY_DIMENSIONS.length || record.dimensionPolicies.length > DIMENSIONS.length) {
    fail('hsme_foundation_fixture_dimension_count_invalid', `dimensionPolicies must contain ${MANDATORY_DIMENSIONS.length}..${DIMENSIONS.length} entries`);
  }
  const dimensionPolicies = record.dimensionPolicies.map((value, index) =>
    normalizeDimensionPolicy(value, `dimensionPolicies[${index}]`),
  );
  assertUnique(
    dimensionPolicies.map(value => value.dimensionId),
    'dimensionId',
    'hsme_foundation_fixture_dimension_duplicate',
  );
  const dimensionIds = dimensionPolicies.map(value => value.dimensionId);
  for (const required of MANDATORY_DIMENSIONS) {
    if (!dimensionIds.includes(required)) {
      fail('hsme_foundation_fixture_mandatory_dimension_missing', `mandatory dimension missing: ${required}`);
    }
  }
  for (const policy of dimensionPolicies) {
    const reference = candidates.find(candidate => candidate.candidateId === policy.referenceCandidateId);
    if (!reference) {
      fail('hsme_foundation_fixture_reference_missing', `reference candidate missing: ${policy.referenceCandidateId}`);
    }
    if (reference.role !== 'QUALITY_REFERENCE') {
      fail('hsme_foundation_fixture_reference_role_invalid', `${policy.referenceCandidateId} must be QUALITY_REFERENCE`);
    }
  }

  if (!Array.isArray(record.cases) || record.cases.length < TRACKS.length || record.cases.length > 512) {
    fail('hsme_foundation_fixture_case_count_invalid', `cases must contain ${TRACKS.length}..512 entries`);
  }
  const cases = record.cases.map((value, index) =>
    normalizeCase(value, assets, dimensionIds, `cases[${index}]`),
  );
  assertUnique(cases.map(value => value.caseId), 'caseId', 'hsme_foundation_fixture_case_duplicate');
  for (const track of TRACKS) {
    if (!cases.some(value => value.track === track)) {
      fail('hsme_foundation_fixture_track_missing', `fixture must contain track ${track}`);
    }
  }
  for (const required of MANDATORY_DIMENSIONS) {
    if (!cases.some(value => value.dimensions.includes(required))) {
      fail('hsme_foundation_fixture_dimension_unexercised', `fixture cases never exercise mandatory dimension ${required}`);
    }
  }

  if (!Array.isArray(record.automatedMetricPolicies) || record.automatedMetricPolicies.length > 64) {
    fail('hsme_foundation_fixture_metric_count_invalid', 'automatedMetricPolicies must contain 0..64 entries');
  }
  const automatedMetricPolicies = record.automatedMetricPolicies.map((value, index) =>
    normalizeMetricPolicy(value, dimensionIds, `automatedMetricPolicies[${index}]`),
  );
  assertUnique(
    automatedMetricPolicies.map(value => value.metricId),
    'metricId',
    'hsme_foundation_fixture_metric_duplicate',
  );
  for (const policy of dimensionPolicies) {
    if (
      (policy.reviewMode === 'AUTOMATED' || policy.reviewMode === 'HYBRID')
      && !automatedMetricPolicies.some(metric => metric.dimensionId === policy.dimensionId)
    ) {
      fail('hsme_foundation_fixture_metric_missing', `automated evidence policy missing for ${policy.dimensionId}`);
    }
  }

  const blindedRubric = normalizeBlindedRubric(record.blindedRubric);

  assertFalse(record.outputsObserved, 'outputsObserved', 'hsme_foundation_fixture_outputs_already_observed');
  assertFalse(
    record.postObservationPolicyChangesAllowed,
    'postObservationPolicyChangesAllowed',
    'hsme_foundation_fixture_post_observation_mutation_forbidden',
  );
  assertFalse(
    record.candidateSpecificPromptOverridesAllowed,
    'candidateSpecificPromptOverridesAllowed',
    'hsme_foundation_fixture_candidate_prompt_override_forbidden',
  );
  assertFalse(
    record.benchmarkInputsTrainingAllowed,
    'benchmarkInputsTrainingAllowed',
    'hsme_foundation_fixture_training_use_forbidden',
  );
  for (const [field, code] of [
    ['productionAuthorityGranted', 'hsme_foundation_fixture_production_authority_forbidden'],
    ['providerAuthorityGranted', 'hsme_foundation_fixture_provider_authority_forbidden'],
    ['billingAuthorityGranted', 'hsme_foundation_fixture_billing_authority_forbidden'],
    ['projectArtifactMutationAllowed', 'hsme_foundation_fixture_project_mutation_forbidden'],
    ['durableModelFleetAuthorityGranted', 'hsme_foundation_fixture_fleet_authority_forbidden'],
    ['aeeExecutionAuthorityGranted', 'hsme_foundation_fixture_aee_authority_forbidden'],
  ] as const) {
    assertFalse(record[field], field, code);
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_QUALITY_FIXTURE_V1_SCHEMA,
    qualityPolicy: HSME_FOUNDATION_REUSE_QUALITY_POLICY,
    fixtureSetId,
    candidates: Object.freeze([...candidates].sort((left, right) => lexical(left.candidateId, right.candidateId))),
    assets: Object.freeze([...assets].sort((left, right) => lexical(left.assetId, right.assetId))),
    cases: Object.freeze([...cases].sort((left, right) => lexical(left.caseId, right.caseId))),
    dimensionPolicies: Object.freeze([...dimensionPolicies]),
    automatedMetricPolicies: Object.freeze([...automatedMetricPolicies].sort((left, right) => lexical(left.metricId, right.metricId))),
    blindedRubric,
    outputsObserved: false,
    postObservationPolicyChangesAllowed: false,
    candidateSpecificPromptOverridesAllowed: false,
    benchmarkInputsTrainingAllowed: false,
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    billingAuthorityGranted: false,
    projectArtifactMutationAllowed: false,
    durableModelFleetAuthorityGranted: false,
    aeeExecutionAuthorityGranted: false,
  });
}

export async function proveHsmeFoundationQualityFixtureV1(
  raw: unknown,
  hash: HsmeFoundationQualityFixtureHashPortV1,
): Promise<HsmeFoundationQualityFixtureEvidenceV1> {
  const fixture = normalizeHsmeFoundationQualityFixtureV1(raw);

  for (const testCase of fixture.cases) {
    const digest = await checkedDigest(new TextEncoder().encode(testCase.promptUtf8), hash);
    if (digest !== testCase.promptSha256) {
      fail('hsme_foundation_fixture_prompt_digest_mismatch', `${testCase.caseId} promptSha256 does not match promptUtf8`);
    }
  }

  const [candidateLockSha256, fixtureSetSha256, benchmarkPolicySha256, blindedRubricSha256] =
    await Promise.all([
      digestDomain(
        HSME_FOUNDATION_CANDIDATE_LOCK_DIGEST_DOMAIN,
        fixture.candidates,
        hash,
      ),
      digestDomain(
        HSME_FOUNDATION_FIXTURE_SET_DIGEST_DOMAIN,
        {
          fixtureSetId: fixture.fixtureSetId,
          assets: fixture.assets,
          cases: fixture.cases,
        },
        hash,
      ),
      digestDomain(
        HSME_FOUNDATION_BENCHMARK_POLICY_DIGEST_DOMAIN,
        {
          qualityPolicy: fixture.qualityPolicy,
          dimensionPolicies: fixture.dimensionPolicies,
          automatedMetricPolicies: fixture.automatedMetricPolicies,
          candidateSpecificPromptOverridesAllowed: fixture.candidateSpecificPromptOverridesAllowed,
          postObservationPolicyChangesAllowed: fixture.postObservationPolicyChangesAllowed,
        },
        hash,
      ),
      digestDomain(
        HSME_FOUNDATION_BLINDED_RUBRIC_DIGEST_DOMAIN,
        fixture.blindedRubric,
        hash,
      ),
    ]);

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_QUALITY_FIXTURE_EVIDENCE_V1_SCHEMA,
    qualityPolicy: fixture.qualityPolicy,
    candidateLockSha256,
    fixtureSetSha256,
    benchmarkPolicySha256,
    blindedRubricSha256,
    candidateCount: fixture.candidates.length,
    assetCount: fixture.assets.length,
    caseCount: fixture.cases.length,
    tracks: Object.freeze([...TRACKS]),
    dimensionPriority: Object.freeze(fixture.dimensionPolicies.map(value => value.dimensionId)),
    promptDigestsVerified: true,
    assetUseRightsVerified: true,
    candidateLockPreOutputVerified: true,
    trainingUseForbiddenVerified: true,
    blindedEfficiencyIdentityVerified: true,
  });
}

function normalizeCandidate(raw: unknown, path: string): HsmeFoundationFixtureCandidateV1 {
  const record = exactRecord(
    raw,
    [
      'candidateId',
      'role',
      'sourceRoot',
      'immutableRevision',
      'contentSha256',
      'representationId',
      'precisionId',
      'derivedFromContentSha256',
    ],
    path,
  );
  const sourceRoot = text(record.sourceRoot, `${path}.sourceRoot`, 240);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sourceRoot)) {
    fail('hsme_foundation_fixture_source_invalid', `${path}.sourceRoot must be owner/name`);
  }
  const immutableRevision = text(record.immutableRevision, `${path}.immutableRevision`, 64);
  if (!IMMUTABLE_REVISION.test(immutableRevision)) {
    fail('hsme_foundation_fixture_revision_invalid', `${path}.immutableRevision must be immutable 40/64-hex`);
  }
  const derived = record.derivedFromContentSha256 === 'NONE'
    ? 'NONE'
    : sha256(record.derivedFromContentSha256, `${path}.derivedFromContentSha256`);
  return Object.freeze({
    candidateId: identifier(record.candidateId, `${path}.candidateId`, 120),
    role: enumValue(record.role, ROLES, `${path}.role`),
    sourceRoot,
    immutableRevision,
    contentSha256: sha256(record.contentSha256, `${path}.contentSha256`),
    representationId: identifier(record.representationId, `${path}.representationId`, 120),
    precisionId: identifier(record.precisionId, `${path}.precisionId`, 80),
    derivedFromContentSha256: derived,
  });
}

function normalizeAsset(raw: unknown, path: string): HsmeFoundationFixtureAssetV1 {
  const record = exactRecord(
    raw,
    [
      'assetId',
      'mediaType',
      'contentSha256',
      'provenanceClass',
      'provenanceEvidenceSha256',
      'licenseConclusion',
      'licenseEvidenceSha256',
      'redistributionAllowed',
      'retentionAllowed',
      'containsIdentifiablePerson',
      'personConsent',
      'personConsentEvidenceSha256',
      'benchmarkAllowed',
      'trainingAllowed',
    ],
    path,
  );

  const licenseConclusion = enumValue(record.licenseConclusion, LICENSE_CONCLUSIONS, `${path}.licenseConclusion`);
  if (licenseConclusion !== 'BENCHMARK_ALLOWED') {
    fail('hsme_foundation_fixture_asset_rights_not_admitted', `${path} licenseConclusion must be BENCHMARK_ALLOWED`);
  }
  if (record.benchmarkAllowed !== true) {
    fail('hsme_foundation_fixture_benchmark_use_not_allowed', `${path}.benchmarkAllowed must be true`);
  }
  if (record.trainingAllowed !== false) {
    fail('hsme_foundation_fixture_asset_training_use_forbidden', `${path}.trainingAllowed must be false`);
  }

  const containsIdentifiablePerson = boolean(record.containsIdentifiablePerson, `${path}.containsIdentifiablePerson`);
  const personConsent = enumValue(record.personConsent, PERSON_CONSENT_STATES, `${path}.personConsent`);
  let personConsentEvidenceSha256: string | 'NOT_APPLICABLE';
  if (containsIdentifiablePerson) {
    if (personConsent !== 'DOCUMENTED') {
      fail('hsme_foundation_fixture_person_consent_required', `${path} identifiable person requires DOCUMENTED consent`);
    }
    personConsentEvidenceSha256 = sha256(record.personConsentEvidenceSha256, `${path}.personConsentEvidenceSha256`);
  } else {
    if (personConsent !== 'NOT_APPLICABLE' || record.personConsentEvidenceSha256 !== 'NOT_APPLICABLE') {
      fail('hsme_foundation_fixture_person_consent_not_applicable', `${path} non-person asset must use NOT_APPLICABLE consent`);
    }
    personConsentEvidenceSha256 = 'NOT_APPLICABLE';
  }

  return Object.freeze({
    assetId: identifier(record.assetId, `${path}.assetId`, 120),
    mediaType: enumValue(record.mediaType, ['IMAGE', 'MASK'] as const, `${path}.mediaType`),
    contentSha256: sha256(record.contentSha256, `${path}.contentSha256`),
    provenanceClass: enumValue(record.provenanceClass, PROVENANCE_CLASSES, `${path}.provenanceClass`),
    provenanceEvidenceSha256: sha256(record.provenanceEvidenceSha256, `${path}.provenanceEvidenceSha256`),
    licenseConclusion,
    licenseEvidenceSha256: sha256(record.licenseEvidenceSha256, `${path}.licenseEvidenceSha256`),
    redistributionAllowed: boolean(record.redistributionAllowed, `${path}.redistributionAllowed`),
    retentionAllowed: boolean(record.retentionAllowed, `${path}.retentionAllowed`),
    containsIdentifiablePerson,
    personConsent,
    personConsentEvidenceSha256,
    benchmarkAllowed: true,
    trainingAllowed: false,
  });
}

function normalizeCase(
  raw: unknown,
  assets: readonly HsmeFoundationFixtureAssetV1[],
  plannedDimensions: readonly HsmeFoundationFixtureDimensionV1[],
  path: string,
): HsmeFoundationFixtureCaseV1 {
  const record = exactRecord(
    raw,
    [
      'caseId',
      'track',
      'promptUtf8',
      'promptSha256',
      'inputAssetIds',
      'referenceAssetIds',
      'dimensions',
    ],
    path,
  );
  const caseId = identifier(record.caseId, `${path}.caseId`, 120);
  const track = enumValue(record.track, TRACKS, `${path}.track`);
  const promptUtf8 = text(record.promptUtf8, `${path}.promptUtf8`, 4096);
  const inputAssetIds = identifierSet(record.inputAssetIds, `${path}.inputAssetIds`, 0, 8);
  const referenceAssetIds = identifierSet(record.referenceAssetIds, `${path}.referenceAssetIds`, 0, 8);
  const dimensions = enumSet(record.dimensions, DIMENSIONS, `${path}.dimensions`, 1, DIMENSIONS.length);

  if (track === 'TEXT_TO_IMAGE' && inputAssetIds.length !== 0) {
    fail('hsme_foundation_fixture_t2i_input_forbidden', `${caseId} TEXT_TO_IMAGE cannot have input assets`);
  }
  if (track === 'SINGLE_IMAGE_EDIT' && inputAssetIds.length !== 1) {
    fail('hsme_foundation_fixture_single_edit_input_invalid', `${caseId} SINGLE_IMAGE_EDIT requires exactly one input asset`);
  }
  if (track === 'MULTI_REFERENCE_EDIT' && inputAssetIds.length + referenceAssetIds.length < 2) {
    fail('hsme_foundation_fixture_multi_reference_input_invalid', `${caseId} MULTI_REFERENCE_EDIT requires at least two bound assets`);
  }

  for (const assetId of [...inputAssetIds, ...referenceAssetIds]) {
    if (!assets.some(asset => asset.assetId === assetId)) {
      fail('hsme_foundation_fixture_case_asset_missing', `${caseId} references unknown asset ${assetId}`);
    }
  }
  for (const dimensionId of dimensions) {
    if (!plannedDimensions.includes(dimensionId)) {
      fail('hsme_foundation_fixture_case_dimension_unplanned', `${caseId} uses unplanned dimension ${dimensionId}`);
    }
  }

  return Object.freeze({
    caseId,
    track,
    promptUtf8,
    promptSha256: sha256(record.promptSha256, `${path}.promptSha256`),
    inputAssetIds,
    referenceAssetIds,
    dimensions,
  });
}

function normalizeDimensionPolicy(raw: unknown, path: string): HsmeFoundationFixtureDimensionPolicyV1 {
  const record = exactRecord(
    raw,
    ['dimensionId', 'maxLossMicrounits', 'scoringMode', 'reviewMode', 'referenceCandidateId'],
    path,
  );
  const scoringMode = enumValue(record.scoringMode, SCORING_MODES, `${path}.scoringMode`);
  const reviewMode = enumValue(record.reviewMode, REVIEW_MODES, `${path}.reviewMode`);
  if (scoringMode === 'BLINDED_HUMAN_LOSS' && reviewMode !== 'BLINDED_HUMAN') {
    fail('hsme_foundation_fixture_scoring_review_mismatch', `${path} blinded-human scoring requires BLINDED_HUMAN review`);
  }
  if (scoringMode === 'AUTOMATED_LOSS' && reviewMode !== 'AUTOMATED') {
    fail('hsme_foundation_fixture_scoring_review_mismatch', `${path} automated scoring requires AUTOMATED review`);
  }
  if (scoringMode === 'HYBRID_MAX_LOSS' && reviewMode !== 'HYBRID') {
    fail('hsme_foundation_fixture_scoring_review_mismatch', `${path} hybrid scoring requires HYBRID review`);
  }
  return Object.freeze({
    dimensionId: enumValue(record.dimensionId, DIMENSIONS, `${path}.dimensionId`),
    maxLossMicrounits: safeInteger(record.maxLossMicrounits, `${path}.maxLossMicrounits`, 0, 1_000_000_000),
    scoringMode,
    reviewMode,
    referenceCandidateId: identifier(record.referenceCandidateId, `${path}.referenceCandidateId`, 120),
  });
}

function normalizeMetricPolicy(
  raw: unknown,
  plannedDimensions: readonly HsmeFoundationFixtureDimensionV1[],
  path: string,
): HsmeFoundationFixtureMetricPolicyV1 {
  const record = exactRecord(
    raw,
    ['metricId', 'dimensionId', 'methodId', 'toolchainSha256', 'policySha256'],
    path,
  );
  const dimensionId = enumValue(record.dimensionId, DIMENSIONS, `${path}.dimensionId`);
  if (!plannedDimensions.includes(dimensionId)) {
    fail('hsme_foundation_fixture_metric_dimension_unplanned', `${path} references unplanned dimension ${dimensionId}`);
  }
  return Object.freeze({
    metricId: identifier(record.metricId, `${path}.metricId`, 120),
    dimensionId,
    methodId: identifier(record.methodId, `${path}.methodId`, 120),
    toolchainSha256: sha256(record.toolchainSha256, `${path}.toolchainSha256`),
    policySha256: sha256(record.policySha256, `${path}.policySha256`),
  });
}

function normalizeBlindedRubric(raw: unknown): HsmeFoundationFixtureBlindedRubricV1 {
  const record = exactRecord(
    raw,
    [
      'blindingMode',
      'randomizedPresentation',
      'randomizationSeedSha256',
      'candidateIdentityVisibleToReviewer',
      'efficiencyIdentityVisibleToReviewer',
      'sourceAndReferenceVisibleAsCaseRequires',
      'independentDimensionScoring',
      'rubricDocumentSha256',
      'panelPolicySha256',
    ],
    'blindedRubric',
  );
  if (record.blindingMode !== 'CANDIDATE_AND_EFFICIENCY_HIDDEN') {
    fail('hsme_foundation_fixture_blinding_mode_invalid', 'candidate and efficiency identity must be hidden');
  }
  assertTrue(record.randomizedPresentation, 'randomizedPresentation', 'hsme_foundation_fixture_randomization_required');
  assertFalse(record.candidateIdentityVisibleToReviewer, 'candidateIdentityVisibleToReviewer', 'hsme_foundation_fixture_candidate_blinding_required');
  assertFalse(record.efficiencyIdentityVisibleToReviewer, 'efficiencyIdentityVisibleToReviewer', 'hsme_foundation_fixture_efficiency_blinding_required');
  assertTrue(record.sourceAndReferenceVisibleAsCaseRequires, 'sourceAndReferenceVisibleAsCaseRequires', 'hsme_foundation_fixture_source_visibility_required');
  assertTrue(record.independentDimensionScoring, 'independentDimensionScoring', 'hsme_foundation_fixture_independent_scoring_required');
  return Object.freeze({
    blindingMode: 'CANDIDATE_AND_EFFICIENCY_HIDDEN',
    randomizedPresentation: true,
    randomizationSeedSha256: sha256(record.randomizationSeedSha256, 'blindedRubric.randomizationSeedSha256'),
    candidateIdentityVisibleToReviewer: false,
    efficiencyIdentityVisibleToReviewer: false,
    sourceAndReferenceVisibleAsCaseRequires: true,
    independentDimensionScoring: true,
    rubricDocumentSha256: sha256(record.rubricDocumentSha256, 'blindedRubric.rubricDocumentSha256'),
    panelPolicySha256: sha256(record.panelPolicySha256, 'blindedRubric.panelPolicySha256'),
  });
}

async function digestDomain(
  domain: string,
  value: unknown,
  hash: HsmeFoundationQualityFixtureHashPortV1,
): Promise<string> {
  return checkedDigest(
    new TextEncoder().encode(`${domain}${JSON.stringify(value)}`),
    hash,
  );
}

async function checkedDigest(
  bytes: Uint8Array,
  hash: HsmeFoundationQualityFixtureHashPortV1,
): Promise<string> {
  const digest = await hash.sha256(bytes);
  if (!HEX64.test(digest)) {
    fail('hsme_foundation_fixture_hash_port_invalid', 'hash port must return lowercase SHA-256 hex');
  }
  return digest;
}

function exactRecord(raw: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_foundation_fixture_record_invalid', `${path} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      fail('hsme_foundation_fixture_field_unknown', `${path}.${key} is not allowed`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) {
      fail('hsme_foundation_fixture_field_missing', `${path}.${key} is required`);
    }
  }
  return record;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail('hsme_foundation_fixture_enum_invalid', `${path} is invalid`);
  }
  return value as T[number];
}

function enumSet<T extends readonly string[]>(
  value: unknown,
  values: T,
  path: string,
  min: number,
  max: number,
): readonly T[number][] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail('hsme_foundation_fixture_enum_set_invalid', `${path} must contain ${min}..${max} entries`);
  }
  const result = value.map((item, index) => enumValue(item, values, `${path}[${index}]`));
  if (new Set(result).size !== result.length) {
    fail('hsme_foundation_fixture_enum_set_duplicate', `${path} must be unique`);
  }
  return Object.freeze([...result].sort(lexical));
}

function identifierSet(value: unknown, path: string, min: number, max: number): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail('hsme_foundation_fixture_identifier_set_invalid', `${path} must contain ${min}..${max} entries`);
  }
  const result = value.map((item, index) => identifier(item, `${path}[${index}]`, 120));
  if (new Set(result).size !== result.length) {
    fail('hsme_foundation_fixture_identifier_set_duplicate', `${path} must be unique`);
  }
  return Object.freeze([...result].sort(lexical));
}

function assertUnique(values: readonly string[], name: string, code: string): void {
  if (new Set(values).size !== values.length) {
    fail(code, `${name} values must be unique`);
  }
}

function sha256(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!HEX64.test(result)) {
    fail('hsme_foundation_fixture_hash_invalid', `${path} must be lowercase SHA-256`);
  }
  return result;
}

function identifier(value: unknown, path: string, max: number): string {
  const result = text(value, path, max);
  if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) {
    fail('hsme_foundation_fixture_identifier_invalid', `${path} is invalid`);
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
    fail('hsme_foundation_fixture_text_invalid', `${path} is invalid`);
  }
  return value;
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail('hsme_foundation_fixture_boolean_invalid', `${path} must be boolean`);
  }
  return value;
}

function safeInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_foundation_fixture_integer_invalid', `${path} is invalid`);
  }
  return value as number;
}

function assertFalse(value: unknown, field: string, code: string): void {
  if (value !== false) fail(code, `${field} must be false`);
}

function assertTrue(value: unknown, field: string, code: string): void {
  if (value !== true) fail(code, `${field} must be true`);
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
  throw new HsmeFoundationQualityFixtureV1Error(code, message);
}
