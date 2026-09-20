import {
  HSME_FOUNDATION_REUSE_QUALITY_POLICY,
} from './HsmeFoundationReuseDecisionV1';

export const HSME_FOUNDATION_BENCHMARK_CAMPAIGN_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_BENCHMARK_CAMPAIGN_V1' as const;
export const HSME_FOUNDATION_BENCHMARK_CAMPAIGN_DIGEST_DOMAIN =
  'bers:hsme:foundation-benchmark-campaign:v1\0' as const;

const CAMPAIGN_STATES = Object.freeze([
  'EVIDENCE_PENDING',
  'FIXTURES_PINNED',
] as const);

const FIXTURE_STATES = Object.freeze([
  'PIN_REQUIRED',
  'PINNED',
] as const);

const ROLES = Object.freeze([
  'CONTROL_BASELINE',
  'MOBILE_REUSE',
  'DIRECT_FOUNDATION',
  'QUALITY_REFERENCE',
] as const);

const CAPABILITIES = Object.freeze([
  'TEXT_TO_IMAGE',
  'IMAGE_EDITING',
  'MULTI_REFERENCE_EDITING',
] as const);

const RIGHTS_STATES = Object.freeze([
  'REVIEW_REQUIRED',
  'REVIEWED_COMMERCIAL',
  'REVIEWED_WITH_OBLIGATIONS',
] as const);

const BENCHMARK_MODES = Object.freeze([
  'ZERO_TRAINING',
  'PROJECTOR_BRIDGE',
  'LORA',
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

const REQUIRED_DIMENSIONS_BY_CAPABILITY = Object.freeze({
  TEXT_TO_IMAGE: Object.freeze([
    'semantic-adherence',
    'anatomy-artifact-rate',
    'photorealism',
    'material-realism',
    'text-fidelity',
    'composition-count-spatial-correctness',
  ]),
  IMAGE_EDITING: Object.freeze([
    'identity-preservation',
    'garment-logo-pattern-preservation',
    'non-target-preservation',
    'edit-compliance',
    'anatomy-artifact-rate',
    'text-fidelity',
  ]),
  MULTI_REFERENCE_EDITING: Object.freeze([
    'identity-preservation',
    'garment-logo-pattern-preservation',
    'non-target-preservation',
    'edit-compliance',
    'anatomy-artifact-rate',
    'multi-reference-consistency',
  ]),
} as const);

const HEX64 = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;

type CampaignState = typeof CAMPAIGN_STATES[number];
type FixtureState = typeof FIXTURE_STATES[number];
type CandidateRole = typeof ROLES[number];
type Capability = typeof CAPABILITIES[number];
type RightsState = typeof RIGHTS_STATES[number];
type BenchmarkMode = typeof BENCHMARK_MODES[number];
type ReviewMode = typeof REVIEW_MODES[number];
type Dimension = typeof DIMENSIONS[number];

export type HsmeFoundationBenchmarkCandidateV1 = Readonly<{
  candidateId: string;
  roles: readonly CandidateRole[];
  sourceRoot: string;
  immutableRevision: string;
  modelContentSha256: string | 'UNKNOWN';
  executionProfileSha256: string | 'UNKNOWN';
  capabilities: readonly Capability[];
  benchmarkMode: BenchmarkMode;
  rightsState: RightsState;
  rightsEvidenceSha256: string | 'UNKNOWN';
  trustBinding: string;
}>;

export type HsmeFoundationBenchmarkDimensionV1 = Readonly<{
  dimensionId: Dimension;
  referenceCandidateId: string;
  maxLossMicrounits: number | 'PIN_REQUIRED';
  reviewMode: ReviewMode;
}>;

export type HsmeFoundationBenchmarkSliceV1 = Readonly<{
  sliceId: string;
  capability: Capability;
  selectionCandidateIds: readonly string[];
  controlCandidateIds: readonly string[];
  qualityReferenceCandidateIds: readonly string[];
  dimensions: readonly HsmeFoundationBenchmarkDimensionV1[];
}>;

export type HsmeFoundationBenchmarkFixturePackV1 = Readonly<{
  state: FixtureState;
  fixtureSetSha256: string | 'UNKNOWN';
  fixturePolicySha256: string | 'UNKNOWN';
  promptInputSetSha256: string | 'UNKNOWN';
  blindedReviewRubricSha256: string | 'UNKNOWN';
  deterministicInputPolicySha256: string | 'UNKNOWN';
  outputSetContractSha256: string | 'UNKNOWN';
  licenseEvidenceSha256: string | 'UNKNOWN';
  privateUserDataAllowed: false;
}>;

export type HsmeFoundationBenchmarkCampaignV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_BENCHMARK_CAMPAIGN_V1_SCHEMA;
  campaignId: string;
  qualityPolicy: typeof HSME_FOUNDATION_REUSE_QUALITY_POLICY;
  status: CampaignState;
  requiredCapabilities: readonly Capability[];
  candidates: readonly HsmeFoundationBenchmarkCandidateV1[];
  slices: readonly HsmeFoundationBenchmarkSliceV1[];
  fixturePack: HsmeFoundationBenchmarkFixturePackV1;
  postObservationCandidateChangesAllowed: false;
  postObservationThresholdChangesAllowed: false;
  postObservationDimensionOrderChangesAllowed: false;
  postObservationReferenceChangesAllowed: false;
  efficiencyUsedInQualitySelection: false;
  ordinaryCiModelExecutionAllowed: false;
  productionAuthorityGranted: false;
  providerAuthorityGranted: false;
  billingAuthorityGranted: false;
  projectArtifactMutationAllowed: false;
  aeeExecutionAuthorityGranted: false;
  trainingOrDistillationAllowed: false;
}>;

export interface HsmeFoundationBenchmarkHashPortV1 {
  sha256(bytes: Uint8Array): Promise<string>;
}

export class HsmeFoundationBenchmarkCampaignV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeFoundationBenchmarkCampaignV1Error';
    this.code = code;
  }
}

/**
 * Predeclared multi-foundation quality campaign.
 *
 * The campaign separates capability coverage from efficiency. A candidate that
 * has not proven editing cannot be silently scored as an editing-capable mobile
 * winner. Real evidence remains blocked until the fixture pack and per-candidate
 * rights are independently pinned.
 */
export function normalizeHsmeFoundationBenchmarkCampaignV1(
  raw: unknown,
): HsmeFoundationBenchmarkCampaignV1 {
  const record = exactRecord(raw, [
    'schemaVersion',
    'campaignId',
    'qualityPolicy',
    'status',
    'requiredCapabilities',
    'candidates',
    'slices',
    'fixturePack',
    'postObservationCandidateChangesAllowed',
    'postObservationThresholdChangesAllowed',
    'postObservationDimensionOrderChangesAllowed',
    'postObservationReferenceChangesAllowed',
    'efficiencyUsedInQualitySelection',
    'ordinaryCiModelExecutionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'trainingOrDistillationAllowed',
  ], 'campaign');

  if (record.schemaVersion !== HSME_FOUNDATION_BENCHMARK_CAMPAIGN_V1_SCHEMA) {
    fail(
      'hsme_foundation_campaign_schema_unsupported',
      `schemaVersion must be ${HSME_FOUNDATION_BENCHMARK_CAMPAIGN_V1_SCHEMA}`,
    );
  }
  if (record.qualityPolicy !== HSME_FOUNDATION_REUSE_QUALITY_POLICY) {
    fail(
      'hsme_foundation_campaign_quality_policy_invalid',
      `qualityPolicy must be ${HSME_FOUNDATION_REUSE_QUALITY_POLICY}`,
    );
  }
  for (const flag of [
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
  ] as const) {
    if (record[flag] !== false) {
      fail(
        'hsme_foundation_campaign_authority_or_mutation_invalid',
        `${flag} must remain false`,
      );
    }
  }
  if (record.efficiencyUsedInQualitySelection !== false) {
    fail(
      'hsme_foundation_campaign_efficiency_quality_mix_forbidden',
      'efficiency cannot participate in quality selection',
    );
  }
  if (record.ordinaryCiModelExecutionAllowed !== false) {
    fail(
      'hsme_foundation_campaign_ci_model_execution_forbidden',
      'ordinary CI cannot execute foundation model benchmarks',
    );
  }

  const status = enumValue(record.status, CAMPAIGN_STATES, 'status');
  const requiredCapabilities = enumSet(
    record.requiredCapabilities,
    CAPABILITIES,
    'requiredCapabilities',
    2,
    CAPABILITIES.length,
  );
  if (!requiredCapabilities.includes('TEXT_TO_IMAGE') || !requiredCapabilities.includes('IMAGE_EDITING')) {
    fail(
      'hsme_foundation_campaign_required_capability_missing',
      'TEXT_TO_IMAGE and IMAGE_EDITING are mandatory campaign capabilities',
    );
  }

  if (!Array.isArray(record.candidates) || record.candidates.length < 6 || record.candidates.length > 16) {
    fail('hsme_foundation_campaign_candidate_count_invalid', 'candidates must contain 6..16 entries');
  }
  const candidates = record.candidates.map((value, index) =>
    normalizeCandidate(value, `candidates[${index}]`),
  );
  const candidateIds = candidates.map(candidate => candidate.candidateId);
  if (new Set(candidateIds).size !== candidateIds.length) {
    fail('hsme_foundation_campaign_candidate_duplicate', 'candidateId must be unique');
  }

  requireRole(candidates, 'CONTROL_BASELINE');
  requireRole(candidates, 'MOBILE_REUSE');
  requireRole(candidates, 'QUALITY_REFERENCE');
  if (candidates.filter(candidate => candidate.roles.includes('DIRECT_FOUNDATION')).length < 2) {
    fail(
      'hsme_foundation_campaign_direct_foundation_count_invalid',
      'campaign requires at least two direct foundation variants',
    );
  }
  if (candidates.filter(candidate => candidate.roles.includes('QUALITY_REFERENCE')).length < 2) {
    fail(
      'hsme_foundation_campaign_reference_count_invalid',
      'campaign requires at least two quality references',
    );
  }

  if (!Array.isArray(record.slices) || record.slices.length < requiredCapabilities.length || record.slices.length > CAPABILITIES.length) {
    fail('hsme_foundation_campaign_slice_count_invalid', 'slices must cover every required capability');
  }
  const slices = record.slices.map((value, index) =>
    normalizeSlice(value, candidates, `slices[${index}]`),
  );
  const sliceIds = slices.map(slice => slice.sliceId);
  if (new Set(sliceIds).size !== sliceIds.length) {
    fail('hsme_foundation_campaign_slice_duplicate', 'sliceId must be unique');
  }
  const sliceCapabilities = slices.map(slice => slice.capability);
  if (new Set(sliceCapabilities).size !== sliceCapabilities.length) {
    fail(
      'hsme_foundation_campaign_capability_slice_duplicate',
      'each capability may have only one canonical slice',
    );
  }
  for (const capability of requiredCapabilities) {
    if (!sliceCapabilities.includes(capability)) {
      fail(
        'hsme_foundation_campaign_capability_slice_missing',
        `required capability ${capability} has no benchmark slice`,
      );
    }
  }

  const fixturePack = normalizeFixturePack(record.fixturePack);
  const qualityThresholdsPinned = slices.every(slice =>
    slice.dimensions.every(dimension => dimension.maxLossMicrounits !== 'PIN_REQUIRED'),
  );
  if (status === 'FIXTURES_PINNED' && !qualityThresholdsPinned) {
    fail(
      'hsme_foundation_campaign_thresholds_unpinned',
      'FIXTURES_PINNED campaign requires every quality threshold to be pinned before outputs exist',
    );
  }
  if (status === 'FIXTURES_PINNED' && fixturePack.state !== 'PINNED') {
    fail(
      'hsme_foundation_campaign_fixture_state_mismatch',
      'FIXTURES_PINNED campaign requires a pinned fixture pack',
    );
  }
  if (status === 'EVIDENCE_PENDING' && fixturePack.state === 'PINNED') {
    fail(
      'hsme_foundation_campaign_pending_fixture_mismatch',
      'campaign with pinned fixtures must use FIXTURES_PINNED status',
    );
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_BENCHMARK_CAMPAIGN_V1_SCHEMA,
    campaignId: identifier(record.campaignId, 'campaignId', 120),
    qualityPolicy: HSME_FOUNDATION_REUSE_QUALITY_POLICY,
    status,
    requiredCapabilities,
    candidates: Object.freeze([...candidates].sort((left, right) => lexical(left.candidateId, right.candidateId))),
    slices: Object.freeze([...slices].sort((left, right) => lexical(left.sliceId, right.sliceId))),
    fixturePack,
    postObservationCandidateChangesAllowed: false,
    postObservationThresholdChangesAllowed: false,
    postObservationDimensionOrderChangesAllowed: false,
    postObservationReferenceChangesAllowed: false,
    efficiencyUsedInQualitySelection: false,
    ordinaryCiModelExecutionAllowed: false,
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    billingAuthorityGranted: false,
    projectArtifactMutationAllowed: false,
    aeeExecutionAuthorityGranted: false,
    trainingOrDistillationAllowed: false,
  });
}

export function hsmeFoundationBenchmarkCandidateMayRunV1(
  raw: unknown,
  candidateId: string,
): boolean {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(raw);
  if (campaign.fixturePack.state !== 'PINNED') return false;
  if (campaign.slices.some(slice => slice.dimensions.some(dimension => dimension.maxLossMicrounits === 'PIN_REQUIRED'))) {
    return false;
  }
  const candidate = campaign.candidates.find(value => value.candidateId === candidateId);
  if (!candidate) {
    fail('hsme_foundation_campaign_candidate_missing', `candidate not found: ${candidateId}`);
  }
  return candidate.modelContentSha256 !== 'UNKNOWN'
    && candidate.executionProfileSha256 !== 'UNKNOWN'
    && candidate.rightsState !== 'REVIEW_REQUIRED'
    && candidate.rightsEvidenceSha256 !== 'UNKNOWN';
}

export function mayFinalizeHsmeFoundationBenchmarkCampaignV1(raw: unknown): boolean {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(raw);
  if (campaign.fixturePack.state !== 'PINNED') return false;
  if (campaign.slices.some(slice => slice.dimensions.some(dimension => dimension.maxLossMicrounits === 'PIN_REQUIRED'))) {
    return false;
  }
  const participantIds = new Set(
    campaign.slices.flatMap(slice => [
      ...slice.selectionCandidateIds,
      ...slice.controlCandidateIds,
      ...slice.qualityReferenceCandidateIds,
    ]),
  );
  for (const candidateId of participantIds) {
    const candidate = campaign.candidates.find(value => value.candidateId === candidateId)!;
    if (
      candidate.modelContentSha256 === 'UNKNOWN'
      || candidate.executionProfileSha256 === 'UNKNOWN'
      || candidate.rightsState === 'REVIEW_REQUIRED'
      || candidate.rightsEvidenceSha256 === 'UNKNOWN'
    ) {
      return false;
    }
  }
  return true;
}

export function unifiedRequiredCapabilityCandidatesV1(raw: unknown): readonly string[] {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(raw);
  return Object.freeze(
    campaign.candidates
      .filter(candidate =>
        (candidate.roles.includes('DIRECT_FOUNDATION') || candidate.roles.includes('MOBILE_REUSE'))
        && campaign.requiredCapabilities.every(capability => candidate.capabilities.includes(capability))
        && campaign.requiredCapabilities.every(capability =>
          campaign.slices
            .find(slice => slice.capability === capability)!
            .selectionCandidateIds.includes(candidate.candidateId),
        ),
      )
      .map(candidate => candidate.candidateId)
      .sort(lexical),
  );
}

export function serializeHsmeFoundationBenchmarkCampaignV1(raw: unknown): string {
  return JSON.stringify(normalizeHsmeFoundationBenchmarkCampaignV1(raw));
}

export async function hsmeFoundationBenchmarkCampaignV1Digest(
  raw: unknown,
  hash: HsmeFoundationBenchmarkHashPortV1,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    `${HSME_FOUNDATION_BENCHMARK_CAMPAIGN_DIGEST_DOMAIN}${serializeHsmeFoundationBenchmarkCampaignV1(raw)}`,
  );
  const digest = await hash.sha256(bytes);
  if (!HEX64.test(digest)) {
    fail('hsme_foundation_campaign_hash_port_invalid', 'hash port must return lowercase SHA-256');
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
    'executionProfileSha256',
    'capabilities',
    'benchmarkMode',
    'rightsState',
    'rightsEvidenceSha256',
    'trustBinding',
  ], path);
  const candidateId = identifier(record.candidateId, `${path}.candidateId`, 120);
  const roles = enumSet(record.roles, ROLES, `${path}.roles`, 1, ROLES.length);
  const sourceRoot = text(record.sourceRoot, `${path}.sourceRoot`, 240);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(sourceRoot)) {
    fail('hsme_foundation_campaign_source_invalid', `${path}.sourceRoot must be owner/name`);
  }
  const immutableRevision = text(record.immutableRevision, `${path}.immutableRevision`, 64);
  if (!IMMUTABLE_REVISION.test(immutableRevision)) {
    fail(
      'hsme_foundation_campaign_revision_invalid',
      `${path}.immutableRevision must be immutable 40/64-hex`,
    );
  }
  const modelContentSha256 = unknownOrSha256(
    record.modelContentSha256,
    `${path}.modelContentSha256`,
  );
  const executionProfileSha256 = unknownOrSha256(
    record.executionProfileSha256,
    `${path}.executionProfileSha256`,
  );
  const capabilities = enumSet(record.capabilities, CAPABILITIES, `${path}.capabilities`, 1, CAPABILITIES.length);
  const benchmarkMode = enumValue(record.benchmarkMode, BENCHMARK_MODES, `${path}.benchmarkMode`);
  const rightsState = enumValue(record.rightsState, RIGHTS_STATES, `${path}.rightsState`);
  const rightsEvidenceSha256 = unknownOrSha256(record.rightsEvidenceSha256, `${path}.rightsEvidenceSha256`);
  if (rightsState === 'REVIEW_REQUIRED' && rightsEvidenceSha256 !== 'UNKNOWN') {
    fail(
      'hsme_foundation_campaign_rights_unresolved_evidence_invalid',
      `${candidateId} unresolved rights cannot claim a resolved evidence digest`,
    );
  }
  if (rightsState !== 'REVIEW_REQUIRED' && rightsEvidenceSha256 === 'UNKNOWN') {
    fail(
      'hsme_foundation_campaign_rights_evidence_missing',
      `${candidateId} reviewed rights require evidence digest`,
    );
  }
  if (roles.includes('QUALITY_REFERENCE') && (roles.includes('DIRECT_FOUNDATION') || roles.includes('MOBILE_REUSE'))) {
    fail(
      'hsme_foundation_campaign_reference_selection_role_conflict',
      `${candidateId} quality reference cannot simultaneously be a selectable reuse role`,
    );
  }
  if (roles.includes('CONTROL_BASELINE') && roles.length !== 1) {
    fail(
      'hsme_foundation_campaign_control_role_conflict',
      `${candidateId} control baseline must remain control-only`,
    );
  }

  return deepFreeze({
    candidateId,
    roles,
    sourceRoot,
    immutableRevision,
    modelContentSha256,
    executionProfileSha256,
    capabilities,
    benchmarkMode,
    rightsState,
    rightsEvidenceSha256,
    trustBinding: text(record.trustBinding, `${path}.trustBinding`, 300),
  });
}

function normalizeSlice(
  raw: unknown,
  candidates: readonly HsmeFoundationBenchmarkCandidateV1[],
  path: string,
): HsmeFoundationBenchmarkSliceV1 {
  const record = exactRecord(raw, [
    'sliceId',
    'capability',
    'selectionCandidateIds',
    'controlCandidateIds',
    'qualityReferenceCandidateIds',
    'dimensions',
  ], path);

  const sliceId = identifier(record.sliceId, `${path}.sliceId`, 120);
  const capability = enumValue(record.capability, CAPABILITIES, `${path}.capability`);
  const selectionCandidateIds = identifierSet(record.selectionCandidateIds, `${path}.selectionCandidateIds`, 1, 12);
  const controlCandidateIds = identifierSet(
    record.controlCandidateIds,
    `${path}.controlCandidateIds`,
    0,
    4,
  );
  const qualityReferenceCandidateIds = identifierSet(
    record.qualityReferenceCandidateIds,
    `${path}.qualityReferenceCandidateIds`,
    1,
    8,
  );
  if (!Array.isArray(record.dimensions) || record.dimensions.length < 3 || record.dimensions.length > DIMENSIONS.length) {
    fail(
      'hsme_foundation_campaign_dimension_count_invalid',
      `${path}.dimensions must contain 3..${DIMENSIONS.length} entries`,
    );
  }
  const dimensions = record.dimensions.map((value, index) =>
    normalizeDimension(value, candidates, qualityReferenceCandidateIds, `${path}.dimensions[${index}]`),
  );
  const dimensionIds = dimensions.map(dimension => dimension.dimensionId);
  if (new Set(dimensionIds).size !== dimensionIds.length) {
    fail(
      'hsme_foundation_campaign_dimension_duplicate',
      `${path}.dimensions dimensionId values must be unique`,
    );
  }
  for (const required of REQUIRED_DIMENSIONS_BY_CAPABILITY[capability]) {
    if (!dimensionIds.includes(required)) {
      fail(
        'hsme_foundation_campaign_required_dimension_missing',
        `${sliceId} missing required quality dimension ${required}`,
      );
    }
  }

  for (const candidateId of selectionCandidateIds) {
    const candidate = requireCandidate(candidates, candidateId, path);
    if (!candidate.roles.includes('DIRECT_FOUNDATION') && !candidate.roles.includes('MOBILE_REUSE')) {
      fail(
        'hsme_foundation_campaign_selection_role_invalid',
        `${candidateId} is not a selectable reuse candidate`,
      );
    }
    if (!candidate.capabilities.includes(capability)) {
      fail(
        'hsme_foundation_campaign_selection_capability_unproven',
        `${candidateId} does not claim ${capability}`,
      );
    }
  }

  for (const candidateId of controlCandidateIds) {
    const candidate = requireCandidate(candidates, candidateId, path);
    if (!candidate.roles.includes('CONTROL_BASELINE')) {
      fail(
        'hsme_foundation_campaign_control_role_invalid',
        `${candidateId} is not a control baseline`,
      );
    }
    if (!candidate.capabilities.includes(capability)) {
      fail(
        'hsme_foundation_campaign_control_capability_unproven',
        `${candidateId} does not claim ${capability}`,
      );
    }
  }

  for (const candidateId of qualityReferenceCandidateIds) {
    const candidate = requireCandidate(candidates, candidateId, path);
    if (!candidate.roles.includes('QUALITY_REFERENCE')) {
      fail(
        'hsme_foundation_campaign_reference_role_invalid',
        `${candidateId} is not a quality reference`,
      );
    }
    if (!candidate.capabilities.includes(capability)) {
      fail(
        'hsme_foundation_campaign_reference_capability_unproven',
        `${candidateId} does not claim ${capability}`,
      );
    }
  }

  if (
    selectionCandidateIds.some(id => qualityReferenceCandidateIds.includes(id))
    || selectionCandidateIds.some(id => controlCandidateIds.includes(id))
    || controlCandidateIds.some(id => qualityReferenceCandidateIds.includes(id))
  ) {
    fail(
      'hsme_foundation_campaign_slice_role_overlap',
      `${sliceId} cannot overlap selection, control and quality-reference roles`,
    );
  }

  return deepFreeze({
    sliceId,
    capability,
    selectionCandidateIds,
    controlCandidateIds,
    qualityReferenceCandidateIds,
    dimensions: Object.freeze([...dimensions]),
  });
}

function normalizeDimension(
  raw: unknown,
  candidates: readonly HsmeFoundationBenchmarkCandidateV1[],
  qualityReferenceCandidateIds: readonly string[],
  path: string,
): HsmeFoundationBenchmarkDimensionV1 {
  const record = exactRecord(raw, [
    'dimensionId',
    'referenceCandidateId',
    'maxLossMicrounits',
    'reviewMode',
  ], path);
  const dimensionId = enumValue(record.dimensionId, DIMENSIONS, `${path}.dimensionId`);
  const referenceCandidateId = identifier(
    record.referenceCandidateId,
    `${path}.referenceCandidateId`,
    120,
  );
  if (!qualityReferenceCandidateIds.includes(referenceCandidateId)) {
    fail(
      'hsme_foundation_campaign_dimension_reference_outside_slice',
      `${referenceCandidateId} is not a quality reference for this capability slice`,
    );
  }
  const reference = requireCandidate(candidates, referenceCandidateId, path);
  if (!reference.roles.includes('QUALITY_REFERENCE')) {
    fail(
      'hsme_foundation_campaign_dimension_reference_role_invalid',
      `${referenceCandidateId} must be QUALITY_REFERENCE`,
    );
  }
  return Object.freeze({
    dimensionId,
    referenceCandidateId,
    maxLossMicrounits: record.maxLossMicrounits === 'PIN_REQUIRED'
      ? 'PIN_REQUIRED'
      : safeInteger(
          record.maxLossMicrounits,
          `${path}.maxLossMicrounits`,
          0,
          1_000_000_000,
        ),
    reviewMode: enumValue(record.reviewMode, REVIEW_MODES, `${path}.reviewMode`),
  });
}

function normalizeFixturePack(raw: unknown): HsmeFoundationBenchmarkFixturePackV1 {
  const record = exactRecord(raw, [
    'state',
    'fixtureSetSha256',
    'fixturePolicySha256',
    'promptInputSetSha256',
    'blindedReviewRubricSha256',
    'deterministicInputPolicySha256',
    'outputSetContractSha256',
    'licenseEvidenceSha256',
    'privateUserDataAllowed',
  ], 'fixturePack');
  const state = enumValue(record.state, FIXTURE_STATES, 'fixturePack.state');
  const digests = {
    fixtureSetSha256: unknownOrSha256(record.fixtureSetSha256, 'fixturePack.fixtureSetSha256'),
    fixturePolicySha256: unknownOrSha256(record.fixturePolicySha256, 'fixturePack.fixturePolicySha256'),
    promptInputSetSha256: unknownOrSha256(record.promptInputSetSha256, 'fixturePack.promptInputSetSha256'),
    blindedReviewRubricSha256: unknownOrSha256(record.blindedReviewRubricSha256, 'fixturePack.blindedReviewRubricSha256'),
    deterministicInputPolicySha256: unknownOrSha256(record.deterministicInputPolicySha256, 'fixturePack.deterministicInputPolicySha256'),
    outputSetContractSha256: unknownOrSha256(record.outputSetContractSha256, 'fixturePack.outputSetContractSha256'),
    licenseEvidenceSha256: unknownOrSha256(record.licenseEvidenceSha256, 'fixturePack.licenseEvidenceSha256'),
  };
  if (record.privateUserDataAllowed !== false) {
    fail(
      'hsme_foundation_campaign_private_fixture_forbidden',
      'benchmark fixture pack cannot contain private user data',
    );
  }
  const digestValues = Object.values(digests);
  if (state === 'PIN_REQUIRED' && digestValues.some(value => value !== 'UNKNOWN')) {
    fail(
      'hsme_foundation_campaign_unpinned_fixture_evidence_invalid',
      'PIN_REQUIRED fixture pack cannot claim pinned evidence digests',
    );
  }
  if (state === 'PINNED' && digestValues.some(value => value === 'UNKNOWN')) {
    fail(
      'hsme_foundation_campaign_fixture_evidence_missing',
      'PINNED fixture pack requires every fixture/rubric/input/output/license digest',
    );
  }
  return Object.freeze({
    state,
    ...digests,
    privateUserDataAllowed: false,
  });
}

function requireRole(
  candidates: readonly HsmeFoundationBenchmarkCandidateV1[],
  role: CandidateRole,
): void {
  if (!candidates.some(candidate => candidate.roles.includes(role))) {
    fail('hsme_foundation_campaign_role_missing', `campaign requires role ${role}`);
  }
}

function requireCandidate(
  candidates: readonly HsmeFoundationBenchmarkCandidateV1[],
  candidateId: string,
  path: string,
): HsmeFoundationBenchmarkCandidateV1 {
  const candidate = candidates.find(value => value.candidateId === candidateId);
  if (!candidate) {
    fail('hsme_foundation_campaign_candidate_reference_invalid', `${path} references unknown candidate ${candidateId}`);
  }
  return candidate;
}

function exactRecord(raw: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_foundation_campaign_record_invalid', `${path} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) {
      fail('hsme_foundation_campaign_field_unknown', `${path}.${key} is not allowed`);
    }
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) {
      fail('hsme_foundation_campaign_field_missing', `${path}.${key} is required`);
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
  sortResult = true,
): readonly T[number][] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail('hsme_foundation_campaign_enum_set_invalid', `${path} must contain ${min}..${max} entries`);
  }
  const result = value.map((item, index) => enumValue(item, values, `${path}[${index}]`));
  if (new Set(result).size !== result.length) {
    fail('hsme_foundation_campaign_enum_set_duplicate', `${path} must be unique`);
  }
  return Object.freeze(sortResult ? [...result].sort(lexical) : [...result]);
}

function identifierSet(value: unknown, path: string, min: number, max: number): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail('hsme_foundation_campaign_identifier_set_invalid', `${path} must contain ${min}..${max} entries`);
  }
  const result = value.map((item, index) => identifier(item, `${path}[${index}]`, 120));
  if (new Set(result).size !== result.length) {
    fail('hsme_foundation_campaign_identifier_set_duplicate', `${path} must be unique`);
  }
  return Object.freeze([...result].sort(lexical));
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail('hsme_foundation_campaign_enum_invalid', `${path} is invalid`);
  }
  return value as T[number];
}

function unknownOrSha256(value: unknown, path: string): string | 'UNKNOWN' {
  return value === 'UNKNOWN' ? 'UNKNOWN' : sha256(value, path);
}

function sha256(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!HEX64.test(result)) {
    fail('hsme_foundation_campaign_hash_invalid', `${path} must be lowercase SHA-256`);
  }
  return result;
}

function identifier(value: unknown, path: string, max: number): string {
  const result = text(value, path, max);
  if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) {
    fail('hsme_foundation_campaign_identifier_invalid', `${path} is invalid`);
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
    fail('hsme_foundation_campaign_text_invalid', `${path} is invalid`);
  }
  return value;
}

function safeInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_foundation_campaign_integer_invalid', `${path} is invalid`);
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
  throw new HsmeFoundationBenchmarkCampaignV1Error(code, message);
}
