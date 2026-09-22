import {
  HSME_FOUNDATION_REUSE_QUALITY_POLICY,
} from './HsmeFoundationReuseDecisionV1';
import {
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from './HsmeFoundationBenchmarkCampaignV1';
import {
  hsmeFoundationQualityFinalizationV1Digest,
  proveHsmeFoundationQualityFinalizationV1,
  type HsmeFoundationQualityFinalizationHashPortV1,
  type HsmeFoundationQualityFinalizationV1,
  type HsmeFoundationQualityRunFinalizationV1,
} from './HsmeFoundationQualityFinalizationV1';

export const HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_QUALITY_FRONTIER_V1' as const;
export const HSME_FOUNDATION_QUALITY_FRONTIER_DIGEST_DOMAIN =
  'bers:hsme:foundation-quality-frontier:v1\0' as const;

const SLICE_STATES = Object.freeze([
  'FULL_QUALITY_FRONTIER',
  'PARTIAL_BLOCKED',
  'FAILED_EVIDENCE',
  'NO_QUALITY_ELIGIBLE_CANDIDATE',
] as const);

type SliceState = typeof SLICE_STATES[number];

export type HsmeFoundationQualityFrontierCandidateV1 = Readonly<{
  candidateId: string;
  qualityState:
    | 'QUALITY_FLOOR_PASS'
    | 'QUALITY_FLOOR_FAIL'
    | 'BLOCKED_PARITY_PENDING'
    | 'FAILED_EVIDENCE';
  qualityLossVectorMicrounits: readonly number[] | 'UNRESOLVED';
}>;

export type HsmeFoundationQualityFrontierSliceV1 = Readonly<{
  sliceId: string;
  capability: 'TEXT_TO_IMAGE' | 'IMAGE_EDITING';
  state: SliceState;
  dimensionPriority: readonly string[];
  candidates: readonly HsmeFoundationQualityFrontierCandidateV1[];
  qualityPreferredCandidateIds: readonly string[];
  efficiencyCandidateIds: readonly string[];
  efficiencyComparisonAllowed: boolean;
}>;

export type HsmeFoundationQualityFrontierV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA;
  campaignId: string;
  qualityPolicy: typeof HSME_FOUNDATION_REUSE_QUALITY_POLICY;
  qualityFinalizationSha256: string;
  slices: readonly HsmeFoundationQualityFrontierSliceV1[];
  qualityOrderingFrozen: true;
  efficiencyMayOnlyUseQualityPreferredSet: true;
  productionAuthorityGranted: false;
  providerAuthorityGranted: false;
  billingAuthorityGranted: false;
  projectArtifactMutationAllowed: false;
  aeeExecutionAuthorityGranted: false;
  durableModelFleetPromotionAllowed: false;
  trainingOrDistillationAllowed: false;
  winnerSelectionAllowed: false;
}>;

export class HsmeFoundationQualityFrontierV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeFoundationQualityFrontierV1Error';
    this.code = code;
  }
}

export async function proveHsmeFoundationQualityFrontierV1(
  rawCampaign: unknown,
  rawTrust: unknown,
  rawFixturePlan: unknown,
  rawFixturePackEvidence: unknown,
  rawQualityRubric: unknown,
  rawRunEvidence: unknown,
  rawAssessmentEvidence: unknown,
  hash: HsmeFoundationQualityFinalizationHashPortV1,
): Promise<HsmeFoundationQualityFrontierV1> {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const finalization = await proveHsmeFoundationQualityFinalizationV1(
    rawCampaign,
    rawTrust,
    rawFixturePlan,
    rawFixturePackEvidence,
    rawQualityRubric,
    rawRunEvidence,
    rawAssessmentEvidence,
    hash,
  );
  const qualityFinalizationSha256 = await hsmeFoundationQualityFinalizationV1Digest(finalization, hash);

  const slices = campaign.slices.map(slice => {
    if (slice.capability !== 'TEXT_TO_IMAGE' && slice.capability !== 'IMAGE_EDITING') {
      fail('hsme_quality_frontier_slice_capability', 'frontier supports only frozen TEXT_TO_IMAGE and IMAGE_EDITING slices');
    }
    const dimensionPriority = Object.freeze(slice.dimensions.map(value => value.dimensionId));
    const selectionRows = slice.selectionCandidateIds.map(candidateId => {
      const row = finalization.rows.find(value =>
        value.candidateId === candidateId && value.capability === slice.capability
      );
      if (!row) fail('hsme_quality_frontier_selection_row_missing', 'selection row missing: ' + candidateId);
      if (row.qualityState === 'NOT_APPLICABLE') {
        fail('hsme_quality_frontier_selection_not_applicable', 'selection candidate cannot be NOT_APPLICABLE: ' + candidateId);
      }
      assertDimensionBinding(row, dimensionPriority);
      return row;
    });

    const candidates = Object.freeze(
      selectionRows
        .map(row => freezeCandidate(row, dimensionPriority))
        .sort((left, right) => lexical(left.candidateId, right.candidateId)),
    );

    let state: SliceState;
    if (selectionRows.some(row => row.qualityState === 'FAILED_EVIDENCE')) {
      state = 'FAILED_EVIDENCE';
    } else if (selectionRows.some(row => row.qualityState === 'BLOCKED_PARITY_PENDING')) {
      state = 'PARTIAL_BLOCKED';
    } else if (!selectionRows.some(row => row.qualityState === 'QUALITY_FLOOR_PASS')) {
      state = 'NO_QUALITY_ELIGIBLE_CANDIDATE';
    } else {
      state = 'FULL_QUALITY_FRONTIER';
    }

    let qualityPreferredCandidateIds: readonly string[] = Object.freeze([]);
    let efficiencyCandidateIds: readonly string[] = Object.freeze([]);
    let efficiencyComparisonAllowed = false;

    if (state === 'FULL_QUALITY_FRONTIER') {
      const eligible = candidates.filter(value => value.qualityState === 'QUALITY_FLOOR_PASS');
      if (eligible.length < 1) {
        fail('hsme_quality_frontier_internal_empty', 'full frontier requires at least one quality-pass candidate');
      }
      let preferred: HsmeFoundationQualityFrontierCandidateV1[] = [];
      for (const candidate of eligible) {
        if (preferred.length === 0) {
          preferred = [candidate];
          continue;
        }
        const comparison = compareVectors(
          candidate.qualityLossVectorMicrounits as readonly number[],
          preferred[0].qualityLossVectorMicrounits as readonly number[],
        );
        if (comparison < 0) preferred = [candidate];
        else if (comparison === 0) preferred.push(candidate);
      }
      qualityPreferredCandidateIds = Object.freeze(preferred.map(value => value.candidateId).sort(lexical));
      efficiencyCandidateIds = qualityPreferredCandidateIds;
      efficiencyComparisonAllowed = true;
    }

    return deepFreeze({
      sliceId: slice.sliceId,
      capability: slice.capability,
      state,
      dimensionPriority,
      candidates,
      qualityPreferredCandidateIds,
      efficiencyCandidateIds,
      efficiencyComparisonAllowed,
    });
  }).sort((left, right) => lexical(left.sliceId, right.sliceId));

  if (slices.length !== 2) {
    fail('hsme_quality_frontier_slice_count', 'frontier requires exactly two frozen campaign slices');
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_QUALITY_FRONTIER_V1_SCHEMA,
    campaignId: campaign.campaignId,
    qualityPolicy: HSME_FOUNDATION_REUSE_QUALITY_POLICY,
    qualityFinalizationSha256,
    slices: Object.freeze(slices),
    qualityOrderingFrozen: true,
    efficiencyMayOnlyUseQualityPreferredSet: true,
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    billingAuthorityGranted: false,
    projectArtifactMutationAllowed: false,
    aeeExecutionAuthorityGranted: false,
    durableModelFleetPromotionAllowed: false,
    trainingOrDistillationAllowed: false,
    winnerSelectionAllowed: false,
  });
}

export async function hsmeFoundationQualityFrontierV1Digest(
  raw: HsmeFoundationQualityFrontierV1,
  hash: HsmeFoundationQualityFinalizationHashPortV1,
): Promise<string> {
  const digest = await hash.sha256(new TextEncoder().encode(
    HSME_FOUNDATION_QUALITY_FRONTIER_DIGEST_DOMAIN + JSON.stringify(raw),
  ));
  if (!/^[0-9a-f]{64}$/.test(digest)) {
    fail('hsme_quality_frontier_hash_port_invalid', 'hash port must return lowercase SHA-256 hex');
  }
  return digest;
}

function freezeCandidate(
  row: HsmeFoundationQualityRunFinalizationV1,
  dimensionPriority: readonly string[],
): HsmeFoundationQualityFrontierCandidateV1 {
  if (row.qualityState === 'NOT_APPLICABLE') {
    fail('hsme_quality_frontier_selection_not_applicable', 'selection candidate cannot be NOT_APPLICABLE');
  }
  if (row.qualityState === 'BLOCKED_PARITY_PENDING' || row.qualityState === 'FAILED_EVIDENCE') {
    if (row.dimensionResults.length !== 0) {
      fail('hsme_quality_frontier_unresolved_dimensions', 'unresolved selection row cannot carry quality dimension results');
    }
    return deepFreeze({
      candidateId: row.candidateId,
      qualityState: row.qualityState,
      qualityLossVectorMicrounits: 'UNRESOLVED' as const,
    });
  }
  if (row.dimensionResults.length !== dimensionPriority.length) {
    fail('hsme_quality_frontier_dimension_count', 'measured selection row dimension count drift');
  }
  return deepFreeze({
    candidateId: row.candidateId,
    qualityState: row.qualityState,
    qualityLossVectorMicrounits: Object.freeze(row.dimensionResults.map(value => value.lossMicrounits)),
  });
}

function assertDimensionBinding(
  row: HsmeFoundationQualityRunFinalizationV1,
  dimensionPriority: readonly string[],
): void {
  if (row.qualityState === 'BLOCKED_PARITY_PENDING' || row.qualityState === 'FAILED_EVIDENCE') {
    if (row.dimensionResults.length !== 0) {
      fail('hsme_quality_frontier_unresolved_dimensions', 'unresolved row must not carry measured dimensions');
    }
    return;
  }
  const ids = row.dimensionResults.map(value => value.dimensionId);
  if (!sameStrings(ids, dimensionPriority)) {
    fail('hsme_quality_frontier_dimension_order', 'finalized dimension order differs from frozen campaign priority');
  }
}

function compareVectors(left: readonly number[], right: readonly number[]): number {
  if (left.length !== right.length || left.length < 1) {
    fail('hsme_quality_frontier_vector_shape', 'quality vectors must have equal non-zero length');
  }
  for (let index = 0; index < left.length; index += 1) {
    if (!Number.isSafeInteger(left[index]) || !Number.isSafeInteger(right[index])) {
      fail('hsme_quality_frontier_vector_integer', 'quality vectors must contain safe integers');
    }
    if (left[index] < right[index]) return -1;
    if (left[index] > right[index]) return 1;
  }
  return 0;
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
  throw new HsmeFoundationQualityFrontierV1Error(code, message);
}
