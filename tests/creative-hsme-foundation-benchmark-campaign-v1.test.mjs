import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  HSME_FOUNDATION_BENCHMARK_CAMPAIGN_V1_SCHEMA,
  hsmeFoundationBenchmarkCampaignV1Digest,
  hsmeFoundationBenchmarkCandidateMayRunV1,
  mayFinalizeHsmeFoundationBenchmarkCampaignV1,
  normalizeHsmeFoundationBenchmarkCampaignV1,
  unifiedRequiredCapabilityCandidatesV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';

const rawCampaign = JSON.parse(await readFile(
  new URL('../src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json', import.meta.url),
  'utf8',
));
const tinyManifest = JSON.parse(await readFile(
  new URL('../src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json', import.meta.url),
  'utf8',
));

const H = char => char.repeat(64);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

const clone = value => structuredClone(value);

function candidate(raw, id) {
  return raw.candidates.find(value => value.candidateId === id);
}

function slice(raw, id) {
  return raw.slices.find(value => value.sliceId === id);
}

function resolveRights(raw) {
  for (const item of raw.candidates) {
    item.rightsState = item.candidateId === 'tiny-sd-control-v1'
      ? 'REVIEWED_WITH_OBLIGATIONS'
      : 'REVIEWED_COMMERCIAL';
    item.rightsEvidenceSha256 = H(item.candidateId.charCodeAt(0).toString(16)[0] ?? 'a');
  }
}

function pinFixtures(raw) {
  raw.status = 'FIXTURES_PINNED';
  raw.fixturePack = {
    state: 'PINNED',
    manifestSha256: H('a'),
    licenseEvidenceSha256: H('b'),
    privateUserDataAllowed: false,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

test('canonical six-candidate campaign is evidence-pending and quality-first', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  assert.equal(campaign.schemaVersion, HSME_FOUNDATION_BENCHMARK_CAMPAIGN_V1_SCHEMA);
  assert.equal(campaign.qualityPolicy, 'QUALITY_FLOOR_BEFORE_EFFICIENCY');
  assert.equal(campaign.status, 'EVIDENCE_PENDING');
  assert.equal(campaign.candidates.length, 6);
  assert.equal(campaign.fixturePack.state, 'PIN_REQUIRED');
  assert.equal(campaign.postObservationMutationAllowed, false);
  assert.equal(campaign.efficiencyUsedInQualitySelection, false);
  assert.equal(campaign.ordinaryCiModelExecutionAllowed, false);
  assert.equal(mayFinalizeHsmeFoundationBenchmarkCampaignV1(campaign), false);
});

test('Tiny-SD campaign control binds the accepted repository trust-root revision', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const tiny = campaign.candidates.find(value => value.candidateId === 'tiny-sd-control-v1');
  assert.equal(tiny.sourceRoot, 'segmind/tiny-sd');
  assert.equal(tiny.immutableRevision, tinyManifest.upstream.revision);
  assert.equal(tiny.trustBinding, 'src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json');
  assert.deepEqual(tiny.roles, ['CONTROL_BASELINE']);
});

test('distilled and undistilled FLUX 4B remain separate quality candidates', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const distilled = campaign.candidates.find(value => value.candidateId === 'flux2-klein-4b-distilled-v1');
  const base = campaign.candidates.find(value => value.candidateId === 'flux2-klein-base-4b-v1');
  assert.notEqual(distilled.sourceRoot, base.sourceRoot);
  assert.notEqual(distilled.immutableRevision, base.immutableRevision);
  assert.deepEqual(distilled.roles, ['DIRECT_FOUNDATION']);
  assert.deepEqual(base.roles, ['DIRECT_FOUNDATION']);
  assert.deepEqual(distilled.capabilities, ['IMAGE_EDITING', 'MULTI_REFERENCE_EDITING', 'TEXT_TO_IMAGE']);
  assert.deepEqual(base.capabilities, ['IMAGE_EDITING', 'MULTI_REFERENCE_EDITING', 'TEXT_TO_IMAGE']);
});

test('Qwen generation and editing references are reference-only and capability-sliced', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const t2i = campaign.candidates.find(value => value.candidateId === 'qwen-image-t2i-reference-v1');
  const edit = campaign.candidates.find(value => value.candidateId === 'qwen-image-edit-2511-reference-v1');
  assert.deepEqual(t2i.roles, ['QUALITY_REFERENCE']);
  assert.deepEqual(t2i.capabilities, ['TEXT_TO_IMAGE']);
  assert.deepEqual(edit.roles, ['QUALITY_REFERENCE']);
  assert.deepEqual(edit.capabilities, ['IMAGE_EDITING', 'MULTI_REFERENCE_EDITING']);

  assert.deepEqual(slice(campaign, 'text-to-image-v1').qualityReferenceCandidateIds, [
    'qwen-image-t2i-reference-v1',
  ]);
  assert.deepEqual(slice(campaign, 'image-editing-v1').qualityReferenceCandidateIds, [
    'qwen-image-edit-2511-reference-v1',
  ]);
});

test('SANA split remains T2I-only and cannot silently enter the editing slice', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const sana = campaign.candidates.find(value => value.candidateId === 'sana-sprint-0.6b-split-v1');
  assert.deepEqual(sana.capabilities, ['TEXT_TO_IMAGE']);
  assert.ok(slice(campaign, 'text-to-image-v1').selectionCandidateIds.includes(sana.candidateId));
  assert.equal(slice(campaign, 'image-editing-v1').selectionCandidateIds.includes(sana.candidateId), false);

  const changed = clone(rawCampaign);
  slice(changed, 'image-editing-v1').selectionCandidateIds.push(sana.candidateId);
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_selection_capability_unproven',
  );
});

test('only candidates covering every required product capability appear in unified coverage', () => {
  assert.deepEqual(unifiedRequiredCapabilityCandidatesV1(rawCampaign), [
    'flux2-klein-4b-distilled-v1',
    'flux2-klein-base-4b-v1',
  ]);
});

test('control is measured but cannot be smuggled into the selectable set', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  assert.deepEqual(slice(campaign, 'text-to-image-v1').controlCandidateIds, ['tiny-sd-control-v1']);

  const changed = clone(rawCampaign);
  slice(changed, 'text-to-image-v1').selectionCandidateIds.push('tiny-sd-control-v1');
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_selection_role_invalid',
  );
});

test('quality reference cannot be selected as a mobile/direct candidate', () => {
  const changed = clone(rawCampaign);
  slice(changed, 'image-editing-v1').selectionCandidateIds.push('qwen-image-edit-2511-reference-v1');
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_selection_role_invalid',
  );
});

test('real candidate runs are blocked until both fixture and rights evidence are pinned', () => {
  assert.equal(
    hsmeFoundationBenchmarkCandidateMayRunV1(rawCampaign, 'flux2-klein-base-4b-v1'),
    false,
  );

  const fixturesOnly = clone(rawCampaign);
  pinFixtures(fixturesOnly);
  assert.equal(
    hsmeFoundationBenchmarkCandidateMayRunV1(fixturesOnly, 'flux2-klein-base-4b-v1'),
    false,
  );

  const ready = clone(rawCampaign);
  pinFixtures(ready);
  resolveRights(ready);
  assert.equal(
    hsmeFoundationBenchmarkCandidateMayRunV1(ready, 'flux2-klein-base-4b-v1'),
    true,
  );
  assert.equal(mayFinalizeHsmeFoundationBenchmarkCampaignV1(ready), true);
});

test('campaign finalization requires rights for controls and quality references, not only selectable models', () => {
  const changed = clone(rawCampaign);
  pinFixtures(changed);
  resolveRights(changed);
  const reference = candidate(changed, 'qwen-image-edit-2511-reference-v1');
  reference.rightsState = 'REVIEW_REQUIRED';
  reference.rightsEvidenceSha256 = 'UNKNOWN';
  assert.equal(mayFinalizeHsmeFoundationBenchmarkCampaignV1(changed), false);

  reference.rightsState = 'REVIEWED_COMMERCIAL';
  reference.rightsEvidenceSha256 = H('e');
  assert.equal(mayFinalizeHsmeFoundationBenchmarkCampaignV1(changed), true);
});

test('private user fixture data and post-observation mutation are structurally forbidden', () => {
  const privateFixture = clone(rawCampaign);
  privateFixture.fixturePack.privateUserDataAllowed = true;
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(privateFixture),
    'hsme_foundation_campaign_private_fixture_forbidden',
  );

  const mutable = clone(rawCampaign);
  mutable.postObservationMutationAllowed = true;
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(mutable),
    'hsme_foundation_campaign_post_observation_mutation_forbidden',
  );
});

test('efficiency cannot participate in campaign quality selection', () => {
  const changed = clone(rawCampaign);
  changed.efficiencyUsedInQualitySelection = true;
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_efficiency_quality_mix_forbidden',
  );

  const injected = clone(rawCampaign);
  injected.mobileInstalledBudgetBytes = 1_000_000_000;
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(injected),
    'hsme_foundation_campaign_field_unknown',
  );
});

test('canonical campaign pins the reviewed immutable revision for every participant', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const expected = new Map([
    ['tiny-sd-control-v1', 'cad0bd7495fa6c4bcca01b19a723dc91627fe84f'],
    ['sana-sprint-0.6b-split-v1', 'a7d9fc31dd5c3f5e22dbfd78360777ceed56ae97'],
    ['flux2-klein-4b-distilled-v1', 'e7b7dc27f91deacad38e78976d1f2b499d76a294'],
    ['flux2-klein-base-4b-v1', 'a3b4f4849157f664bdbc776fd7453c2783562f4d'],
    ['qwen-image-t2i-reference-v1', '0770fddc587fa1795e0a9eb01dd40218fcbdd524'],
    ['qwen-image-edit-2511-reference-v1', '6f3ccc0b56e431dc6a0c2b2039706d7d26f22cb9'],
  ]);
  assert.equal(campaign.candidates.length, expected.size);
  for (const item of campaign.candidates) {
    assert.equal(item.immutableRevision, expected.get(item.candidateId), item.candidateId);
  }
});

test('campaign plan cannot preselect a winner before real evidence exists', () => {
  const changed = clone(rawCampaign);
  changed.selectedCandidateId = 'flux2-klein-base-4b-v1';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_field_unknown',
  );
});

test('immutable revisions are required before any candidate is benchmarkable', () => {
  const changed = clone(rawCampaign);
  candidate(changed, 'flux2-klein-base-4b-v1').immutableRevision = 'main';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_revision_invalid',
  );
});

test('campaign digest is candidate-order invariant but changes for source revision drift', async () => {
  const left = clone(rawCampaign);
  const reordered = clone(rawCampaign);
  reordered.candidates.reverse();
  assert.equal(
    await hsmeFoundationBenchmarkCampaignV1Digest(left, hashPort),
    await hsmeFoundationBenchmarkCampaignV1Digest(reordered, hashPort),
  );

  const drifted = clone(rawCampaign);
  candidate(drifted, 'flux2-klein-base-4b-v1').immutableRevision =
    '8c44a2fbef88fae175da65df054db0f901aa9747';
  assert.notEqual(
    await hsmeFoundationBenchmarkCampaignV1Digest(left, hashPort),
    await hsmeFoundationBenchmarkCampaignV1Digest(drifted, hashPort),
  );
});

test('campaign digest changes if quality priority, reference mapping or fixture identity changes', async () => {
  const baseline = await hsmeFoundationBenchmarkCampaignV1Digest(rawCampaign, hashPort);

  const priority = clone(rawCampaign);
  const edit = slice(priority, 'image-editing-v1');
  [edit.dimensionPriority[0], edit.dimensionPriority[1]] = [
    edit.dimensionPriority[1],
    edit.dimensionPriority[0],
  ];
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkCampaignV1Digest(priority, hashPort),
  );

  const reference = clone(rawCampaign);
  candidate(reference, 'qwen-image-t2i-reference-v1').capabilities.push('IMAGE_EDITING');
  slice(reference, 'image-editing-v1').qualityReferenceCandidateIds = [
    'qwen-image-t2i-reference-v1',
  ];
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkCampaignV1Digest(reference, hashPort),
  );

  const fixtures = clone(rawCampaign);
  pinFixtures(fixtures);
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkCampaignV1Digest(fixtures, hashPort),
  );
});
