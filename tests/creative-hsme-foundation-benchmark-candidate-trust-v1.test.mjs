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

async function makePinnedBundle() {
  const raw = clone(committedTrust);
  raw.campaignDigest = await hsmeFoundationBenchmarkCampaignV1Digest(campaign, hashPort);
  raw.state = 'PINNED';
  for (let index = 0; index < campaign.candidates.length; index += 1) {
    const candidate = campaign.candidates[index];
    const trust = entry(raw, candidate.candidateId);
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
          identityMethod: 'GIT_LFS_OID_SHA256_VERIFIED',
          protocolContentSha256Verified: true,
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
      aggregateLicenseId: candidate.candidateId === 'tiny-sd-control-v1' ? 'OPENRAIL-REVIEWED' : 'LICENSE-REVIEWED',
      dependencyReviews: [
        {
          source,
          artifactLogicalIds: ['config', 'weights'],
          licenseId: candidate.candidateId === 'tiny-sd-control-v1' ? 'OPENRAIL-REVIEWED' : 'LICENSE-REVIEWED',
          licenseEvidenceSha256: H('7'),
          obligationsEvidenceSha256: H('8'),
          conclusion: 'ADMITTED',
        },
      ],
      commercialUseConclusion: candidate.candidateId === 'tiny-sd-control-v1'
        ? 'COMMERCIAL_ADMISSIBLE_WITH_OBLIGATIONS'
        : 'COMMERCIAL_ADMISSIBLE',
      reviewPolicySha256: H('6'),
      rationaleEvidenceSha256: H('5'),
    };
  }
  return raw;
}

test('committed trust pack matches all six campaign candidates and remains fail closed', async () => {
  const trust = normalizeHsmeFoundationBenchmarkCandidateTrustV1(committedTrust);
  assert.equal(trust.schemaVersion, HSME_FOUNDATION_BENCHMARK_CANDIDATE_TRUST_V1_SCHEMA);
  assert.equal(trust.state, 'EVIDENCE_PENDING');
  assert.equal(trust.candidates.length, 6);
  assert.equal(trust.campaignDigest, 'UNKNOWN');
  assert.ok(trust.candidates.every(value => value.artifactManifest.artifacts.length === 0));
  assert.ok(trust.candidates.every(value => value.executionProfile.state === 'PINNED'));
  assert.ok(trust.candidates.every(value => value.executionProfile.artifactManifestDigest !== 'UNKNOWN'));
  const evidence = await proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, trust, hashPort);
  assert.ok(evidence.entries.every(value => value.benchmarkRunnable === false));
  assert.ok(evidence.entries.every(value => value.modelContentSha256 === 'UNKNOWN'));
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
  const changed = clone(committedTrust);
  entry(changed, 'flux2-klein-base-4b-v1').artifactManifest.primarySource.immutableRevision =
    '1111111111111111111111111111111111111111';
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, changed, hashPort),
    'hsme_foundation_trust_source_mismatch',
  );
});

test('unresolved Xet/storage identity can never masquerade as file SHA-256', () => {
  const changed = clone(committedTrust);
  const item = entry(changed, 'qwen-image-t2i-reference-v1');
  item.artifactManifest.artifacts.push({
    logicalId: 'xet-weight',
    source: item.artifactManifest.primarySource,
    relativePath: 'transformer/model.safetensors',
    role: 'DENOISER_TRANSFORMER_UNET',
    bytes: 'UNKNOWN',
    runtimeRequired: true,
    identityMethod: 'UNRESOLVED_XET_OR_STORAGE',
    protocolContentSha256Verified: false,
    contentSha256: H('a'),
  });
  assert.throws(
    () => normalizeHsmeFoundationBenchmarkCandidateTrustV1(changed),
    error => error?.code === 'hsme_foundation_artifact_unresolved_identity_claim',
  );
});

test('Git LFS oid can be treated as file SHA-256 only after protocol verification', () => {
  const changed = clone(committedTrust);
  const item = entry(changed, 'tiny-sd-control-v1');
  item.artifactManifest.artifacts.push({
    logicalId: 'lfs-weight',
    source: item.artifactManifest.primarySource,
    relativePath: 'model.safetensors',
    role: 'DENOISER_TRANSFORMER_UNET',
    bytes: 100,
    runtimeRequired: true,
    identityMethod: 'GIT_LFS_OID_SHA256_VERIFIED',
    protocolContentSha256Verified: false,
    contentSha256: H('a'),
  });
  assert.throws(
    () => normalizeHsmeFoundationBenchmarkCandidateTrustV1(changed),
    error => error?.code === 'hsme_foundation_artifact_lfs_identity_unverified',
  );
});

test('modelContentSha256 is the domain-separated normalized artifact manifest digest', async () => {
  const raw = await makePinnedBundle();
  const item = entry(raw, 'flux2-klein-4b-distilled-v1');
  const baseline = await hsmeFoundationBenchmarkArtifactManifestDigestV1(item.artifactManifest, hashPort);
  const changed = clone(item.artifactManifest);
  changed.artifacts[0].contentSha256 = H('f');
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkArtifactManifestDigestV1(changed, hashPort),
  );
});

test('execution profile digest changes on quality setting or toolchain changes', async () => {
  const raw = await makePinnedBundle();
  const profile = entry(raw, 'flux2-klein-base-4b-v1').executionProfile;
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
  const raw = await makePinnedBundle();
  const item = entry(raw, 'qwen-image-edit-2511-reference-v1');
  item.rightsReview.artifactManifestDigest = H('4');
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, raw, hashPort),
    'hsme_foundation_rights_manifest_mismatch',
  );

  const missing = await makePinnedBundle();
  entry(missing, 'qwen-image-edit-2511-reference-v1').rightsReview.dependencyReviews[0].artifactLogicalIds = ['config'];
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, missing, hashPort),
    'hsme_foundation_rights_coverage_incomplete',
  );
});

test('review digest changes when obligations or license evidence changes', async () => {
  const raw = await makePinnedBundle();
  const review = entry(raw, 'tiny-sd-control-v1').rightsReview;
  const baseline = await hsmeFoundationBenchmarkRightsReviewDigestV1(review, hashPort);
  const changed = clone(review);
  changed.dependencyReviews[0].obligationsEvidenceSha256 = H('2');
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkRightsReviewDigestV1(changed, hashPort),
  );
});

test('runtime repository code remains fail closed', async () => {
  const raw = await makePinnedBundle();
  const item = entry(raw, 'sana-sprint-0.6b-split-v1');
  item.artifactManifest.artifacts[1].role = 'RUNTIME_CODE';
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, raw, hashPort),
    'hsme_foundation_remote_code_forbidden',
  );
});

test('PINNED bundle requires exact campaign digest and every candidate complete', async () => {
  const raw = await makePinnedBundle();
  raw.campaignDigest = H('3');
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, raw, hashPort),
    'hsme_foundation_trust_campaign_digest_mismatch',
  );

  const incomplete = await makePinnedBundle();
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
  const raw = await makePinnedBundle();
  const evidence = await proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, raw, hashPort);
  assert.equal(evidence.state, 'PINNED');
  assert.equal(evidence.entries.length, 6);
  assert.ok(evidence.entries.every(value => value.benchmarkRunnable));
  assert.ok(evidence.entries.every(value => value.modelContentSha256 !== 'UNKNOWN'));
  assert.ok(evidence.entries.every(value => value.executionProfileSha256 !== 'UNKNOWN'));
  assert.ok(evidence.entries.every(value => value.rightsEvidenceSha256 !== 'UNKNOWN'));
  assert.equal(evidence.productionAuthorityGranted, false);
  assert.equal(evidence.winnerSelectionAllowed, false);
});

test('reviewed rejection is evidence but cannot make a PINNED candidate runnable', async () => {
  const raw = await makePinnedBundle();
  entry(raw, 'sana-sprint-0.6b-split-v1').rightsReview.commercialUseConclusion = 'REJECTED';
  await expectCodeAsync(
    () => proveHsmeFoundationBenchmarkCandidateTrustV1(campaign, raw, hashPort),
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
