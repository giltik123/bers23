import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  HSME_FOUNDATION_FIXTURE_PLAN_V1_SCHEMA,
  HSME_TINY_SD_D6_CORPUS_PATH,
  HSME_TINY_SD_D6_CORPUS_SHA256,
  hsmeFoundationFixturePlanDigestV1,
  hsmeFoundationFixturePlanMayFreezeV1,
  normalizeHsmeFoundationFixturePlanV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkFixturePlanV1.ts';

const H = c => c.repeat(64);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };
const clone = value => structuredClone(value);
const committedPlan = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json',
  'utf8',
));

const dimensionIds = [
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
];

function pendingPlan() {
  return {
    schemaVersion: HSME_FOUNDATION_FIXTURE_PLAN_V1_SCHEMA,
    planId: 'bers-foundation-fixture-plan-v1',
    campaignId: 'bers-hsme-foundation-bakeoff-2026q3-v1',
    state: 'EVIDENCE_PENDING',
    reusedT2iCorpus: {
      path: HSME_TINY_SD_D6_CORPUS_PATH,
      sha256: HSME_TINY_SD_D6_CORPUS_SHA256,
    },
    assets: [],
    dimensions: dimensionIds.map((dimensionId, index) => ({
      dimensionId,
      reviewMode: index < 4 ? 'BLINDED_HUMAN' : 'HYBRID',
      scalePolicySha256: 'UNKNOWN',
      rubricSha256: 'UNKNOWN',
      thresholdState: 'PIN_REQUIRED',
      maxLossMicrounits: 'PIN_REQUIRED',
    })),
    privateUserDataAllowed: false,
    candidateOutputsObserved: false,
    postObservationMutationAllowed: false,
    ordinaryCiModelExecutionAllowed: false,
  };
}

function asset(fixtureId, capability, caseClass, index) {
  return {
    fixtureId,
    capability,
    caseClass,
    sourceClass: 'PUBLIC_LICENSED_ASSET',
    contentSha256: H(((index % 9) + 1).toString()),
    sourceRef: `fixture:public:${fixtureId}@immutable`,
    licenseId: 'CC-BY-4.0',
    licenseEvidenceSha256: H((((index + 1) % 9) + 1).toString()),
    rightsConclusion: 'ADMITTED',
    preprocessingSha256: H((((index + 2) % 9) + 1).toString()),
    promptOrInstructionSha256: H((((index + 3) % 9) + 1).toString()),
  };
}

function makePinned(raw) {
  const t2i = [
    'people-anatomy',
    'fashion-material',
    'text-logo-rendering',
    'count-spatial',
    'product-object',
    'difficult-texture',
  ];
  const edit = [
    'identity-preservation',
    'garment-detail-preservation',
    'logo-text-editing',
    'pattern-texture-material-preservation',
    'non-target-preservation',
    'localized-edit-compliance',
    'multi-reference-consistency',
  ];
  raw.assets = [
    ...t2i.map((caseClass, index) => asset(`t2i-${caseClass}`, 'TEXT_TO_IMAGE', caseClass, index)),
    ...edit.map((caseClass, index) => asset(`edit-${caseClass}`, 'IMAGE_EDITING', caseClass, index + t2i.length)),
  ];
  raw.dimensions.forEach((dimension, index) => {
    dimension.scalePolicySha256 = H(((index % 9) + 1).toString());
    dimension.rubricSha256 = H((((index + 1) % 9) + 1).toString());
    dimension.thresholdState = 'PINNED';
    dimension.maxLossMicrounits = 100_000 + index;
  });
  raw.state = 'PINNED';
  return raw;
}

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

test('committed pending fixture plan normalizes under the same contract used by future evidence', () => {
  const plan = normalizeHsmeFoundationFixturePlanV1(committedPlan);
  assert.equal(plan.planId, 'bers-foundation-fixture-plan-v1');
  assert.equal(plan.campaignId, 'bers-hsme-foundation-bakeoff-2026q3-v1');
  assert.equal(plan.state, 'EVIDENCE_PENDING');
  assert.equal(plan.assets.length, 0);
  assert.equal(plan.dimensions.length, 11);
  assert.equal(hsmeFoundationFixturePlanMayFreezeV1(plan), false);
});

test('pending fixture plan reuses accepted D6 corpus without fabricating new asset or threshold evidence', () => {
  const plan = normalizeHsmeFoundationFixturePlanV1(pendingPlan());
  assert.equal(plan.state, 'EVIDENCE_PENDING');
  assert.equal(plan.reusedT2iCorpus.path, HSME_TINY_SD_D6_CORPUS_PATH);
  assert.equal(plan.reusedT2iCorpus.sha256, HSME_TINY_SD_D6_CORPUS_SHA256);
  assert.equal(plan.assets.length, 0);
  assert.ok(plan.dimensions.every(value => value.thresholdState === 'PIN_REQUIRED'));
  assert.equal(hsmeFoundationFixturePlanMayFreezeV1(plan), false);
});

test('private user data, candidate outputs, post-observation mutation and ordinary CI execution are always forbidden', () => {
  for (const [field, code] of [
    ['privateUserDataAllowed', 'hsme_fixture_private_user_data_forbidden'],
    ['candidateOutputsObserved', 'hsme_fixture_candidate_outputs_pre_freeze_forbidden'],
    ['postObservationMutationAllowed', 'hsme_fixture_post_observation_mutation_forbidden'],
    ['ordinaryCiModelExecutionAllowed', 'hsme_fixture_ci_model_execution_forbidden'],
  ]) {
    const raw = pendingPlan();
    raw[field] = true;
    expectCode(() => normalizeHsmeFoundationFixturePlanV1(raw), code);
  }
});

test('accepted D6 path and digest cannot be substituted after the fact', () => {
  const badPath = pendingPlan();
  badPath.reusedT2iCorpus.path = 'tests/fixtures/copied-corpus.json';
  expectCode(() => normalizeHsmeFoundationFixturePlanV1(badPath), 'hsme_fixture_d6_binding_invalid');

  const badDigest = pendingPlan();
  badDigest.reusedT2iCorpus.sha256 = H('f');
  expectCode(() => normalizeHsmeFoundationFixturePlanV1(badDigest), 'hsme_fixture_d6_binding_invalid');
});

test('PINNED plan requires all missing fashion/edit case classes', () => {
  const raw = makePinned(pendingPlan());
  raw.assets = raw.assets.filter(value => value.caseClass !== 'garment-detail-preservation');
  expectCode(() => normalizeHsmeFoundationFixturePlanV1(raw), 'hsme_fixture_case_coverage_missing');
});

test('PINNED plan requires admitted content/license/preprocessing/prompt evidence for every new asset', () => {
  const raw = makePinned(pendingPlan());
  raw.assets[0].contentSha256 = 'UNKNOWN';
  expectCode(() => normalizeHsmeFoundationFixturePlanV1(raw), 'hsme_fixture_asset_pin_incomplete');

  const rights = makePinned(pendingPlan());
  rights.assets[0].rightsConclusion = 'PENDING';
  expectCode(() => normalizeHsmeFoundationFixturePlanV1(rights), 'hsme_fixture_asset_pin_incomplete');
});

test('every canonical quality dimension is required', () => {
  const raw = pendingPlan();
  raw.dimensions.pop();
  expectCode(() => normalizeHsmeFoundationFixturePlanV1(raw), 'hsme_fixture_dimension_count_invalid');
});

test('numeric thresholds cannot appear while threshold state is PIN_REQUIRED', () => {
  const raw = pendingPlan();
  raw.dimensions[0].maxLossMicrounits = 100;
  expectCode(() => normalizeHsmeFoundationFixturePlanV1(raw), 'hsme_fixture_threshold_state_mismatch');
});

test('PINNED threshold requires scale policy, rubric digest and numeric max loss', () => {
  const raw = makePinned(pendingPlan());
  raw.dimensions[0].rubricSha256 = 'UNKNOWN';
  expectCode(() => normalizeHsmeFoundationFixturePlanV1(raw), 'hsme_fixture_dimension_pin_incomplete');

  const missingThreshold = pendingPlan();
  missingThreshold.dimensions[0].thresholdState = 'PINNED';
  expectCode(() => normalizeHsmeFoundationFixturePlanV1(missingThreshold), 'hsme_fixture_threshold_missing');
});

test('fully pinned pre-observation fixture plan can freeze', () => {
  const raw = makePinned(pendingPlan());
  const plan = normalizeHsmeFoundationFixturePlanV1(raw);
  assert.equal(plan.state, 'PINNED');
  assert.equal(plan.assets.length, 13);
  assert.equal(hsmeFoundationFixturePlanMayFreezeV1(plan), true);
});

test('caller cannot inject model winner or efficiency fields into fixture plan', () => {
  const selected = pendingPlan();
  selected.selectedCandidateId = 'flux2-klein-base-4b-v1';
  expectCode(() => normalizeHsmeFoundationFixturePlanV1(selected), 'hsme_fixture_field_unknown');

  const efficiency = pendingPlan();
  efficiency.workingMemoryBytes = 1;
  expectCode(() => normalizeHsmeFoundationFixturePlanV1(efficiency), 'hsme_fixture_field_unknown');
});

test('asset ordering is canonical while dimension order remains digest-significant', async () => {
  const left = makePinned(pendingPlan());
  const reorderedAssets = makePinned(pendingPlan());
  reorderedAssets.assets.reverse();
  assert.equal(
    await hsmeFoundationFixturePlanDigestV1(left, hashPort),
    await hsmeFoundationFixturePlanDigestV1(reorderedAssets, hashPort),
  );

  const reorderedDimensions = makePinned(pendingPlan());
  [reorderedDimensions.dimensions[0], reorderedDimensions.dimensions[1]] = [
    reorderedDimensions.dimensions[1],
    reorderedDimensions.dimensions[0],
  ];
  assert.notEqual(
    await hsmeFoundationFixturePlanDigestV1(left, hashPort),
    await hsmeFoundationFixturePlanDigestV1(reorderedDimensions, hashPort),
  );
});
