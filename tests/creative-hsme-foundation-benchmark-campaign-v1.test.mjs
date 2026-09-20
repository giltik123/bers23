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
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  'utf8',
));
const tinyManifest = JSON.parse(await readFile(
  'src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json',
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

function resolveCandidateIdentity(raw) {
  raw.candidates.forEach((item, index) => {
    item.modelContentSha256 = H((index + 1).toString(16));
    item.executionProfileSha256 = H((index + 7).toString(16));
  });
}

function resolveRights(raw) {
  raw.candidates.forEach((item, index) => {
    item.rightsState = item.candidateId === 'tiny-sd-control-v1'
      ? 'REVIEWED_WITH_OBLIGATIONS'
      : 'REVIEWED_COMMERCIAL';
    item.rightsEvidenceSha256 = H((index + 1).toString(16));
  });
}

function pinFixtures(raw) {
  raw.fixturePack = {
    state: 'PINNED',
    fixtureSetSha256: H('a'),
    fixturePolicySha256: H('b'),
    promptInputSetSha256: H('c'),
    blindedReviewRubricSha256: H('d'),
    deterministicInputPolicySha256: H('e'),
    outputSetContractSha256: H('f'),
    licenseEvidenceSha256: H('9'),
    privateUserDataAllowed: false,
  };
}

function pinThresholds(raw) {
  raw.slices.forEach((qualitySlice, sliceIndex) => {
    qualitySlice.dimensions.forEach((dimension, dimensionIndex) => {
      dimension.maxLossMicrounits = 10_000 + sliceIndex * 1_000 + dimensionIndex;
    });
  });
}

function makeRunnable(raw) {
  pinFixtures(raw);
  pinThresholds(raw);
  resolveCandidateIdentity(raw);
  resolveRights(raw);
  raw.status = 'FIXTURES_PINNED';
}

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

test('canonical six-candidate campaign is evidence-pending with thresholds frozen before unresolved bytes and rights', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  assert.equal(campaign.schemaVersion, HSME_FOUNDATION_BENCHMARK_CAMPAIGN_V1_SCHEMA);
  assert.equal(campaign.qualityPolicy, 'QUALITY_FLOOR_BEFORE_EFFICIENCY');
  assert.equal(campaign.status, 'EVIDENCE_PENDING');
  assert.equal(campaign.candidates.length, 6);
  assert.equal(campaign.fixturePack.state, 'PIN_REQUIRED');
  assert.ok(campaign.candidates.every(value => value.modelContentSha256 === 'UNKNOWN'));
  assert.ok(campaign.candidates.every(value => value.executionProfileSha256 === 'UNKNOWN'));
  const thresholds = campaign.slices.flatMap(value =>
    value.dimensions.map(dimension => dimension.maxLossMicrounits),
  );
  assert.equal(thresholds.length, 13);
  assert.ok(thresholds.every(value => Number.isSafeInteger(value)));
  assert.ok(thresholds.every(value => value >= 20_000 && value <= 50_000));
  assert.equal(mayFinalizeHsmeFoundationBenchmarkCampaignV1(campaign), false);
});

test('all mutation, efficiency and execution authorities remain fail closed', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  for (const flag of [
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
  ]) {
    assert.equal(campaign[flag], false, flag);
  }
});

test('Tiny-SD control binds the accepted repository trust-root revision without pretending unresolved hashes are pinned', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const tiny = campaign.candidates.find(value => value.candidateId === 'tiny-sd-control-v1');
  assert.equal(tiny.sourceRoot, 'segmind/tiny-sd');
  assert.equal(tiny.immutableRevision, tinyManifest.upstream.revision);
  assert.equal(tiny.modelContentSha256, 'UNKNOWN');
  assert.equal(tiny.executionProfileSha256, 'UNKNOWN');
  assert.equal(tiny.trustBinding, 'src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json');
  assert.deepEqual(tiny.roles, ['CONTROL_BASELINE']);
});

test('distilled and Base FLUX remain separate selectable quality candidates', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const distilled = candidate(campaign, 'flux2-klein-4b-distilled-v1');
  const base = candidate(campaign, 'flux2-klein-base-4b-v1');
  assert.notEqual(distilled.sourceRoot, base.sourceRoot);
  assert.notEqual(distilled.immutableRevision, base.immutableRevision);
  assert.deepEqual(distilled.roles, ['DIRECT_FOUNDATION']);
  assert.deepEqual(base.roles, ['DIRECT_FOUNDATION']);
  assert.deepEqual(distilled.capabilities, ['IMAGE_EDITING', 'MULTI_REFERENCE_EDITING', 'TEXT_TO_IMAGE']);
  assert.deepEqual(base.capabilities, ['IMAGE_EDITING', 'MULTI_REFERENCE_EDITING', 'TEXT_TO_IMAGE']);
  assert.equal(distilled.benchmarkMode, 'ZERO_TRAINING');
  assert.equal(base.benchmarkMode, 'ZERO_TRAINING');
});

test('T2I and editing use separate quality references and separate ordered hard dimensions', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const t2i = slice(campaign, 'text-to-image-v1');
  const edit = slice(campaign, 'image-editing-v1');

  assert.deepEqual(t2i.qualityReferenceCandidateIds, ['qwen-image-t2i-reference-v1']);
  assert.deepEqual(edit.qualityReferenceCandidateIds, ['qwen-image-edit-2511-reference-v1']);

  assert.deepEqual(t2i.dimensions.map(value => value.dimensionId), [
    'semantic-adherence',
    'anatomy-artifact-rate',
    'photorealism',
    'material-realism',
    'text-fidelity',
    'composition-count-spatial-correctness',
  ]);
  assert.deepEqual(edit.dimensions.map(value => value.dimensionId), [
    'identity-preservation',
    'garment-logo-pattern-preservation',
    'non-target-preservation',
    'edit-compliance',
    'anatomy-artifact-rate',
    'text-fidelity',
    'multi-reference-consistency',
  ]);
});

test('SANA split remains T2I-only and cannot silently enter editing', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(rawCampaign);
  const sana = candidate(campaign, 'sana-sprint-0.6b-split-v1');
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

test('control and quality references cannot be smuggled into selectable reuse', () => {
  const control = clone(rawCampaign);
  slice(control, 'text-to-image-v1').selectionCandidateIds.push('tiny-sd-control-v1');
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(control),
    'hsme_foundation_campaign_selection_role_invalid',
  );

  const reference = clone(rawCampaign);
  slice(reference, 'image-editing-v1').selectionCandidateIds.push('qwen-image-edit-2511-reference-v1');
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(reference),
    'hsme_foundation_campaign_selection_role_invalid',
  );
});

test('a candidate cannot run until fixtures, thresholds, exact content, execution profile and rights are all pinned', () => {
  const candidateId = 'flux2-klein-base-4b-v1';
  assert.equal(hsmeFoundationBenchmarkCandidateMayRunV1(rawCampaign, candidateId), false);

  const fixtureAndThresholdsOnly = clone(rawCampaign);
  pinFixtures(fixtureAndThresholdsOnly);
  pinThresholds(fixtureAndThresholdsOnly);
  fixtureAndThresholdsOnly.status = 'FIXTURES_PINNED';
  assert.equal(
    hsmeFoundationBenchmarkCandidateMayRunV1(fixtureAndThresholdsOnly, candidateId),
    false,
  );

  const noRights = clone(fixtureAndThresholdsOnly);
  resolveCandidateIdentity(noRights);
  assert.equal(hsmeFoundationBenchmarkCandidateMayRunV1(noRights, candidateId), false);

  const runnable = clone(rawCampaign);
  makeRunnable(runnable);
  assert.equal(hsmeFoundationBenchmarkCandidateMayRunV1(runnable, candidateId), true);
  assert.equal(mayFinalizeHsmeFoundationBenchmarkCampaignV1(runnable), true);
});

test('FIXTURES_PINNED status is rejected if any previously frozen quality threshold becomes PIN_REQUIRED', () => {
  const changed = clone(rawCampaign);
  pinFixtures(changed);
  slice(changed, 'image-editing-v1').dimensions[0].maxLossMicrounits = 'PIN_REQUIRED';
  changed.status = 'FIXTURES_PINNED';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_thresholds_unpinned',
  );
});

test('partial fixture identity is rejected instead of being treated as pinned evidence', () => {
  const changed = clone(rawCampaign);
  changed.fixturePack.fixtureSetSha256 = H('a');
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_unpinned_fixture_evidence_invalid',
  );

  const missing = clone(rawCampaign);
  pinFixtures(missing);
  missing.fixturePack.outputSetContractSha256 = 'UNKNOWN';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(missing),
    'hsme_foundation_campaign_fixture_evidence_missing',
  );
});

test('finalization requires exact identity and rights for controls and quality references too', () => {
  const changed = clone(rawCampaign);
  makeRunnable(changed);

  const reference = candidate(changed, 'qwen-image-edit-2511-reference-v1');
  reference.rightsState = 'REVIEW_REQUIRED';
  reference.rightsEvidenceSha256 = 'UNKNOWN';
  assert.equal(mayFinalizeHsmeFoundationBenchmarkCampaignV1(changed), false);

  reference.rightsState = 'REVIEWED_COMMERCIAL';
  reference.rightsEvidenceSha256 = H('e');
  assert.equal(mayFinalizeHsmeFoundationBenchmarkCampaignV1(changed), true);

  const missingContent = candidate(changed, 'qwen-image-t2i-reference-v1');
  missingContent.modelContentSha256 = 'UNKNOWN';
  assert.equal(mayFinalizeHsmeFoundationBenchmarkCampaignV1(changed), false);
});

test('private user fixture data is structurally forbidden', () => {
  const changed = clone(rawCampaign);
  changed.fixturePack.privateUserDataAllowed = true;
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_private_fixture_forbidden',
  );
});

test('post-observation mutations and execution authorities are structurally forbidden', () => {
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
  ]) {
    const changed = clone(rawCampaign);
    changed[flag] = true;
    expectCode(
      () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
      'hsme_foundation_campaign_authority_or_mutation_invalid',
    );
  }
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

test('every capability slice requires its full non-compensable quality dimensions', () => {
  const changed = clone(rawCampaign);
  const edit = slice(changed, 'image-editing-v1');
  edit.dimensions = edit.dimensions.filter(value => value.dimensionId !== 'identity-preservation');
  edit.dimensions.push({
    dimensionId: 'material-realism',
    referenceCandidateId: 'qwen-image-edit-2511-reference-v1',
    maxLossMicrounits: 'PIN_REQUIRED',
    reviewMode: 'BLINDED_HUMAN',
  });
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_required_dimension_missing',
  );
});

test('per-dimension reference must belong to the quality-reference set for that capability slice', () => {
  const changed = clone(rawCampaign);
  slice(changed, 'text-to-image-v1').dimensions[0].referenceCandidateId =
    'qwen-image-edit-2511-reference-v1';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_dimension_reference_outside_slice',
  );
});

test('campaign plan cannot preselect a winner before real evidence exists', () => {
  const changed = clone(rawCampaign);
  changed.selectedCandidateId = 'flux2-klein-base-4b-v1';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(changed),
    'hsme_foundation_campaign_field_unknown',
  );
});

test('immutable revision format and exact content/execution hashes are independently enforced', () => {
  const badRevision = clone(rawCampaign);
  candidate(badRevision, 'flux2-klein-base-4b-v1').immutableRevision = 'main';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(badRevision),
    'hsme_foundation_campaign_revision_invalid',
  );

  const badContent = clone(rawCampaign);
  candidate(badContent, 'flux2-klein-base-4b-v1').modelContentSha256 = 'not-a-hash';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(badContent),
    'hsme_foundation_campaign_hash_invalid',
  );

  const badExecution = clone(rawCampaign);
  candidate(badExecution, 'flux2-klein-base-4b-v1').executionProfileSha256 = 'not-a-hash';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkCampaignV1(badExecution),
    'hsme_foundation_campaign_hash_invalid',
  );
});

test('canonical campaign pins all six reviewed immutable revisions', () => {
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

test('candidate order is canonical but slice quality order, references, thresholds and exact identity are digest-significant', async () => {
  const baseline = await hsmeFoundationBenchmarkCampaignV1Digest(rawCampaign, hashPort);

  const reorderedCandidates = clone(rawCampaign);
  reorderedCandidates.candidates.reverse();
  assert.equal(
    baseline,
    await hsmeFoundationBenchmarkCampaignV1Digest(reorderedCandidates, hashPort),
  );

  const qualityOrder = clone(rawCampaign);
  const edit = slice(qualityOrder, 'image-editing-v1');
  [edit.dimensions[0], edit.dimensions[1]] = [edit.dimensions[1], edit.dimensions[0]];
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkCampaignV1Digest(qualityOrder, hashPort),
  );

  const threshold = clone(rawCampaign);
  slice(threshold, 'image-editing-v1').dimensions[0].maxLossMicrounits = 123;
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkCampaignV1Digest(threshold, hashPort),
  );

  const identity = clone(rawCampaign);
  candidate(identity, 'flux2-klein-base-4b-v1').modelContentSha256 = H('a');
  candidate(identity, 'flux2-klein-base-4b-v1').executionProfileSha256 = H('b');
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkCampaignV1Digest(identity, hashPort),
  );

  const fixtures = clone(rawCampaign);
  pinFixtures(fixtures);
  pinThresholds(fixtures);
  fixtures.status = 'FIXTURES_PINNED';
  assert.notEqual(
    baseline,
    await hsmeFoundationBenchmarkCampaignV1Digest(fixtures, hashPort),
  );
});
