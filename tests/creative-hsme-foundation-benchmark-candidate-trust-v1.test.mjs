import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  HSME_FOUNDATION_BENCHMARK_ARTIFACT_MANIFEST_V1_SCHEMA,
  HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_V1_SCHEMA,
  HSME_FOUNDATION_BENCHMARK_EXECUTION_PROFILE_V1_SCHEMA,
  HSME_FOUNDATION_BENCHMARK_RIGHTS_REVIEW_V1_SCHEMA,
  hsmeFoundationBenchmarkArtifactManifestDigestV1,
  hsmeFoundationBenchmarkExecutionProfileDigestV1,
  hsmeFoundationBenchmarkRightsReviewDigestV1,
  normalizeHsmeFoundationBenchmarkCandidateTrustV1,
  proveHsmeFoundationBenchmarkCandidateTrustV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCandidateTrustV1.ts';
import {
  hsmeFoundationBenchmarkCampaignV1Digest,
  hsmeFoundationBenchmarkCandidateMayRunV1,
  mayFinalizeHsmeFoundationBenchmarkCampaignV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';

const campaign = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  'utf8',
));
const committedTrust = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json',
  'utf8',
));
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };
const H = c => c.repeat(64);
const clone = value => structuredClone(value);

function expectCodeAsync(fn, code) {
  return assert.rejects(fn, error => error?.code === code, 'expected ' + code);
}
function entry(raw, id) {
  return raw.candidates.find(value => value.candidateId === id);
}
function sourceFor(candidate) {
  return { sourceRoot: candidate.sourceRoot, immutableRevision: candidate.immutableRevision };
}

async function makeSyntheticPinnedPair() {
  const campaignRaw = clone(campaign);
  const trustRaw = clone(committedTrust);
  trustRaw.state = 'PINNED';

  for (let index = 0; index < campaignRaw.candidates.length; index += 1) {
    const candidate = campaignRaw.candidates[index];
    const trust = entry(trustRaw, candidate.candidateId);
    const source = sourceFor(candidate);
    trust.artifactManifest = {
      schemaVersion: HSME_FOUNDATION_BENCHMARK_ARTIFACT_MANIFEST_V1_SCHEMA,
      candidateId: candidate.candidateId,
      state: 'PINNED',
      primarySource: source,
      artifacts: [
        {
          logicalId: 'config',
          source,
          relativePath: 'config.json',
          role: 'METADATA_CONFIG',
          bytes: 100 + index,
          runtimeRequired: true,
          identityMethod: 'CONTENT_SHA256',
          protocolContentSha256Verified: false,
          contentSha256: H(((index % 8) + 1).toString()),
        },
        {
          logicalId: 'weights',
          source,
          relativePath: 'model/weights.safetensors',
          role: 'DENOISER_TRANSFORMER_UNET',
          bytes: 1000 + index,
          runtimeRequired: true,
          identityMethod: 'STREAMED_LOCAL_SHA256',
          protocolContentSha256Verified: false,
          contentSha256: H((((index + 1) % 8) + 1).toString()),
        },
        {
          logicalId: 'readme',
          source,
          relativePath: 'README.md',
          role: 'DOCUMENTATION_ONLY',
          bytes: 20 + index,
          runtimeRequired: false,
          identityMethod: 'CONTENT_SHA256',
          protocolContentSha256Verified: false,
          contentSha256: H((((index + 2) % 8) + 1).toString()),
        },
      ],
    };
    const manifestDigest = await hsmeFoundationBenchmarkArtifactManifestDigestV1(
      trust.artifactManifest,
      hashPort,
    );
    trust.executionProfile = {
      schemaVersion: HSME_FOUNDATION_BENCHMARK_EXECUTION_PROFILE_V1_SCHEMA,
      candidateId: candidate.candidateId,
      state: 'PINNED',
      artifactManifestDigest: manifestDigest,
      pipelineClass: 'PinnedFoundationPipeline',
      toolchainLockSha256: H('a'),
      precisionPolicy: 'quality-baseline',
      schedulerSampler: 'candidate-recommended-pinned',
      stepCount: 28 + index,
      guidancePolicySha256: H('b'),
      resolutionAspectPolicySha256: H('c'),
      deterministicSeedLatentPolicySha256: H('d'),
      imagePreprocessingSha256: H('e'),
      referenceOrderingSha256: H('f'),
      conditioningComponentsSha256: H('9'),
      remoteCodePolicy: 'NO_MODEL_REPOSITORY_RUNTIME_CODE',
      hardwareBackendClass: 'dedicated-evidence-gpu-class',
    };
    trust.rightsReview = {
      schemaVersion: HSME_FOUNDATION_BENCHMARK_RIGHTS_REVIEW_V1_SCHEMA,
      candidateId: candidate.candidateId,
      reviewState: 'REVIEWED',
      artifactManifestDigest: manifestDigest,
      aggregateLicenseId: candidate.candidateId === 'tiny-sd-control-v1'
        ? 'OPENRAIL-REVIEWED'
        : 'LICENSE-REVIEWED',
      dependencyReviews: [{
        source,
        artifactLogicalIds: ['config', 'weights'],
        licenseId: candidate.candidateId === 'tiny-sd-control-v1'
          ? 'OPENRAIL-REVIEWED'
          : 'LICENSE-REVIEWED',
        licenseEvidenceSha256: H('7'),
        obligationsEvidenceSha256: H('8'),
        conclusion: 'ADMITTED',
      }],
      commercialUseConclusion: candidate.candidateId === 'tiny-sd-control-v1'
        ? 'COMMERCIAL_ADMISSIBLE_WITH_OBLIGATIONS'
        : 'COMMERCIAL_ADMISSIBLE',
      reviewPolicySha256: H('6'),
      rationaleEvidenceSha256: H('5'),
    };

    candidate.modelContentSha256 = manifestDigest;
    candidate.executionProfileSha256 = await hsmeFoundationBenchmarkExecutionProfileDigestV1(
      trust.executionProfile,
      hashPort,
    );
    candidate.rightsEvidenceSha256 = await hsmeFoundationBenchmarkRightsReviewDigestV1(
      trust.rightsReview,
      hashPort,
    );
    candidate.rightsState = trust.rightsReview.commercialUseConclusion ===
      'COMMERCIAL_ADMISSIBLE_WITH_OBLIGATIONS'
      ? 'REVIEWED_WITH_OBLIGATIONS'
      : 'REVIEWED_COMMERCIAL';
  }

  trustRaw.campaignDigest = await hsmeFoundationBenchmarkCampaignV1Digest(campaignRaw, hashPort);
  return { campaignRaw, trustRaw };
}

test('committed trust pack is PINNED, campaign-bound and benchmark-runnable only', async () => {
  const trust = normalizeHsmeFoundationBenchmarkCandidateTrustV1(committedTrust);
  assert.equal(trust.schemaVersion, HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_V1_SCHEMA);
  assert.equal(trust.state, 'PINNED');
  assert.equal(trust.candidates.length, 6);
  assert.match(trust.campaignDigest, /^[0-9a-f]{64}$/);
  assert.ok(trust.candidates.every(value => value.artifactManifest.state === 'PINNED'));
  assert.ok(trust.candidates.every(value => value.artifactManifest.artifacts.length > 0));
  assert.ok(trust.candidates.every(value => value.executionProfile.state === 'PINNED'));
  assert.ok(trust.candidates.every(value => value.rightsReview.reviewState === 'REVIEWED'));

  const evidence = await proveHsmeFoundationBenchmarkCandidateTrustV1(
    campaign,
    trust,
    hashPort,
  );
  assert.equal(evidence.state, 'PINNED');
  assert.equal(evidence.entries.length, 6);
  assert.ok(evidence.entries.every(value => value.benchmarkRunnable === true));
  assert.ok(campaign.candidates.every(value =>
    hsmeFoundationBenchmarkCandidateMayRunV1(campaign, value.candidateId)
  ));
  assert.equal(mayFinalizeHsmeFoundationBenchmarkCampaignV1(campaign), true);
  assert.equal(trust.candidateOutputsObserved, false);
  assert.equal(trust.ordinaryCiModelExecutionAllowed, false);
  assert.equal(trust.providerAuthorityGranted, false);
  assert.equal(trust.billingAuthorityGranted, false);
  assert.equal(trust.projectArtifactMutationAllowed, false);
  assert.equal(trust.aeeExecutionAuthorityGranted, false);
  assert.equal(trust.durableModelFleetPromotionAllowed, false);
  assert.equal(trust.trainingOrDistillationAllowed, false);
  assert.equal(evidence.productionAuthorityGranted, false);
  assert.equal(evidence.winnerSelectionAllowed, false);
});

test('trust roster must exactly match the immutable campaign roster', async () => {
  const missing = clone(committedTrust);
  missing.candidates.pop();
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, missing, hashPort),
    'hsme_foundation_trust_candidate_set_mismatch',
  );

  const injected = clone(committedTrust);
  const extra = clone(injected.candidates[0]);
  extra.candidateId = 'extra-candidate';
  extra.artifactManifest.candidateId = 'extra-candidate';
  extra.executionProfile.candidateId = 'extra-candidate';
  extra.rightsReview.candidateId = 'extra-candidate';
  injected.candidates.push(extra);
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, injected, hashPort),
    'hsme_foundation_trust_candidate_set_mismatch',
  );
});

test('source root and immutable revision are bound to the accepted campaign', async () => {
  const changedCampaign = clone(campaign);
  const candidate = changedCampaign.candidates.find(value =>
    value.candidateId === 'flux2-klein-base-4b-v1'
  );
  candidate.immutableRevision = '1'.repeat(40);
  const changedTrust = clone(committedTrust);
  changedTrust.campaignDigest = await hsmeFoundationBenchmarkCampaignV1Digest(
    changedCampaign,
    hashPort,
  );
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(changedCampaign, changedTrust, hashPort),
    'hsme_foundation_trust_source_mismatch',
  );
});

test('unresolved Xet/storage identity can never masquerade as file SHA-256', () => {
  const changed = clone(committedTrust);
  const item = entry(changed, 'qwen-image-t2i-reference-v1');
  const artifact = item.artifactManifest.artifacts.find(value => value.runtimeRequired);
  artifact.bytes = 'UNKNOWN';
  artifact.identityMethod = 'UNRESOLVED_XET_OR_STORAGE';
  artifact.protocolContentSha256Verified = false;
  artifact.contentSha256 = H('a');
  assert.throws(
    () => normalizeHsmeFoundationBenchmarkCandidateTrustV1(changed),
    error => error?.code === 'hsme_foundation_artifact_unresolved_identity_claim',
  );
});

test('Git LFS oid can be treated as file SHA-256 only after protocol verification', () => {
  const changed = clone(committedTrust);
  const item = entry(changed, 'tiny-sd-control-v1');
  const artifact = item.artifactManifest.artifacts.find(value => value.runtimeRequired);
  artifact.identityMethod = 'GIT_LFS_OID_SHA256_VERIFIED';
  artifact.protocolContentSha256Verified = false;
  assert.throws(
    () => normalizeHsmeFoundationBenchmarkCandidateTrustV1(changed),
    error => error?.code === 'hsme_foundation_artifact_lfs_identity_unverified',
  );
});

test('modelContentSha256 is the domain-separated normalized artifact manifest digest', async () => {
  const item = entry(committedTrust, 'flux2-klein-4b-distilled-v1');
  const baseline = await hsmeFoundationBenchmarkArtifactManifestDigestV1(
    item.artifactManifest,
    hashPort,
  );
  const changed = clone(item.artifactManifest);
  changed.artifacts[0].contentSha256 = H('f');
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkArtifactManifestDigestV1(changed, hashPort),
  );
});

test('execution profile digest changes on quality setting or toolchain changes', async () => {
  const profile = entry(committedTrust, 'flux2-klein-base-4b-v1').executionProfile;
  const baseline = await hsmeFoundationBenchmarkExecutionProfileDigestV1(profile, hashPort);

  const quality = clone(profile);
  quality.stepCount += 1;
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkExecutionProfileDigestV1(quality, hashPort),
  );

  const toolchain = clone(profile);
  toolchain.toolchainLockSha256 = H('1');
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkExecutionProfileDigestV1(toolchain, hashPort),
  );
});

test('rights review is bound to the same artifact manifest and covers runtime artifacts exactly once', async () => {
  const { campaignRaw, trustRaw } = await makeSyntheticPinnedPair();
  const item = entry(trustRaw, 'qwen-image-edit-2511-reference-v1');
  item.rightsReview.artifactManifestDigest = H('4');
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaignRaw, trustRaw, hashPort),
    'hsme_foundation_rights_manifest_mismatch',
  );

  const pair = await makeSyntheticPinnedPair();
  const missing = entry(pair.trustRaw, 'qwen-image-edit-2511-reference-v1');
  missing.rightsReview.dependencyReviews[0].artifactLogicalIds = ['config'];
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(
      pair.campaignRaw,
      pair.trustRaw,
      hashPort,
    ),
    'hsme_foundation_rights_coverage_incomplete',
  );
});

test('review digest changes when obligations or license evidence changes', async () => {
  const review = entry(committedTrust, 'tiny-sd-control-v1').rightsReview;
  const baseline = await hsmeFoundationBenchmarkRightsReviewDigestV1(review, hashPort);
  const changed = clone(review);
  changed.dependencyReviews[0].obligationsEvidenceSha256 = H('2');
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkRightsReviewDigestV1(changed, hashPort),
  );
});

test('runtime repository code remains fail closed', async () => {
  const { campaignRaw, trustRaw } = await makeSyntheticPinnedPair();
  const item = entry(trustRaw, 'sana-sprint-0.6b-split-v1');
  item.artifactManifest.artifacts[1].role = 'RUNTIME_CODE';
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaignRaw, trustRaw, hashPort),
    'hsme_foundation_remote_code_forbidden',
  );
});

test('PINNED bundle requires exact campaign digest and every candidate complete', async () => {
  const badDigest = clone(committedTrust);
  badDigest.campaignDigest = H('3');
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, badDigest, hashPort),
    'hsme_foundation_trust_campaign_digest_mismatch',
  );

  const incomplete = clone(committedTrust);
  const item = entry(incomplete, 'qwen-image-t2i-reference-v1');
  item.executionProfile.state = 'EVIDENCE_PENDING';
  item.executionProfile.artifactManifestDigest = 'UNKNOWN';
  item.executionProfile.pipelineClass = 'UNKNOWN';
  item.executionProfile.toolchainLockSha256 = 'UNKNOWN';
  item.executionProfile.precisionPolicy = 'UNKNOWN';
  item.executionProfile.schedulerSampler = 'UNKNOWN';
  item.executionProfile.stepCount = 'PIN_REQUIRED';
  item.executionProfile.guidancePolicySha256 = 'UNKNOWN';
  item.executionProfile.resolutionAspectPolicySha256 = 'UNKNOWN';
  item.executionProfile.deterministicSeedLatentPolicySha256 = 'UNKNOWN';
  item.executionProfile.imagePreprocessingSha256 = 'UNKNOWN';
  item.executionProfile.referenceOrderingSha256 = 'UNKNOWN';
  item.executionProfile.conditioningComponentsSha256 = 'UNKNOWN';
  item.executionProfile.hardwareBackendClass = 'UNKNOWN';
  assert.throws(
    () => normalizeHsmeFoundationBenchmarkCandidateTrustV1(incomplete),
    error => error?.code === 'hsme_foundation_trust_candidate_incomplete',
  );
});

test('fully pinned synthetic evidence makes all six benchmark-runnable without production or winner authority', async () => {
  const { campaignRaw, trustRaw } = await makeSyntheticPinnedPair();
  const evidence = await proveHsmeFoundationBenchmarkCandidateTrustV1(
    campaignRaw,
    trustRaw,
    hashPort,
  );
  assert.equal(evidence.state, 'PINNED');
  assert.equal(evidence.entries.length, 6);
  assert.ok(evidence.entries.every(value => value.benchmarkRunnable));
  assert.equal(evidence.productionAuthorityGranted, false);
  assert.equal(evidence.winnerSelectionAllowed, false);
});

test('reviewed rejection is evidence but cannot make a PINNED candidate runnable', async () => {
  const { campaignRaw, trustRaw } = await makeSyntheticPinnedPair();
  entry(trustRaw, 'sana-sprint-0.6b-split-v1').rightsReview.commercialUseConclusion = 'REJECTED';
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaignRaw, trustRaw, hashPort),
    'hsme_foundation_trust_candidate_not_runnable',
  );
});

test('caller cannot inject winner, efficiency or production authority', () => {
  for (const field of [
    'winnerSelectionAllowed',
    'efficiencyUsedInQualitySelection',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'trainingOrDistillationAllowed',
  ]) {
    const changed = clone(committedTrust);
    changed[field] = true;
    assert.throws(
      () => normalizeHsmeFoundationBenchmarkCandidateTrustV1(changed),
      error => error?.code === 'hsme_foundation_trust_authority_invalid',
    );
  }
  const unknown = clone(committedTrust);
  unknown.workingMemoryBytes = 1;
  assert.throws(
    () => normalizeHsmeFoundationBenchmarkCandidateTrustV1(unknown),
    error => error?.code === 'hsme_foundation_trust_field_unknown',
  );
});
