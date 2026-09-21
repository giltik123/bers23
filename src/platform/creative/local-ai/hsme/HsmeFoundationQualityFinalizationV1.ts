import {
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from './HsmeFoundationBenchmarkCampaignV1';
import {
  hsmeFoundationBenchmarkRunEvidenceV1Digest,
  normalizeHsmeFoundationBenchmarkRunEvidenceV1,
  proveHsmeFoundationBenchmarkRunEvidenceV1,
} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_QUALITY_ASSESSMENT_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_QUALITY_ASSESSMENT_EVIDENCE_V1' as const;
export const HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_QUALITY_FINALIZATION_V1' as const;
export const HSME_FOUNDATION_QUALITY_FINALIZATION_DIGEST_DOMAIN =
  'bers:hsme:foundation-quality-finalization:v1\0' as const;
export const HSME_FOUNDATION_QUALITY_DIMENSION_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:foundation-quality-dimension-evidence:v1\0' as const;

const REVIEW_MODES = Object.freeze(['AUTOMATED', 'BLINDED_HUMAN', 'HYBRID'] as const);
const QUALITY_STATES = Object.freeze([
  'QUALITY_FLOOR_PASS',
  'QUALITY_FLOOR_FAIL',
  'BLOCKED_PARITY_PENDING',
  'NOT_APPLICABLE',
  'FAILED_EVIDENCE',
] as const);
const HEX64 = /^[0-9a-f]{64}$/;
const BLIND_ID = /^blind_[0-9a-f]{24}$/;

type ReviewMode = typeof REVIEW_MODES[number];
type QualityState = typeof QUALITY_STATES[number];

export type HsmeFoundationQualityAssessmentRecordV1 = Readonly<{
  blindId: string;
  capability: 'TEXT_TO_IMAGE' | 'IMAGE_EDITING';
  dimensionId: string;
  reviewMode: ReviewMode;
  lossMicrounits: number;
  criticalFailure: boolean;
  evidenceSha256: string;
}>;

export type HsmeFoundationQualityAssessmentEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_QUALITY_ASSESSMENT_EVIDENCE_V1_SCHEMA;
  campaignId: string;
  runEvidenceSha256: string;
  blindedReviewRubricSha256: string;
  aggregationPolicy: 'MAX_NONCOMPENSABLE_CRITICAL_THEN_MEDIAN';
  medianPolicy: 'EVEN_ARITHMETIC_MEAN_HALF_UP';
  records: readonly HsmeFoundationQualityAssessmentRecordV1[];
  candidateIdentityIncluded: false;
  efficiencyMetadataIncluded: false;
  postObservationThresholdMutationAllowed: false;
  productionAuthorityGranted: false;
  providerAuthorityGranted: false;
  winnerSelectionAllowed: false;
}>;

export type HsmeFoundationQualityDimensionFinalizationV1 = Readonly<{
  dimensionId: string;
  reviewMode: ReviewMode;
  maxLossMicrounits: number;
  lossMicrounits: number;
  criticalFailureObserved: boolean;
  evidenceSha256: string;
  passesFloor: boolean;
}>;

export type HsmeFoundationQualityRunFinalizationV1 = Readonly<{
  candidateId: string;
  capability: 'TEXT_TO_IMAGE' | 'IMAGE_EDITING';
  qualityState: QualityState;
  outputSetSha256: string | 'UNKNOWN';
  dimensionResults: readonly HsmeFoundationQualityDimensionFinalizationV1[];
}>;

export type HsmeFoundationQualitySliceFinalizationV1 = Readonly<{
  sliceId: string;
  capability: 'TEXT_TO_IMAGE' | 'IMAGE_EDITING';
  qualityFloorPassCandidateIds: readonly string[];
  qualityFloorFailCandidateIds: readonly string[];
  unresolvedCandidateIds: readonly string[];
  failedEvidenceCandidateIds: readonly string[];
}>;

export type HsmeFoundationQualityFinalizationV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA;
  campaignId: string;
  runEvidenceSha256: string;
  runEvidenceState: 'FULL_COMPLETE' | 'PARTIAL_BLOCKED' | 'FAILED';
  finalizationState: 'FULL_FINALIZED' | 'PARTIAL_BLOCKED' | 'FAILED_EVIDENCE';
  aggregationPolicy: 'MAX_NONCOMPENSABLE_CRITICAL_THEN_MEDIAN';
  medianPolicy: 'EVEN_ARITHMETIC_MEAN_HALF_UP';
  rows: readonly HsmeFoundationQualityRunFinalizationV1[];
  slices: readonly HsmeFoundationQualitySliceFinalizationV1[];
  qualityEvidenceFrozen: true;
  efficiencyUsedInQualitySelection: false;
  productionAuthorityGranted: false;
  providerAuthorityGranted: false;
  billingAuthorityGranted: false;
  projectArtifactMutationAllowed: false;
  aeeExecutionAuthorityGranted: false;
  durableModelFleetPromotionAllowed: false;
  trainingOrDistillationAllowed: false;
  winnerSelectionAllowed: false;
}>;

export interface HsmeFoundationQualityFinalizationHashPortV1 {
  sha256(bytes: Uint8Array): Promise<string>;
}

export class HsmeFoundationQualityFinalizationV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeFoundationQualityFinalizationV1Error';
    this.code = code;
  }
}

export function normalizeHsmeFoundationQualityAssessmentEvidenceV1(
  raw: unknown,
): HsmeFoundationQualityAssessmentEvidenceV1 {
  const record = exactRecord(raw, [
    'schemaVersion',
    'campaignId',
    'runEvidenceSha256',
    'blindedReviewRubricSha256',
    'aggregationPolicy',
    'medianPolicy',
    'records',
    'candidateIdentityIncluded',
    'efficiencyMetadataIncluded',
    'postObservationThresholdMutationAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'winnerSelectionAllowed',
  ], 'assessmentEvidence');

  if (record.schemaVersion !== HSME_FOUNDATION_QUALITY_ASSESSMENT_EVIDENCE_V1_SCHEMA) {
    fail('hsme_quality_finalization_assessment_schema', 'unsupported assessment evidence schema');
  }
  if (record.aggregationPolicy !== 'MAX_NONCOMPENSABLE_CRITICAL_THEN_MEDIAN') {
    fail('hsme_quality_finalization_aggregation_policy', 'aggregation policy drift');
  }
  if (record.medianPolicy !== 'EVEN_ARITHMETIC_MEAN_HALF_UP') {
    fail('hsme_quality_finalization_median_policy', 'median policy drift');
  }
  if (
    record.candidateIdentityIncluded !== false
    || record.efficiencyMetadataIncluded !== false
    || record.postObservationThresholdMutationAllowed !== false
    || record.productionAuthorityGranted !== false
    || record.providerAuthorityGranted !== false
    || record.winnerSelectionAllowed !== false
  ) {
    fail('hsme_quality_finalization_authority_or_blinding', 'assessment evidence must remain blinded, immutable and non-authoritative');
  }
  if (!Array.isArray(record.records) || record.records.length < 1 || record.records.length > 4096) {
    fail('hsme_quality_finalization_records_invalid', 'assessment records must contain 1..4096 entries');
  }
  const records = record.records.map((value, index) => normalizeAssessmentRecord(value, 'assessmentEvidence.records[' + index + ']'));
  const keys = records.map(value => value.blindId + '\0' + value.dimensionId);
  if (new Set(keys).size !== keys.length) {
    fail('hsme_quality_finalization_record_duplicate', 'blindId/dimensionId assessment records must be unique');
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_QUALITY_ASSESSMENT_EVIDENCE_V1_SCHEMA,
    campaignId: identifier(record.campaignId, 'assessmentEvidence.campaignId', 160),
    runEvidenceSha256: sha256(record.runEvidenceSha256, 'assessmentEvidence.runEvidenceSha256'),
    blindedReviewRubricSha256: sha256(record.blindedReviewRubricSha256, 'assessmentEvidence.blindedReviewRubricSha256'),
    aggregationPolicy: 'MAX_NONCOMPENSABLE_CRITICAL_THEN_MEDIAN',
    medianPolicy: 'EVEN_ARITHMETIC_MEAN_HALF_UP',
    records: Object.freeze([...records].sort(compareAssessmentRecords)),
    candidateIdentityIncluded: false,
    efficiencyMetadataIncluded: false,
    postObservationThresholdMutationAllowed: false,
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    winnerSelectionAllowed: false,
  });
}

export async function proveHsmeFoundationQualityFinalizationV1(
  rawCampaign: unknown,
  rawTrust: unknown,
  rawFixturePlan: unknown,
  rawFixturePackEvidence: unknown,
  rawQualityRubric: unknown,
  rawRunEvidence: unknown,
  rawAssessmentEvidence: unknown,
  hash: HsmeFoundationQualityFinalizationHashPortV1,
): Promise<HsmeFoundationQualityFinalizationV1> {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const runEvidence = normalizeHsmeFoundationBenchmarkRunEvidenceV1(rawRunEvidence);
  const runProof = await proveHsmeFoundationBenchmarkRunEvidenceV1(
    rawCampaign,
    rawTrust,
    rawFixturePlan,
    rawFixturePackEvidence,
    runEvidence,
    hash,
  );
  const assessment = normalizeHsmeFoundationQualityAssessmentEvidenceV1(rawAssessmentEvidence);
  const runEvidenceSha256 = await hsmeFoundationBenchmarkRunEvidenceV1Digest(runEvidence, hash);
  const finalizationSlices = campaign.slices.map(slice => {
    if (slice.capability !== 'TEXT_TO_IMAGE' && slice.capability !== 'IMAGE_EDITING') {
      fail('hsme_quality_finalization_slice_capability', 'quality finalization supports only frozen TEXT_TO_IMAGE and IMAGE_EDITING slices');
    }
    return Object.freeze({
      sliceId: slice.sliceId,
      capability: slice.capability,
      selectionCandidateIds: slice.selectionCandidateIds,
      qualityReferenceCandidateIds: slice.qualityReferenceCandidateIds,
      dimensions: slice.dimensions,
    });
  });
  if (finalizationSlices.length !== 2) {
    fail('hsme_quality_finalization_slice_count', 'quality finalization requires exactly the two frozen benchmark slices');
  }

  if (assessment.campaignId !== campaign.campaignId) {
    fail('hsme_quality_finalization_campaign_mismatch', 'assessment campaign differs from frozen campaign');
  }
  if (assessment.runEvidenceSha256 !== runEvidenceSha256) {
    fail('hsme_quality_finalization_run_digest_mismatch', 'assessment evidence is not bound to the canonical run envelope');
  }
  if (assessment.blindedReviewRubricSha256 !== campaign.fixturePack.blindedReviewRubricSha256) {
    fail('hsme_quality_finalization_rubric_digest_mismatch', 'assessment rubric digest differs from frozen campaign');
  }

  const rubric = normalizeQualityRubric(rawQualityRubric);
  const rubricById = new Map(rubric.dimensions.map(value => [value.dimensionId, value]));
  for (const slice of finalizationSlices) {
    for (const dimension of slice.dimensions) {
      const rubricDimension = rubricById.get(dimension.dimensionId);
      if (!rubricDimension) {
        fail('hsme_quality_finalization_rubric_dimension_missing', 'rubric dimension missing: ' + dimension.dimensionId);
      }
      if (
        rubricDimension.reviewMode !== dimension.reviewMode
        || rubricDimension.rubricSha256 !== findPackRubricSha(rawFixturePackEvidence, dimension.dimensionId)
        || rubricDimension.globalMaxLossMicrounits !== dimension.maxLossMicrounits
        || rubricDimension.aggregation !== 'MAX_NONCOMPENSABLE_CRITICAL_THEN_MEDIAN'
      ) {
        fail('hsme_quality_finalization_rubric_binding', 'rubric/campaign binding drift: ' + dimension.dimensionId);
      }
    }
  }

  const completeOutputs = new Map<string, {
    candidateId: string;
    capability: 'TEXT_TO_IMAGE' | 'IMAGE_EDITING';
    outputSetSha256: string;
  }>();
  for (const run of runEvidence.runs) {
    if (run.status !== 'COMPLETE') continue;
    for (const output of run.outputs) {
      if (completeOutputs.has(output.blindId)) {
        fail('hsme_quality_finalization_blind_duplicate', 'run envelope contains duplicate blindId');
      }
      completeOutputs.set(output.blindId, {
        candidateId: run.candidateId,
        capability: run.capability,
        outputSetSha256: run.outputSetSha256,
      });
    }
  }

  const expectedRecordKeys = new Set<string>();
  for (const run of runEvidence.runs) {
    if (run.status !== 'COMPLETE') continue;
    const slice = finalizationSlices.find(value => value.capability === run.capability);
    if (!slice) fail('hsme_quality_finalization_slice_missing', 'campaign slice missing for ' + run.capability);
    for (const output of run.outputs) {
      for (const dimension of slice.dimensions) {
        expectedRecordKeys.add(output.blindId + '\0' + dimension.dimensionId);
      }
    }
  }
  const actualRecordKeys = new Set(assessment.records.map(value => value.blindId + '\0' + value.dimensionId));
  if (!sameStrings([...expectedRecordKeys].sort(lexical), [...actualRecordKeys].sort(lexical))) {
    fail('hsme_quality_finalization_assessment_roster', 'assessment records must cover every COMPLETE blind output and capability dimension exactly once');
  }

  for (const record of assessment.records) {
    const source = completeOutputs.get(record.blindId);
    if (!source) {
      fail('hsme_quality_finalization_unknown_blind_id', 'assessment references unknown blindId');
    }
    if (source.capability !== record.capability) {
      fail('hsme_quality_finalization_capability_mismatch', 'assessment capability differs from collected output');
    }
    const slice = campaign.slices.find(value => value.capability === record.capability)!;
    const dimension = slice.dimensions.find(value => value.dimensionId === record.dimensionId);
    if (!dimension) {
      fail('hsme_quality_finalization_dimension_unplanned', 'assessment contains dimension not frozen for capability');
    }
    if (record.reviewMode !== dimension.reviewMode) {
      fail('hsme_quality_finalization_review_mode_drift', 'assessment review mode differs from frozen dimension');
    }
  }

  const rows: HsmeFoundationQualityRunFinalizationV1[] = [];
  for (const run of runEvidence.runs) {
    if (run.status === 'NOT_APPLICABLE') {
      rows.push(frozenRow(run.candidateId, run.capability, 'NOT_APPLICABLE', run.outputSetSha256, []));
      continue;
    }
    if (run.status === 'BLOCKED_PARITY_PENDING') {
      rows.push(frozenRow(run.candidateId, run.capability, 'BLOCKED_PARITY_PENDING', run.outputSetSha256, []));
      continue;
    }
    if (run.status === 'FAILED') {
      rows.push(frozenRow(run.candidateId, run.capability, 'FAILED_EVIDENCE', run.outputSetSha256, []));
      continue;
    }

    const slice = finalizationSlices.find(value => value.capability === run.capability)!;
    const dimensionResults: HsmeFoundationQualityDimensionFinalizationV1[] = [];
    for (const dimension of slice.dimensions) {
      if (typeof dimension.maxLossMicrounits !== 'number') {
        fail('hsme_quality_finalization_threshold_not_pinned', 'quality threshold must be numeric and PINNED before finalization: ' + dimension.dimensionId);
      }
      const maxLossMicrounits = dimension.maxLossMicrounits;
      const records = run.outputs.map(output => {
        const record = assessment.records.find(value =>
          value.blindId === output.blindId && value.dimensionId === dimension.dimensionId
        );
        if (!record) fail('hsme_quality_finalization_assessment_missing', 'assessment record missing after roster proof');
        return record;
      });
      const critical = records.filter(value => value.criticalFailure);
      const lossMicrounits = critical.length > 0
        ? Math.max(...critical.map(value => value.lossMicrounits))
        : medianHalfUp(records.map(value => value.lossMicrounits));
      const evidenceSha256 = await dimensionEvidenceDigest(
        run.candidateId,
        run.capability,
        dimension.dimensionId,
        records,
        hash,
      );
      dimensionResults.push(deepFreeze({
        dimensionId: dimension.dimensionId,
        reviewMode: dimension.reviewMode,
        maxLossMicrounits,
        lossMicrounits,
        criticalFailureObserved: critical.length > 0,
        evidenceSha256,
        passesFloor: critical.length === 0 && lossMicrounits <= maxLossMicrounits,
      }));
    }

    const isReference = slice.qualityReferenceCandidateIds.includes(run.candidateId);
    if (isReference && dimensionResults.some(value => value.lossMicrounits !== 0 || value.criticalFailureObserved)) {
      fail('hsme_quality_finalization_reference_nonzero', 'quality reference must have zero measured loss and no critical failure');
    }
    const qualityState: QualityState = dimensionResults.every(value => value.passesFloor)
      ? 'QUALITY_FLOOR_PASS'
      : 'QUALITY_FLOOR_FAIL';
    rows.push(frozenRow(run.candidateId, run.capability, qualityState, run.outputSetSha256, dimensionResults));
  }

  rows.sort(compareRows);
  const slices: HsmeFoundationQualitySliceFinalizationV1[] = finalizationSlices.map(slice => {
    const selectedRows = slice.selectionCandidateIds.map(candidateId => {
      const row = rows.find(value => value.candidateId === candidateId && value.capability === slice.capability);
      if (!row) fail('hsme_quality_finalization_selection_row_missing', 'selection candidate row missing: ' + candidateId);
      return row;
    });
    return deepFreeze({
      sliceId: slice.sliceId,
      capability: slice.capability,
      qualityFloorPassCandidateIds: Object.freeze(selectedRows.filter(value => value.qualityState === 'QUALITY_FLOOR_PASS').map(value => value.candidateId).sort(lexical)),
      qualityFloorFailCandidateIds: Object.freeze(selectedRows.filter(value => value.qualityState === 'QUALITY_FLOOR_FAIL').map(value => value.candidateId).sort(lexical)),
      unresolvedCandidateIds: Object.freeze(selectedRows.filter(value => value.qualityState === 'BLOCKED_PARITY_PENDING').map(value => value.candidateId).sort(lexical)),
      failedEvidenceCandidateIds: Object.freeze(selectedRows.filter(value => value.qualityState === 'FAILED_EVIDENCE').map(value => value.candidateId).sort(lexical)),
    });
  }).sort((a, b) => lexical(a.sliceId, b.sliceId));

  const finalizationState: HsmeFoundationQualityFinalizationV1['finalizationState'] =
    runProof.state === 'FAILED'
      ? 'FAILED_EVIDENCE'
      : runProof.state === 'PARTIAL_BLOCKED'
        ? 'PARTIAL_BLOCKED'
        : 'FULL_FINALIZED';

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA,
    campaignId: campaign.campaignId,
    runEvidenceSha256,
    runEvidenceState: runProof.state,
    finalizationState,
    aggregationPolicy: 'MAX_NONCOMPENSABLE_CRITICAL_THEN_MEDIAN',
    medianPolicy: 'EVEN_ARITHMETIC_MEAN_HALF_UP',
    rows: Object.freeze(rows),
    slices: Object.freeze(slices),
    qualityEvidenceFrozen: true,
    efficiencyUsedInQualitySelection: false,
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

export async function hsmeFoundationQualityFinalizationV1Digest(
  raw: HsmeFoundationQualityFinalizationV1,
  hash: HsmeFoundationQualityFinalizationHashPortV1,
): Promise<string> {
  const digest = await hash.sha256(new TextEncoder().encode(
    HSME_FOUNDATION_QUALITY_FINALIZATION_DIGEST_DOMAIN + JSON.stringify(raw),
  ));
  if (!HEX64.test(digest)) {
    fail('hsme_quality_finalization_hash_port_invalid', 'hash port must return lowercase SHA-256 hex');
  }
  return digest;
}

function normalizeAssessmentRecord(raw: unknown, path: string): HsmeFoundationQualityAssessmentRecordV1 {
  const record = exactRecord(raw, [
    'blindId',
    'capability',
    'dimensionId',
    'reviewMode',
    'lossMicrounits',
    'criticalFailure',
    'evidenceSha256',
  ], path);
  const blindId = text(record.blindId, path + '.blindId', 64);
  if (!BLIND_ID.test(blindId)) fail('hsme_quality_finalization_blind_id_invalid', path + '.blindId invalid');
  const capability = enumValue(record.capability, ['TEXT_TO_IMAGE', 'IMAGE_EDITING'] as const, path + '.capability');
  const reviewMode = enumValue(record.reviewMode, REVIEW_MODES, path + '.reviewMode');
  return Object.freeze({
    blindId,
    capability,
    dimensionId: identifier(record.dimensionId, path + '.dimensionId', 96),
    reviewMode,
    lossMicrounits: safeInteger(record.lossMicrounits, path + '.lossMicrounits', 0, 1_000_000),
    criticalFailure: booleanValue(record.criticalFailure, path + '.criticalFailure'),
    evidenceSha256: sha256(record.evidenceSha256, path + '.evidenceSha256'),
  });
}

function normalizeQualityRubric(raw: unknown): {
  dimensions: readonly Readonly<{
    dimensionId: string;
    reviewMode: ReviewMode;
    rubricSha256: string;
    globalMaxLossMicrounits: number;
    aggregation: string;
  }>[];
} {
  const record = exactRecord(raw, ['schemaVersion', 'lossScaleMicrounits', 'thresholdPolicy', 'dimensions'], 'qualityRubric');
  if (record.schemaVersion !== 'BERS_HSME_FOUNDATION_QUALITY_RUBRIC_V1') {
    fail('hsme_quality_finalization_quality_rubric_schema', 'quality rubric schema mismatch');
  }
  const lossScale = exactRecord(record.lossScaleMicrounits, ['min', 'max', 'direction', 'anchor'], 'qualityRubric.lossScaleMicrounits');
  if (
    lossScale.min !== 0
    || lossScale.max !== 1_000_000
    || lossScale.direction !== 'LOWER_IS_BETTER'
    || lossScale.anchor !== 'LOSS_RELATIVE_TO_SLICE_REFERENCE'
  ) {
    fail('hsme_quality_finalization_loss_scale_drift', 'quality rubric loss scale drift');
  }
  const thresholdPolicy = exactRecord(record.thresholdPolicy, [
    'state',
    'candidateOutputsObserved',
    'postObservationMutationAllowed',
    'compensationAcrossDimensionsAllowed',
    'rationale',
  ], 'qualityRubric.thresholdPolicy');
  if (
    thresholdPolicy.state !== 'FROZEN_BEFORE_OUTPUTS'
    || thresholdPolicy.candidateOutputsObserved !== false
    || thresholdPolicy.postObservationMutationAllowed !== false
    || thresholdPolicy.compensationAcrossDimensionsAllowed !== false
    || typeof thresholdPolicy.rationale !== 'string'
    || thresholdPolicy.rationale.length < 1
  ) {
    fail('hsme_quality_finalization_threshold_policy_drift', 'quality rubric threshold policy is not the frozen pre-output policy');
  }
  if (!Array.isArray(record.dimensions) || record.dimensions.length !== 11) {
    fail('hsme_quality_finalization_quality_rubric_dimensions', 'quality rubric must contain 11 dimensions');
  }
  const dimensions = record.dimensions.map((value, index) => {
    const path = 'qualityRubric.dimensions[' + index + ']';
    const item = exactRecord(value, [
      'dimensionId',
      'reviewMode',
      'scalePolicy',
      'scalePolicySha256',
      'rubric',
      'rubricSha256',
      'globalMaxLossMicrounits',
    ], path);
    const rubricRecord = exactRecord(item.rubric, ['dimensionId', 'reviewMode', 'criteria', 'aggregation'], path + '.rubric');
    if (rubricRecord.dimensionId !== item.dimensionId || rubricRecord.reviewMode !== item.reviewMode) {
      fail('hsme_quality_finalization_quality_rubric_binding', 'embedded rubric binding mismatch');
    }
    return Object.freeze({
      dimensionId: identifier(item.dimensionId, path + '.dimensionId', 96),
      reviewMode: enumValue(item.reviewMode, REVIEW_MODES, path + '.reviewMode'),
      rubricSha256: sha256(item.rubricSha256, path + '.rubricSha256'),
      globalMaxLossMicrounits: safeInteger(item.globalMaxLossMicrounits, path + '.globalMaxLossMicrounits', 0, 1_000_000),
      aggregation: text(rubricRecord.aggregation, path + '.rubric.aggregation', 96),
    });
  });
  if (new Set(dimensions.map(value => value.dimensionId)).size !== dimensions.length) {
    fail('hsme_quality_finalization_quality_rubric_duplicate', 'quality rubric dimensions must be unique');
  }
  return Object.freeze({dimensions: Object.freeze(dimensions)});
}

function findPackRubricSha(rawFixturePackEvidence: unknown, dimensionId: string): string {
  const pack = rawFixturePackEvidence as any;
  const dimensions = pack?.sources?.blindedReviewRubric?.dimensions;
  if (!Array.isArray(dimensions)) {
    fail('hsme_quality_finalization_pack_rubric_missing', 'fixture pack blinded rubric missing');
  }
  const item = dimensions.find((value: any) => value?.dimensionId === dimensionId);
  if (!item || !HEX64.test(item.rubricSha256)) {
    fail('hsme_quality_finalization_pack_rubric_dimension_missing', 'fixture pack rubric dimension missing: ' + dimensionId);
  }
  return item.rubricSha256;
}

async function dimensionEvidenceDigest(
  candidateId: string,
  capability: string,
  dimensionId: string,
  records: readonly HsmeFoundationQualityAssessmentRecordV1[],
  hash: HsmeFoundationQualityFinalizationHashPortV1,
): Promise<string> {
  const normalized = [...records].sort(compareAssessmentRecords).map(value => ({
    blindId: value.blindId,
    capability: value.capability,
    dimensionId: value.dimensionId,
    reviewMode: value.reviewMode,
    lossMicrounits: value.lossMicrounits,
    criticalFailure: value.criticalFailure,
    evidenceSha256: value.evidenceSha256,
  }));
  const digest = await hash.sha256(new TextEncoder().encode(
    HSME_FOUNDATION_QUALITY_DIMENSION_EVIDENCE_DIGEST_DOMAIN
    + JSON.stringify({candidateId, capability, dimensionId, records: normalized}),
  ));
  if (!HEX64.test(digest)) fail('hsme_quality_finalization_hash_port_invalid', 'dimension evidence digest invalid');
  return digest;
}

function medianHalfUp(values: readonly number[]): number {
  if (values.length < 1) fail('hsme_quality_finalization_median_empty', 'median requires at least one value');
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Math.floor((sorted[middle - 1] + sorted[middle] + 1) / 2);
}

function frozenRow(
  candidateId: string,
  capability: 'TEXT_TO_IMAGE' | 'IMAGE_EDITING',
  qualityState: QualityState,
  outputSetSha256: string | 'UNKNOWN',
  dimensionResults: readonly HsmeFoundationQualityDimensionFinalizationV1[],
): HsmeFoundationQualityRunFinalizationV1 {
  return deepFreeze({
    candidateId,
    capability,
    qualityState,
    outputSetSha256,
    dimensionResults: Object.freeze([...dimensionResults]),
  });
}

function compareAssessmentRecords(left: HsmeFoundationQualityAssessmentRecordV1, right: HsmeFoundationQualityAssessmentRecordV1): number {
  return lexical(left.blindId, right.blindId) || lexical(left.dimensionId, right.dimensionId);
}
function compareRows(left: HsmeFoundationQualityRunFinalizationV1, right: HsmeFoundationQualityRunFinalizationV1): number {
  return lexical(left.candidateId, right.candidateId) || lexical(left.capability, right.capability);
}
function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
function exactRecord(raw: unknown, allowed: readonly string[], path: string): Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_quality_finalization_record_invalid', path + ' must be an object');
  }
  const record = raw as Record<string, any>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) fail('hsme_quality_finalization_field_unknown', path + '.' + key + ' is not allowed');
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) fail('hsme_quality_finalization_field_missing', path + '.' + key + ' is required');
  }
  return record;
}
function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !values.includes(value as T[number])) {
    fail('hsme_quality_finalization_enum_invalid', path + ' invalid');
  }
  return value as T[number];
}
function identifier(value: unknown, path: string, max: number): string {
  const result = text(value, path, max);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(result)) {
    fail('hsme_quality_finalization_identifier_invalid', path + ' invalid');
  }
  return result;
}
function text(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    fail('hsme_quality_finalization_text_invalid', path + ' invalid');
  }
  return value;
}
function safeInteger(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_quality_finalization_integer_invalid', path + ' invalid');
  }
  return value as number;
}
function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('hsme_quality_finalization_boolean_invalid', path + ' invalid');
  return value;
}
function sha256(value: unknown, path: string): string {
  if (typeof value !== 'string' || !HEX64.test(value)) {
    fail('hsme_quality_finalization_sha256_invalid', path + ' must be lowercase SHA-256 hex');
  }
  return value;
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
  throw new HsmeFoundationQualityFinalizationV1Error(code, message);
}
