import {
  type HsmeFoundationBenchmarkHashPortV1,
  hsmeFoundationBenchmarkCampaignV1Digest,
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from './HsmeFoundationBenchmarkCampaignV1';

export const HSME_FOUNDATION_BENCHMARK_ARTIFACT_MANIFEST_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_BENCHMARK_ARTIFACT_MANIFEST_V1' as const;
export const HSME_FOUNDATION_BENCHMARK_EXECUTION_PROFILE_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_BENCHMARK_EXECUTION_PROFILE_V1' as const;
export const HSME_FOUNDATION_BENCHMARK_RIGHTS_REVIEW_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_BENCHMARK_RIGHTS_REVIEW_V1' as const;
export const HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_V1' as const;
export const HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_EVIDENCE_V1' as const;

const HEX64 = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const EVIDENCE_STATES = Object.freeze(['EVIDENCE_PENDING', 'PINNED'] as const);
const ARTIFACT_ROLES = Object.freeze([
  'METADATA_CONFIG',
  'TOKENIZER_TEXT_ENCODER',
  'DENOISER_TRANSFORMER_UNET',
  'VAE_DECODER',
  'SCHEDULER_PROCESSOR',
  'RUNTIME_ASSET',
  'RUNTIME_CODE',
  'DOCUMENTATION_ONLY',
] as const);
const IDENTITY_METHODS = Object.freeze([
  'CONTENT_SHA256',
  'GIT_LFS_OID_SHA256_VERIFIED',
  'STREAMED_LOCAL_SHA256',
  'UNRESOLVED_XET_OR_STORAGE',
] as const);
const RIGHTS_REVIEW_STATES = Object.freeze(['REVIEW_REQUIRED', 'REVIEWED'] as const);
const RIGHTS_CONCLUSIONS = Object.freeze([
  'REVIEW_REQUIRED',
  'COMMERCIAL_ADMISSIBLE',
  'COMMERCIAL_ADMISSIBLE_WITH_OBLIGATIONS',
  'REJECTED',
] as const);
const DEPENDENCY_CONCLUSIONS = Object.freeze(['ADMITTED', 'REVIEW_REQUIRED', 'REJECTED'] as const);
const REMOTE_CODE_POLICIES = Object.freeze(['NO_MODEL_REPOSITORY_RUNTIME_CODE'] as const);

type EvidenceState = typeof EVIDENCE_STATES[number];
type ArtifactRole = typeof ARTIFACT_ROLES[number];
type IdentityMethod = typeof IDENTITY_METHODS[number];
type RightsReviewState = typeof RIGHTS_REVIEW_STATES[number];
type RightsConclusion = typeof RIGHTS_CONCLUSIONS[number];
type DependencyConclusion = typeof DEPENDENCY_CONCLUSIONS[number];

export type HsmeFoundationBenchmarkArtifactSourceV1 = Readonly<{
  sourceRoot: string;
  immutableRevision: string;
}>;

export type HsmeFoundationBenchmarkArtifactV1 = Readonly<{
  logicalId: string;
  source: HsmeFoundationBenchmarkArtifactSourceV1;
  relativePath: string;
  role: ArtifactRole;
  bytes: number | 'UNKNOWN';
  runtimeRequired: boolean;
  identityMethod: IdentityMethod;
  protocolContentSha256Verified: boolean;
  contentSha256: string | 'UNKNOWN';
}>;

export type HsmeFoundationBenchmarkArtifactManifestV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_BENCHMARK_ARTIFACT_MANIFEST_V1_SCHEMA;
  candidateId: string;
  state: EvidenceState;
  primarySource: HsmeFoundationBenchmarkArtifactSourceV1;
  artifacts: readonly HsmeFoundationBenchmarkArtifactV1[];
}>;

export type HsmeFoundationBenchmarkExecutionProfileV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_BENCHMARK_EXECUTION_PROFILE_V1_SCHEMA;
  candidateId: string;
  state: EvidenceState;
  artifactManifestDigest: string | 'UNKNOWN';
  pipelineClass: string | 'UNKNOWN';
  toolchainLockSha256: string | 'UNKNOWN';
  precisionPolicy: string | 'UNKNOWN';
  schedulerSampler: string | 'UNKNOWN';
  stepCount: number | 'PIN_REQUIRED';
  guidancePolicySha256: string | 'UNKNOWN';
  resolutionAspectPolicySha256: string | 'UNKNOWN';
  deterministicSeedLatentPolicySha256: string | 'UNKNOWN';
  imagePreprocessingSha256: string | 'UNKNOWN';
  referenceOrderingSha256: string | 'UNKNOWN';
  conditioningComponentsSha256: string | 'UNKNOWN';
  remoteCodePolicy: typeof REMOTE_CODE_POLICIES[number];
  hardwareBackendClass: string | 'UNKNOWN';
}>;

export type HsmeFoundationBenchmarkDependencyRightsV1 = Readonly<{
  source: HsmeFoundationBenchmarkArtifactSourceV1;
  artifactLogicalIds: readonly string[];
  licenseId: string;
  licenseEvidenceSha256: string;
  obligationsEvidenceSha256: string;
  conclusion: DependencyConclusion;
}>;

export type HsmeFoundationBenchmarkRightsReviewV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_BENCHMARK_RIGHTS_REVIEW_V1_SCHEMA;
  candidateId: string;
  reviewState: RightsReviewState;
  artifactManifestDigest: string | 'UNKNOWN';
  aggregateLicenseId: string | 'UNKNOWN';
  dependencyReviews: readonly HsmeFoundationBenchmarkDependencyRightsV1[];
  commercialUseConclusion: RightsConclusion;
  reviewPolicySha256: string | 'UNKNOWN';
  rationaleEvidenceSha256: string | 'UNKNOWN';
}>;

export type HsmeFoundationBenchmarkCandidateTrustEntryV1 = Readonly<{
  candidateId: string;
  artifactManifest: HsmeFoundationBenchmarkArtifactManifestV1;
  executionProfile: HsmeFoundationBenchmarkExecutionProfileV1;
  rightsReview: HsmeFoundationBenchmarkRightsReviewV1;
}>;

export type HsmeFoundationBenchmarkCandidateTrustV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_V1_SCHEMA;
  campaignId: string;
  campaignDigest: string | 'UNKNOWN';
  state: EvidenceState;
  candidates: readonly HsmeFoundationBenchmarkCandidateTrustEntryV1[];
  candidateOutputsObserved: false;
  winnerSelectionAllowed: false;
  efficiencyUsedInQualitySelection: false;
  ordinaryCiModelExecutionAllowed: false;
  productionAuthorityGranted: false;
  providerAuthorityGranted: false;
  billingAuthorityGranted: false;
  projectArtifactMutationAllowed: false;
  aeeExecutionAuthorityGranted: false;
  durableModelFleetPromotionAllowed: false;
  trainingOrDistillationAllowed: false;
}>;

export type HsmeFoundationBenchmarkCandidateTrustEvidenceEntryV1 = Readonly<{
  candidateId: string;
  modelContentSha256: string | 'UNKNOWN';
  executionProfileSha256: string | 'UNKNOWN';
  rightsEvidenceSha256: string | 'UNKNOWN';
  benchmarkRunnable: boolean;
}>;

export type HsmeFoundationBenchmarkCandidateTrustEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_EVIDENCE_V1_SCHEMA;
  campaignDigest: string;
  state: EvidenceState;
  entries: readonly HsmeFoundationBenchmarkCandidateTrustEvidenceEntryV1[];
  productionAuthorityGranted: false;
  winnerSelectionAllowed: false;
}>;

export class HsmeFoundationBenchmarkCandidateTrustV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeFoundationBenchmarkCandidateTrustV1Error';
    this.code = code;
  }
}

export function normalizeHsmeFoundationBenchmarkCandidateTrustV1(
  raw: unknown,
): HsmeFoundationBenchmarkCandidateTrustV1 {
  const record = exactRecord(raw, [
    'schemaVersion',
    'campaignId',
    'campaignDigest',
    'state',
    'candidates',
    'candidateOutputsObserved',
    'winnerSelectionAllowed',
    'efficiencyUsedInQualitySelection',
    'ordinaryCiModelExecutionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'trainingOrDistillationAllowed',
  ], 'candidateTrust');

  if (record.schemaVersion !== HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_V1_SCHEMA) {
    fail('hsme_foundation_trust_schema_unsupported', 'unsupported benchmark candidate trust schema');
  }
  for (const flag of [
    'candidateOutputsObserved',
    'winnerSelectionAllowed',
    'efficiencyUsedInQualitySelection',
    'ordinaryCiModelExecutionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'trainingOrDistillationAllowed',
  ] as const) {
    if (record[flag] !== false) {
      fail('hsme_foundation_trust_authority_invalid', flag + ' must remain false');
    }
  }

  const state = enumValue(record.state, EVIDENCE_STATES, 'candidateTrust.state');
  const campaignDigest = unknownOrSha256(record.campaignDigest, 'candidateTrust.campaignDigest');
  if (!Array.isArray(record.candidates) || record.candidates.length < 1 || record.candidates.length > 16) {
    fail('hsme_foundation_trust_candidate_count_invalid', 'candidate trust requires 1..16 entries');
  }
  const candidates = record.candidates.map((value, index) => normalizeTrustEntry(value, 'candidates[' + index + ']'));
  const ids = candidates.map(value => value.candidateId);
  if (new Set(ids).size !== ids.length) {
    fail('hsme_foundation_trust_candidate_duplicate', 'candidateId must be unique');
  }
  if (state === 'PINNED' && campaignDigest === 'UNKNOWN') {
    fail('hsme_foundation_trust_campaign_digest_missing', 'PINNED trust bundle requires campaignDigest');
  }
  if (state === 'PINNED' && candidates.some(value => !candidateEvidenceComplete(value))) {
    fail('hsme_foundation_trust_candidate_incomplete', 'PINNED trust bundle requires complete artifact/profile/rights evidence');
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_V1_SCHEMA,
    campaignId: identifier(record.campaignId, 'candidateTrust.campaignId', 120),
    campaignDigest,
    state,
    candidates: Object.freeze([...candidates].sort((left, right) => lexical(left.candidateId, right.candidateId))),
    candidateOutputsObserved: false,
    winnerSelectionAllowed: false,
    efficiencyUsedInQualitySelection: false,
    ordinaryCiModelExecutionAllowed: false,
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    billingAuthorityGranted: false,
    projectArtifactMutationAllowed: false,
    aeeExecutionAuthorityGranted: false,
    durableModelFleetPromotionAllowed: false,
    trainingOrDistillationAllowed: false,
  });
}

export function normalizeHsmeFoundationBenchmarkArtifactManifestV1(
  raw: unknown,
): HsmeFoundationBenchmarkArtifactManifestV1 {
  const record = exactRecord(raw, ['schemaVersion', 'candidateId', 'state', 'primarySource', 'artifacts'], 'artifactManifest');
  if (record.schemaVersion !== HSME_FOUNDATION_BENCHMARK_ARTIFACT_MANIFEST_V1_SCHEMA) {
    fail('hsme_foundation_artifact_schema_unsupported', 'unsupported benchmark artifact manifest schema');
  }
  const state = enumValue(record.state, EVIDENCE_STATES, 'artifactManifest.state');
  const primarySource = normalizeSource(record.primarySource, 'artifactManifest.primarySource');
  if (!Array.isArray(record.artifacts) || record.artifacts.length > 4096) {
    fail('hsme_foundation_artifact_count_invalid', 'artifacts must contain 0..4096 entries');
  }
  const artifacts = record.artifacts.map((value, index) => normalizeArtifact(value, 'artifacts[' + index + ']'));
  const logicalIds = artifacts.map(value => value.logicalId);
  const sourcePaths = artifacts.map(value => sourceKey(value.source) + '\0' + value.relativePath);
  if (new Set(logicalIds).size !== logicalIds.length) {
    fail('hsme_foundation_artifact_logical_id_duplicate', 'artifact logicalId must be unique');
  }
  if (new Set(sourcePaths).size !== sourcePaths.length) {
    fail('hsme_foundation_artifact_path_duplicate', 'artifact source+revision+path must be unique');
  }
  for (const artifact of artifacts) {
    if (
      artifact.source.sourceRoot === primarySource.sourceRoot
      && artifact.source.immutableRevision !== primarySource.immutableRevision
    ) {
      fail('hsme_foundation_artifact_primary_revision_mixed', 'primary source artifacts must use one immutable revision');
    }
  }
  if (state === 'PINNED') {
    if (artifacts.length < 1 || !artifacts.some(value => value.runtimeRequired)) {
      fail('hsme_foundation_artifact_pin_incomplete', 'PINNED manifest requires runtime artifacts');
    }
    for (const artifact of artifacts) {
      if (artifact.bytes === 'UNKNOWN' || artifact.contentSha256 === 'UNKNOWN' || artifact.identityMethod === 'UNRESOLVED_XET_OR_STORAGE') {
        fail('hsme_foundation_artifact_pin_incomplete', artifact.logicalId + ' has unresolved content evidence');
      }
      if (artifact.runtimeRequired && artifact.role === 'RUNTIME_CODE') {
        fail('hsme_foundation_remote_code_forbidden', 'model repository runtime code is fail-closed in benchmark trust v1');
      }
    }
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_BENCHMARK_ARTIFACT_MANIFEST_V1_SCHEMA,
    candidateId: identifier(record.candidateId, 'artifactManifest.candidateId', 120),
    state,
    primarySource,
    artifacts: Object.freeze([...artifacts].sort((left, right) => lexical(left.logicalId, right.logicalId))),
  });
}

export function normalizeHsmeFoundationBenchmarkExecutionProfileV1(
  raw: unknown,
): HsmeFoundationBenchmarkExecutionProfileV1 {
  const record = exactRecord(raw, [
    'schemaVersion',
    'candidateId',
    'state',
    'artifactManifestDigest',
    'pipelineClass',
    'toolchainLockSha256',
    'precisionPolicy',
    'schedulerSampler',
    'stepCount',
    'guidancePolicySha256',
    'resolutionAspectPolicySha256',
    'deterministicSeedLatentPolicySha256',
    'imagePreprocessingSha256',
    'referenceOrderingSha256',
    'conditioningComponentsSha256',
    'remoteCodePolicy',
    'hardwareBackendClass',
  ], 'executionProfile');
  if (record.schemaVersion !== HSME_FOUNDATION_BENCHMARK_EXECUTION_PROFILE_V1_SCHEMA) {
    fail('hsme_foundation_execution_schema_unsupported', 'unsupported benchmark execution profile schema');
  }
  const state = enumValue(record.state, EVIDENCE_STATES, 'executionProfile.state');
  const result = Object.freeze({
    schemaVersion: HSME_FOUNDATION_BENCHMARK_EXECUTION_PROFILE_V1_SCHEMA,
    candidateId: identifier(record.candidateId, 'executionProfile.candidateId', 120),
    state,
    artifactManifestDigest: unknownOrSha256(record.artifactManifestDigest, 'executionProfile.artifactManifestDigest'),
    pipelineClass: unknownOrText(record.pipelineClass, 'executionProfile.pipelineClass', 240),
    toolchainLockSha256: unknownOrSha256(record.toolchainLockSha256, 'executionProfile.toolchainLockSha256'),
    precisionPolicy: unknownOrText(record.precisionPolicy, 'executionProfile.precisionPolicy', 160),
    schedulerSampler: unknownOrText(record.schedulerSampler, 'executionProfile.schedulerSampler', 240),
    stepCount: record.stepCount === 'PIN_REQUIRED'
      ? 'PIN_REQUIRED' as const
      : integer(record.stepCount, 'executionProfile.stepCount', 1, 10_000),
    guidancePolicySha256: unknownOrSha256(record.guidancePolicySha256, 'executionProfile.guidancePolicySha256'),
    resolutionAspectPolicySha256: unknownOrSha256(record.resolutionAspectPolicySha256, 'executionProfile.resolutionAspectPolicySha256'),
    deterministicSeedLatentPolicySha256: unknownOrSha256(record.deterministicSeedLatentPolicySha256, 'executionProfile.deterministicSeedLatentPolicySha256'),
    imagePreprocessingSha256: unknownOrSha256(record.imagePreprocessingSha256, 'executionProfile.imagePreprocessingSha256'),
    referenceOrderingSha256: unknownOrSha256(record.referenceOrderingSha256, 'executionProfile.referenceOrderingSha256'),
    conditioningComponentsSha256: unknownOrSha256(record.conditioningComponentsSha256, 'executionProfile.conditioningComponentsSha256'),
    remoteCodePolicy: enumValue(record.remoteCodePolicy, REMOTE_CODE_POLICIES, 'executionProfile.remoteCodePolicy'),
    hardwareBackendClass: unknownOrText(record.hardwareBackendClass, 'executionProfile.hardwareBackendClass', 200),
  });
  if (state === 'PINNED') {
    const values = [
      result.artifactManifestDigest,
      result.pipelineClass,
      result.toolchainLockSha256,
      result.precisionPolicy,
      result.schedulerSampler,
      result.guidancePolicySha256,
      result.resolutionAspectPolicySha256,
      result.deterministicSeedLatentPolicySha256,
      result.imagePreprocessingSha256,
      result.referenceOrderingSha256,
      result.conditioningComponentsSha256,
      result.hardwareBackendClass,
    ];
    if (result.stepCount === 'PIN_REQUIRED' || values.some(value => value === 'UNKNOWN')) {
      fail('hsme_foundation_execution_pin_incomplete', 'PINNED execution profile requires every quality setting and toolchain identity');
    }
  }
  return result;
}

export function normalizeHsmeFoundationBenchmarkRightsReviewV1(
  raw: unknown,
): HsmeFoundationBenchmarkRightsReviewV1 {
  const record = exactRecord(raw, [
    'schemaVersion',
    'candidateId',
    'reviewState',
    'artifactManifestDigest',
    'aggregateLicenseId',
    'dependencyReviews',
    'commercialUseConclusion',
    'reviewPolicySha256',
    'rationaleEvidenceSha256',
  ], 'rightsReview');
  if (record.schemaVersion !== HSME_FOUNDATION_BENCHMARK_RIGHTS_REVIEW_V1_SCHEMA) {
    fail('hsme_foundation_rights_schema_unsupported', 'unsupported benchmark rights review schema');
  }
  const reviewState = enumValue(record.reviewState, RIGHTS_REVIEW_STATES, 'rightsReview.reviewState');
  if (!Array.isArray(record.dependencyReviews) || record.dependencyReviews.length > 4096) {
    fail('hsme_foundation_rights_dependency_count_invalid', 'dependencyReviews must contain 0..4096 entries');
  }
  const dependencyReviews = record.dependencyReviews.map((value, index) =>
    normalizeDependencyReview(value, 'dependencyReviews[' + index + ']'),
  );
  const result = Object.freeze({
    schemaVersion: HSME_FOUNDATION_BENCHMARK_RIGHTS_REVIEW_V1_SCHEMA,
    candidateId: identifier(record.candidateId, 'rightsReview.candidateId', 120),
    reviewState,
    artifactManifestDigest: unknownOrSha256(record.artifactManifestDigest, 'rightsReview.artifactManifestDigest'),
    aggregateLicenseId: unknownOrText(record.aggregateLicenseId, 'rightsReview.aggregateLicenseId', 200),
    dependencyReviews: Object.freeze([...dependencyReviews].sort((left, right) => lexical(dependencyKey(left), dependencyKey(right)))),
    commercialUseConclusion: enumValue(record.commercialUseConclusion, RIGHTS_CONCLUSIONS, 'rightsReview.commercialUseConclusion'),
    reviewPolicySha256: unknownOrSha256(record.reviewPolicySha256, 'rightsReview.reviewPolicySha256'),
    rationaleEvidenceSha256: unknownOrSha256(record.rationaleEvidenceSha256, 'rightsReview.rationaleEvidenceSha256'),
  });
  if (reviewState === 'REVIEW_REQUIRED') {
    if (
      result.artifactManifestDigest !== 'UNKNOWN'
      || result.aggregateLicenseId !== 'UNKNOWN'
      || result.dependencyReviews.length !== 0
      || result.commercialUseConclusion !== 'REVIEW_REQUIRED'
      || result.reviewPolicySha256 !== 'UNKNOWN'
      || result.rationaleEvidenceSha256 !== 'UNKNOWN'
    ) {
      fail('hsme_foundation_rights_pending_claim_invalid', 'REVIEW_REQUIRED rights evidence cannot claim reviewed fields');
    }
  } else if (
    result.artifactManifestDigest === 'UNKNOWN'
    || result.aggregateLicenseId === 'UNKNOWN'
    || result.dependencyReviews.length < 1
    || result.commercialUseConclusion === 'REVIEW_REQUIRED'
    || result.reviewPolicySha256 === 'UNKNOWN'
    || result.rationaleEvidenceSha256 === 'UNKNOWN'
  ) {
    fail('hsme_foundation_rights_review_incomplete', 'REVIEWED rights evidence requires complete bound review');
  }
  return result;
}

export async function hsmeFoundationBenchmarkArtifactManifestDigestV1(
  raw: unknown,
  hashPort: HsmeFoundationBenchmarkHashPortV1,
): Promise<string> {
  const manifest = normalizeHsmeFoundationBenchmarkArtifactManifestV1(raw);
  if (manifest.state !== 'PINNED') {
    fail('hsme_foundation_artifact_digest_unresolved', 'modelContentSha256 cannot be derived from an unpinned artifact manifest');
  }
  return domainDigest('bers:hsme:foundation-benchmark-artifact-manifest:v1', {
    candidateId: manifest.candidateId,
    primarySource: manifest.primarySource,
    artifacts: manifest.artifacts,
  }, hashPort);
}

export async function hsmeFoundationBenchmarkExecutionProfileDigestV1(
  raw: unknown,
  hashPort: HsmeFoundationBenchmarkHashPortV1,
): Promise<string> {
  const profile = normalizeHsmeFoundationBenchmarkExecutionProfileV1(raw);
  if (profile.state !== 'PINNED') {
    fail('hsme_foundation_execution_digest_unresolved', 'executionProfileSha256 cannot be derived from an unpinned profile');
  }
  return domainDigest('bers:hsme:foundation-benchmark-execution-profile:v1', profile, hashPort);
}

export async function hsmeFoundationBenchmarkRightsReviewDigestV1(
  raw: unknown,
  hashPort: HsmeFoundationBenchmarkHashPortV1,
): Promise<string> {
  const review = normalizeHsmeFoundationBenchmarkRightsReviewV1(raw);
  if (review.reviewState !== 'REVIEWED') {
    fail('hsme_foundation_rights_digest_unresolved', 'rightsEvidenceSha256 cannot be derived before rights review');
  }
  return domainDigest('bers:hsme:foundation-benchmark-rights-review:v1', review, hashPort);
}

export async function proveHsmeFoundationBenchmarkCandidateTrustV1(
  rawCampaign: unknown,
  rawTrust: unknown,
  hashPort: HsmeFoundationBenchmarkHashPortV1,
): Promise<HsmeFoundationBenchmarkCandidateTrustEvidenceV1> {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const trust = normalizeHsmeFoundationBenchmarkCandidateTrustV1(rawTrust);
  if (trust.campaignId !== campaign.campaignId) {
    fail('hsme_foundation_trust_campaign_id_mismatch', 'candidate trust campaignId differs from benchmark campaign');
  }
  const campaignDigest = await hsmeFoundationBenchmarkCampaignV1Digest(campaign, hashPort);
  if (trust.campaignDigest !== 'UNKNOWN' && trust.campaignDigest !== campaignDigest) {
    fail('hsme_foundation_trust_campaign_digest_mismatch', 'candidate trust is bound to a different campaign digest');
  }
  if (trust.state === 'PINNED' && trust.campaignDigest !== campaignDigest) {
    fail('hsme_foundation_trust_campaign_digest_missing', 'PINNED trust bundle must bind the exact campaign digest');
  }

  const campaignIds = [...campaign.candidates.map(value => value.candidateId)].sort(lexical);
  const trustIds = [...trust.candidates.map(value => value.candidateId)].sort(lexical);
  if (!sameStrings(campaignIds, trustIds)) {
    fail('hsme_foundation_trust_candidate_set_mismatch', 'trust candidate set must exactly match campaign roster');
  }

  const entries: HsmeFoundationBenchmarkCandidateTrustEvidenceEntryV1[] = [];
  for (const candidate of campaign.candidates) {
    const entry = trust.candidates.find(value => value.candidateId === candidate.candidateId)!;
    assertEntryCandidateIds(entry);
    if (
      entry.artifactManifest.primarySource.sourceRoot !== candidate.sourceRoot
      || entry.artifactManifest.primarySource.immutableRevision !== candidate.immutableRevision
    ) {
      fail('hsme_foundation_trust_source_mismatch', candidate.candidateId + ' artifact source differs from campaign pin');
    }

    let modelContentSha256: string | 'UNKNOWN' = 'UNKNOWN';
    let executionProfileSha256: string | 'UNKNOWN' = 'UNKNOWN';
    let rightsEvidenceSha256: string | 'UNKNOWN' = 'UNKNOWN';
    let benchmarkRunnable = false;

    if (candidateEvidenceComplete(entry)) {
      modelContentSha256 = await hsmeFoundationBenchmarkArtifactManifestDigestV1(entry.artifactManifest, hashPort);
      if (entry.executionProfile.artifactManifestDigest !== modelContentSha256) {
        fail('hsme_foundation_execution_manifest_mismatch', candidate.candidateId + ' execution profile is not bound to modelContentSha256');
      }
      executionProfileSha256 = await hsmeFoundationBenchmarkExecutionProfileDigestV1(entry.executionProfile, hashPort);

      if (entry.rightsReview.artifactManifestDigest !== modelContentSha256) {
        fail('hsme_foundation_rights_manifest_mismatch', candidate.candidateId + ' rights review is not bound to modelContentSha256');
      }
      assertRuntimeRightsCoverage(entry.artifactManifest, entry.rightsReview);
      rightsEvidenceSha256 = await hsmeFoundationBenchmarkRightsReviewDigestV1(entry.rightsReview, hashPort);
      benchmarkRunnable =
        entry.rightsReview.commercialUseConclusion === 'COMMERCIAL_ADMISSIBLE'
        || entry.rightsReview.commercialUseConclusion === 'COMMERCIAL_ADMISSIBLE_WITH_OBLIGATIONS';
    }

    if (trust.state === 'PINNED' && !benchmarkRunnable) {
      fail('hsme_foundation_trust_candidate_not_runnable', candidate.candidateId + ' is not benchmark-runnable under pinned trust evidence');
    }
    entries.push(Object.freeze({
      candidateId: candidate.candidateId,
      modelContentSha256,
      executionProfileSha256,
      rightsEvidenceSha256,
      benchmarkRunnable,
    }));
  }

  return deepFreeze({
    schemaVersion: HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_EVIDENCE_V1_SCHEMA,
    campaignDigest,
    state: trust.state,
    entries: Object.freeze(entries.sort((left, right) => lexical(left.candidateId, right.candidateId))),
    productionAuthorityGranted: false,
    winnerSelectionAllowed: false,
  });
}

function normalizeTrustEntry(raw: unknown, path: string): HsmeFoundationBenchmarkCandidateTrustEntryV1 {
  const record = exactRecord(raw, ['candidateId', 'artifactManifest', 'executionProfile', 'rightsReview'], path);
  const candidateId = identifier(record.candidateId, path + '.candidateId', 120);
  const artifactManifest = normalizeHsmeFoundationBenchmarkArtifactManifestV1(record.artifactManifest);
  const executionProfile = normalizeHsmeFoundationBenchmarkExecutionProfileV1(record.executionProfile);
  const rightsReview = normalizeHsmeFoundationBenchmarkRightsReviewV1(record.rightsReview);
  if (
    artifactManifest.candidateId !== candidateId
    || executionProfile.candidateId !== candidateId
    || rightsReview.candidateId !== candidateId
  ) {
    fail('hsme_foundation_trust_candidate_binding_mismatch', path + ' nested candidate IDs must match');
  }
  return Object.freeze({ candidateId, artifactManifest, executionProfile, rightsReview });
}

function normalizeSource(raw: unknown, path: string): HsmeFoundationBenchmarkArtifactSourceV1 {
  const record = exactRecord(raw, ['sourceRoot', 'immutableRevision'], path);
  return Object.freeze({
    sourceRoot: sourceRoot(record.sourceRoot, path + '.sourceRoot'),
    immutableRevision: immutableRevision(record.immutableRevision, path + '.immutableRevision'),
  });
}

function normalizeArtifact(raw: unknown, path: string): HsmeFoundationBenchmarkArtifactV1 {
  const record = exactRecord(raw, [
    'logicalId',
    'source',
    'relativePath',
    'role',
    'bytes',
    'runtimeRequired',
    'identityMethod',
    'protocolContentSha256Verified',
    'contentSha256',
  ], path);
  const role = enumValue(record.role, ARTIFACT_ROLES, path + '.role');
  const runtimeRequired = booleanValue(record.runtimeRequired, path + '.runtimeRequired');
  const identityMethod = enumValue(record.identityMethod, IDENTITY_METHODS, path + '.identityMethod');
  const protocolContentSha256Verified = booleanValue(record.protocolContentSha256Verified, path + '.protocolContentSha256Verified');
  const contentSha256 = unknownOrSha256(record.contentSha256, path + '.contentSha256');
  const bytes = record.bytes === 'UNKNOWN' ? 'UNKNOWN' as const : integer(record.bytes, path + '.bytes', 1, Number.MAX_SAFE_INTEGER);

  if (role === 'DOCUMENTATION_ONLY' && runtimeRequired) {
    fail('hsme_foundation_artifact_documentation_runtime_invalid', path + ' documentation cannot be runtimeRequired');
  }
  if (identityMethod === 'UNRESOLVED_XET_OR_STORAGE') {
    if (contentSha256 !== 'UNKNOWN' || protocolContentSha256Verified) {
      fail('hsme_foundation_artifact_unresolved_identity_claim', path + ' unresolved storage identity cannot claim file SHA-256');
    }
  } else if (contentSha256 === 'UNKNOWN') {
    if (protocolContentSha256Verified) {
      fail('hsme_foundation_artifact_protocol_hash_without_content', path + ' protocol verification requires contentSha256');
    }
  }
  if (identityMethod === 'GIT_LFS_OID_SHA256_VERIFIED' && (!protocolContentSha256Verified || contentSha256 === 'UNKNOWN')) {
    fail('hsme_foundation_artifact_lfs_identity_unverified', path + ' LFS oid may be used only after protocol content-SHA verification');
  }
  if (identityMethod !== 'GIT_LFS_OID_SHA256_VERIFIED' && protocolContentSha256Verified) {
    fail('hsme_foundation_artifact_protocol_verification_misapplied', path + ' protocolContentSha256Verified is reserved for verified LFS identity');
  }

  return Object.freeze({
    logicalId: identifier(record.logicalId, path + '.logicalId', 180),
    source: normalizeSource(record.source, path + '.source'),
    relativePath: relativePath(record.relativePath, path + '.relativePath'),
    role,
    bytes,
    runtimeRequired,
    identityMethod,
    protocolContentSha256Verified,
    contentSha256,
  });
}

function normalizeDependencyReview(raw: unknown, path: string): HsmeFoundationBenchmarkDependencyRightsV1 {
  const record = exactRecord(raw, [
    'source',
    'artifactLogicalIds',
    'licenseId',
    'licenseEvidenceSha256',
    'obligationsEvidenceSha256',
    'conclusion',
  ], path);
  return Object.freeze({
    source: normalizeSource(record.source, path + '.source'),
    artifactLogicalIds: identifierSet(record.artifactLogicalIds, path + '.artifactLogicalIds', 1, 4096, 180),
    licenseId: text(record.licenseId, path + '.licenseId', 200),
    licenseEvidenceSha256: sha256(record.licenseEvidenceSha256, path + '.licenseEvidenceSha256'),
    obligationsEvidenceSha256: sha256(record.obligationsEvidenceSha256, path + '.obligationsEvidenceSha256'),
    conclusion: enumValue(record.conclusion, DEPENDENCY_CONCLUSIONS, path + '.conclusion'),
  });
}

function candidateEvidenceComplete(entry: HsmeFoundationBenchmarkCandidateTrustEntryV1): boolean {
  return entry.artifactManifest.state === 'PINNED'
    && entry.executionProfile.state === 'PINNED'
    && entry.rightsReview.reviewState === 'REVIEWED';
}

function assertEntryCandidateIds(entry: HsmeFoundationBenchmarkCandidateTrustEntryV1): void {
  if (
    entry.artifactManifest.candidateId !== entry.candidateId
    || entry.executionProfile.candidateId !== entry.candidateId
    || entry.rightsReview.candidateId !== entry.candidateId
  ) {
    fail('hsme_foundation_trust_candidate_binding_mismatch', entry.candidateId + ' nested evidence changed candidate');
  }
}

function assertRuntimeRightsCoverage(
  manifest: HsmeFoundationBenchmarkArtifactManifestV1,
  review: HsmeFoundationBenchmarkRightsReviewV1,
): void {
  const runtime = manifest.artifacts.filter(value => value.runtimeRequired);
  const byId = new Map(runtime.map(value => [value.logicalId, value]));
  const covered = new Set<string>();
  for (const dependency of review.dependencyReviews) {
    if (dependency.conclusion !== 'ADMITTED') {
      fail('hsme_foundation_rights_dependency_not_admitted', manifest.candidateId + ' has a non-admitted runtime dependency');
    }
    for (const logicalId of dependency.artifactLogicalIds) {
      const artifact = byId.get(logicalId);
      if (!artifact) {
        fail('hsme_foundation_rights_artifact_unknown', 'rights review covers non-runtime or unknown artifact ' + logicalId);
      }
      if (!sameSource(artifact.source, dependency.source)) {
        fail('hsme_foundation_rights_source_mismatch', 'rights review source differs for artifact ' + logicalId);
      }
      if (covered.has(logicalId)) {
        fail('hsme_foundation_rights_artifact_duplicate', 'runtime artifact is covered more than once: ' + logicalId);
      }
      covered.add(logicalId);
    }
  }
  if (covered.size !== runtime.length) {
    fail('hsme_foundation_rights_coverage_incomplete', 'every runtime-required artifact must be covered exactly once');
  }
}

async function domainDigest(
  domain: string,
  value: unknown,
  hashPort: HsmeFoundationBenchmarkHashPortV1,
): Promise<string> {
  const canonical = JSON.stringify(canonicalValue(value));
  const digest = await hashPort.sha256(new TextEncoder().encode(domain + '\0' + canonical));
  return sha256(digest, 'hashPort result');
}

function exactRecord(raw: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_foundation_trust_record_invalid', path + ' must be an object');
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) fail('hsme_foundation_trust_field_unknown', path + '.' + key + ' is not allowed');
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) fail('hsme_foundation_trust_field_missing', path + '.' + key + ' is required');
  }
  return record;
}

function sourceRoot(value: unknown, path: string): string {
  const result = text(value, path, 240);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(result)) {
    fail('hsme_foundation_trust_source_invalid', path + ' must be owner/name');
  }
  return result;
}

function immutableRevision(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!IMMUTABLE_REVISION.test(result)) {
    fail('hsme_foundation_trust_revision_invalid', path + ' must be immutable 40/64-hex');
  }
  return result;
}

function relativePath(value: unknown, path: string): string {
  const result = text(value, path, 600);
  if (
    result.startsWith('/')
    || result.includes('\\')
    || result.split('/').some(segment => segment === '' || segment === '.' || segment === '..')
  ) {
    fail('hsme_foundation_artifact_path_invalid', path + ' must be a normalized safe relative path');
  }
  return result;
}

function identifier(value: unknown, path: string, max: number): string {
  const result = text(value, path, max);
  if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) {
    fail('hsme_foundation_trust_identifier_invalid', path + ' is invalid');
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
    fail('hsme_foundation_trust_text_invalid', path + ' is invalid');
  }
  return value;
}

function unknownOrText(value: unknown, path: string, max: number): string | 'UNKNOWN' {
  return value === 'UNKNOWN' ? 'UNKNOWN' : text(value, path, max);
}

function sha256(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!HEX64.test(result)) fail('hsme_foundation_trust_hash_invalid', path + ' must be lowercase SHA-256');
  return result;
}

function unknownOrSha256(value: unknown, path: string): string | 'UNKNOWN' {
  return value === 'UNKNOWN' ? 'UNKNOWN' : sha256(value, path);
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_foundation_trust_integer_invalid', path + ' is invalid');
  }
  return value as number;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('hsme_foundation_trust_boolean_invalid', path + ' must be boolean');
  return value;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail('hsme_foundation_trust_enum_invalid', path + ' is invalid');
  }
  return value as T[number];
}

function identifierSet(
  value: unknown,
  path: string,
  min: number,
  max: number,
  maxLen: number,
): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail('hsme_foundation_trust_array_invalid', path + ' has invalid count');
  }
  const values = value.map((entry, index) => identifier(entry, path + '[' + index + ']', maxLen));
  if (new Set(values).size !== values.length) {
    fail('hsme_foundation_trust_array_duplicate', path + ' must contain unique entries');
  }
  return Object.freeze([...values].sort(lexical));
}

function dependencyKey(review: HsmeFoundationBenchmarkDependencyRightsV1): string {
  return sourceKey(review.source) + '\0' + review.licenseId + '\0' + review.artifactLogicalIds.join('\0');
}

function sourceKey(source: HsmeFoundationBenchmarkArtifactSourceV1): string {
  return source.sourceRoot + '\0' + source.immutableRevision;
}

function sameSource(
  left: HsmeFoundationBenchmarkArtifactSourceV1,
  right: HsmeFoundationBenchmarkArtifactSourceV1,
): boolean {
  return sourceKey(left) === sourceKey(right);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort(lexical).map(key => [key, canonicalValue(record[key])]));
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
  throw new HsmeFoundationBenchmarkCandidateTrustV1Error(code, message);
}
