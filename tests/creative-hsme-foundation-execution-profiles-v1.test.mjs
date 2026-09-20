import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  hsmeFoundationBenchmarkExecutionProfileDigestV1,
  normalizeHsmeFoundationBenchmarkCandidateTrustV1,
  normalizeHsmeFoundationBenchmarkExecutionProfileV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCandidateTrustV1.ts';
import {
  hsmeFoundationBenchmarkCandidateMayRunV1,
  normalizeHsmeFoundationBenchmarkCampaignV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';

const profileSet = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-execution-profiles.v1.json',
  'utf8',
));
const campaignRaw = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  'utf8',
));
const trustRaw = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json',
  'utf8',
));
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

function lexical(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(lexical).map(key => [key, canonicalValue(value[key])]));
  }
  return value;
}
function domainHash(domain, value) {
  return createHash('sha256')
    .update(domain + '\0' + JSON.stringify(canonicalValue(value)))
    .digest('hex');
}
function without(object, key) {
  return Object.fromEntries(Object.entries(object).filter(([name]) => name !== key));
}
function profile(id) {
  return profileSet.profiles.find(value => value.candidateId === id);
}
function candidate(id) {
  return campaignRaw.candidates.find(value => value.candidateId === id);
}

test('profile set freezes exactly six quality-first profiles before outputs', () => {
  assert.equal(profileSet.schemaVersion, 'BERS_HSME_FOUNDATION_BENCHMARK_EXECUTION_PROFILE_SET_V1');
  assert.equal(profileSet.qualityPolicy, 'QUALITY_FLOOR_BEFORE_EFFICIENCY');
  assert.equal(profileSet.candidateOutputsObserved, false);
  assert.equal(profileSet.efficiencyUsedInQualitySelection, false);
  assert.equal(profileSet.profiles.length, 6);
  assert.equal(new Set(profileSet.profiles.map(value => value.candidateId)).size, 6);
  assert.equal(profileSet.productionAuthorityGranted, false);
  assert.equal(profileSet.winnerSelectionAllowed, false);
  assert.equal(profileSet.trainingOrDistillationAllowed, false);
});

test('runtime locks are content-addressed and exact-version only', () => {
  for (const lock of Object.values(profileSet.runtimeLocks)) {
    assert.equal(
      lock.lockSha256,
      domainHash('bers:hsme:foundation-runtime-lock:v1', without(lock, 'lockSha256')),
    );
    assert.match(lock.python, /^3\.(?:11|12)$/);
    assert.ok(Object.keys(lock.packages).length >= 6);
    for (const version of Object.values(lock.packages)) {
      assert.equal(typeof version, 'string');
      assert.ok(version.length > 0);
      assert.equal(version.includes('*'), false);
      assert.equal(version.includes('latest'), false);
    }
  }
});

test('every readable policy object matches the digest embedded in its normalized profile', () => {
  const policyFields = [
    ['guidance', 'guidancePolicySha256'],
    ['resolutionAspect', 'resolutionAspectPolicySha256'],
    ['deterministicSeedLatent', 'deterministicSeedLatentPolicySha256'],
    ['imagePreprocessing', 'imagePreprocessingSha256'],
    ['referenceOrdering', 'referenceOrderingSha256'],
    ['conditioningComponents', 'conditioningComponentsSha256'],
  ];
  for (const item of profileSet.profiles) {
    const normalized = normalizeHsmeFoundationBenchmarkExecutionProfileV1(item.executionProfile);
    assert.equal(normalized.state, 'PINNED');
    assert.equal(normalized.remoteCodePolicy, 'NO_MODEL_REPOSITORY_RUNTIME_CODE');
    assert.equal(
      normalized.toolchainLockSha256,
      profileSet.runtimeLocks[item.runtimeLockId].lockSha256,
    );
    for (const [sourceKey, digestKey] of policyFields) {
      assert.equal(
        normalized[digestKey],
        domainHash('bers:hsme:foundation-execution-' + sourceKey + ':v1', item.sourceSpec[sourceKey]),
        item.candidateId + ':' + sourceKey,
      );
    }
  }
});

test('executionProfileSha256 is the accepted normalized profile digest and binds modelContentSha256', async () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(campaignRaw);
  for (const item of profileSet.profiles) {
    const campaignCandidate = campaign.candidates.find(value => value.candidateId === item.candidateId);
    assert.ok(campaignCandidate);
    assert.equal(item.executionProfile.artifactManifestDigest, campaignCandidate.modelContentSha256);
    assert.equal(
      item.executionProfileSha256,
      await hsmeFoundationBenchmarkExecutionProfileDigestV1(item.executionProfile, hashPort),
    );
    assert.equal(campaignCandidate.executionProfileSha256, item.executionProfileSha256);
  }
});

test('trust pack carries the same six PINNED execution profiles with complete artifact and rights evidence', () => {
  const trust = normalizeHsmeFoundationBenchmarkCandidateTrustV1(trustRaw);
  assert.equal(trust.state, 'PINNED');
  assert.match(trust.campaignDigest, /^[0-9a-f]{64}$/);
  for (const item of profileSet.profiles) {
    const trustCandidate = trust.candidates.find(value => value.candidateId === item.candidateId);
    assert.ok(trustCandidate);
    assert.deepEqual(trustCandidate.executionProfile, item.executionProfile);
    assert.equal(trustCandidate.artifactManifest.state, 'PINNED');
    assert.ok(trustCandidate.artifactManifest.artifacts.length > 0);
    assert.equal(trustCandidate.rightsReview.reviewState, 'REVIEWED');
  }
});

test('quality baselines keep distilled/Base and T2I/Edit semantics distinct', () => {
  const tiny = profile('tiny-sd-control-v1');
  assert.equal(tiny.sourceSpec.stepCount, 12);
  assert.equal(tiny.sourceSpec.guidance.guidanceScale, 7.5);
  assert.equal(tiny.sourceSpec.resolutionAspect.textToImage.width, 512);

  const sana = profile('sana-sprint-0.6b-split-v1');
  assert.equal(sana.sourceSpec.stepCount, 4);
  assert.equal(sana.sourceSpec.guidance.guidanceScale, 4.5);
  assert.equal(sana.sourceSpec.resolutionAspect.textToImage.width, 1024);
  assert.equal(sana.sourceSpec.conditioningComponents.replacementAllowed, false);

  const distilled = profile('flux2-klein-4b-distilled-v1');
  const base = profile('flux2-klein-base-4b-v1');
  assert.equal(distilled.sourceSpec.stepCount, 4);
  assert.equal(distilled.sourceSpec.guidance.guidanceScale, 1.0);
  assert.equal(base.sourceSpec.stepCount, 50);
  assert.equal(base.sourceSpec.guidance.guidanceScale, 4.0);
  assert.notEqual(distilled.executionProfileSha256, base.executionProfileSha256);

  const qwenT2i = profile('qwen-image-t2i-reference-v1');
  assert.equal(qwenT2i.sourceSpec.stepCount, 50);
  assert.equal(qwenT2i.sourceSpec.guidance.trueCfgScale, 4.0);
  assert.equal(qwenT2i.sourceSpec.resolutionAspect.textToImage.defaultWidth, 1328);

  const qwenEdit = profile('qwen-image-edit-2511-reference-v1');
  assert.equal(qwenEdit.sourceSpec.stepCount, 40);
  assert.equal(qwenEdit.sourceSpec.guidance.trueCfgScale, 4.0);
  assert.equal(qwenEdit.sourceSpec.referenceOrdering.sortingAllowed, false);
  assert.equal(qwenEdit.sourceSpec.referenceOrdering.primaryReferenceIndex, 0);
});

test('profile mutation changes digest before any output can be admitted', async () => {
  const original = profile('flux2-klein-base-4b-v1').executionProfile;
  const changedSteps = structuredClone(original);
  changedSteps.stepCount = 49;
  assert.notEqual(
    await hsmeFoundationBenchmarkExecutionProfileDigestV1(original, hashPort),
    await hsmeFoundationBenchmarkExecutionProfileDigestV1(changedSteps, hashPort),
  );
  const changedBackend = structuredClone(original);
  changedBackend.hardwareBackendClass = 'DIFFERENT_REFERENCE_BACKEND';
  assert.notEqual(
    await hsmeFoundationBenchmarkExecutionProfileDigestV1(original, hashPort),
    await hsmeFoundationBenchmarkExecutionProfileDigestV1(changedBackend, hashPort),
  );
});

test('pinned bytes, profiles, fixtures and reviewed rights open only the benchmark run gate', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(campaignRaw);
  assert.equal(campaign.status, 'FIXTURES_PINNED');
  assert.equal(campaign.fixturePack.state, 'PINNED');
  for (const item of campaign.candidates) {
    assert.match(item.modelContentSha256, /^[0-9a-f]{64}$/);
    assert.match(item.executionProfileSha256, /^[0-9a-f]{64}$/);
    assert.match(item.rightsEvidenceSha256, /^[0-9a-f]{64}$/);
    assert.notEqual(item.rightsState, 'REVIEW_REQUIRED');
    assert.equal(hsmeFoundationBenchmarkCandidateMayRunV1(campaign, item.candidateId), true);
  }
});

test('no efficiency or production authority is encoded in source specs', () => {
  const serialized = JSON.stringify(profileSet);
  for (const forbidden of [
    'installedBytes',
    'workingMemoryBytes',
    'latencyMs',
    'costMicrousd',
    'qualityPerInstalledByte',
    'selectedCandidateId',
  ]) assert.equal(serialized.includes(forbidden), false, forbidden);
  for (const item of profileSet.profiles) {
    assert.equal(item.executionProfile.remoteCodePolicy, 'NO_MODEL_REPOSITORY_RUNTIME_CODE');
  }
});
