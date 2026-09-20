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
const fixturePackEvidence = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json',
  'utf8',
));
const fixtureRightsEvidence = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-fixture-rights-evidence.v1.json',
  'utf8',
));
const generatedFixtureManifest = JSON.parse(await readFile(
  'tests/fixtures/hsme-foundation-generated-editing-v1/fixture-manifest.json',
  'utf8',
));
const d6Corpus = JSON.parse(await readFile(
  'tests/fixtures/tiny-sd-d6-quality-corpus-v1.json',
  'utf8',
));

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

test('committed fixture plan is fully pinned before candidate outputs', async () => {
  const plan = normalizeHsmeFoundationFixturePlanV1(committedPlan);
  assert.equal(plan.planId, 'bers-foundation-fixture-plan-v1');
  assert.equal(plan.campaignId, 'bers-hsme-foundation-bakeoff-2026q3-v1');
  assert.equal(plan.state, 'PINNED');
  assert.equal(plan.assets.length, 13);
  assert.equal(plan.dimensions.length, 11);
  assert.equal(plan.candidateOutputsObserved, false);
  assert.equal(hsmeFoundationFixturePlanMayFreezeV1(plan), true);
  assert.equal(
    await hsmeFoundationFixturePlanDigestV1(plan, hashPort),
    fixturePackEvidence.fixturePlanSha256,
  );
  assert.equal(fixturePackEvidence.fixturePlanSha256, 'd5af7ca8d7dae76916b0f489040e7d4b982306a58d813027196f0a7219e409ac');
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

test('committed pack derives every campaign-facing digest from canonical source content', () => {
  const domains = {
    fixtureSet: 'bers:hsme:foundation-fixture-set:v1',
    fixturePolicy: 'bers:hsme:foundation-fixture-policy:v1',
    promptInputSet: 'bers:hsme:foundation-prompt-input-set:v1',
    blindedReviewRubric: 'bers:hsme:foundation-blinded-review-rubric:v1',
    deterministicInputPolicy: 'bers:hsme:foundation-deterministic-input-policy:v1',
    outputSetContract: 'bers:hsme:foundation-output-set-contract:v1',
    licenseEvidence: 'bers:hsme:foundation-fixture-rights-evidence:v1',
  };
  for (const [sourceKey, domain] of Object.entries(domains)) {
    const digestKey = sourceKey + 'Sha256';
    assert.equal(
      fixturePackEvidence.digests[digestKey],
      domainHash(domain, fixturePackEvidence.sources[sourceKey]),
      digestKey,
    );
  }
  assert.equal(
    fixtureRightsEvidence.licenseEvidenceSha256,
    fixturePackEvidence.digests.licenseEvidenceSha256,
  );
  assert.equal(fixtureRightsEvidence.privateUserDataAllowed, false);
  assert.equal(fixturePackEvidence.candidateOutputsObserved, false);
  assert.equal(fixturePackEvidence.productionAuthorityGranted, false);
  assert.equal(fixturePackEvidence.winnerSelectionAllowed, false);
});

test('fixture pack has exact 6 T2I plus 7 editing case coverage', () => {
  const plan = normalizeHsmeFoundationFixturePlanV1(committedPlan);
  const t2i = plan.assets.filter(value => value.capability === 'TEXT_TO_IMAGE').map(value => value.caseClass).sort();
  const edit = plan.assets.filter(value => value.capability === 'IMAGE_EDITING').map(value => value.caseClass).sort();
  assert.deepEqual(t2i, [
    'count-spatial',
    'difficult-texture',
    'fashion-material',
    'people-anatomy',
    'product-object',
    'text-logo-rendering',
  ]);
  assert.deepEqual(edit, [
    'garment-detail-preservation',
    'identity-preservation',
    'localized-edit-compliance',
    'logo-text-editing',
    'multi-reference-consistency',
    'non-target-preservation',
    'pattern-texture-material-preservation',
  ]);
  assert.equal(generatedFixtureManifest.assets.length, 4);
  assert.equal(generatedFixtureManifest.t2iSupplement.length, 3);
  assert.equal(generatedFixtureManifest.cases.length, 4);
  assert.ok(generatedFixtureManifest.cases.some(value =>
    value.caseId === 'edit-logo-text-v1' && value.instruction.includes('BERS LAB to BERS AI')
  ));
});

test('repository-owned fixture rights are separately content-addressed', () => {
  const declarations = new Map(fixtureRightsEvidence.declarations.map(value => [value.rightsId, value]));
  for (const [rightsId, declaration] of declarations) {
    assert.equal(
      fixtureRightsEvidence.declarationDigests[rightsId],
      domainHash('bers:hsme:fixture-rights-declaration:v1', declaration),
    );
    assert.equal(declaration.privateUserDataAllowed, false);
    assert.equal(declaration.productionAuthorityGranted, false);
  }
  assert.equal(declarations.get('BERS_REPOSITORY_OWNED_SYNTHETIC_FIXTURE_V1').generatedFromThirdPartyContent, false);
});

test('prompt/input set hashes resolve back to exact D6 and generated source text', () => {
  const promptSet = fixturePackEvidence.sources.promptInputSet;
  const d6ById = new Map(d6Corpus.prompts.map(value => [value.promptId, value]));
  for (const item of promptSet.d6Corpus.selected) {
    const source = d6ById.get(item.promptId);
    assert.ok(source, item.promptId);
    assert.equal(
      item.promptSha256,
      createHash('sha256').update(source.prompt, 'utf8').digest('hex'),
      item.promptId,
    );
  }
  const generatedById = new Map(generatedFixtureManifest.t2iSupplement.map(value => [value.fixtureId, value]));
  for (const item of promptSet.generatedT2i) {
    const source = generatedById.get(item.fixtureId);
    assert.ok(source, item.fixtureId);
    assert.equal(item.promptSha256, source.promptSha256);
    assert.equal(
      source.promptSha256,
      createHash('sha256').update(source.prompt, 'utf8').digest('hex'),
    );
  }
  const editById = new Map(generatedFixtureManifest.cases.map(value => [value.caseId, value]));
  for (const item of promptSet.editingCases) {
    const source = editById.get(item.caseId);
    assert.ok(source, item.caseId);
    assert.equal(item.instructionSha256, source.instructionSha256);
    assert.equal(
      source.instructionSha256,
      createHash('sha256').update(source.instruction, 'utf8').digest('hex'),
    );
    assert.deepEqual(item.referenceOrder, source.referenceOrder);
  }
});

test('every generated raster content hash used by editing cases is present in the generated manifest', () => {
  const generatedHashes = new Set(generatedFixtureManifest.assets.map(value => value.contentSha256));
  const plan = normalizeHsmeFoundationFixturePlanV1(committedPlan);
  for (const asset of plan.assets.filter(value => value.capability === 'IMAGE_EDITING')) {
    assert.ok(generatedHashes.has(asset.contentSha256), asset.fixtureId);
    assert.equal(asset.sourceClass, 'GENERATED_FIXTURE_ASSET');
    assert.equal(asset.rightsConclusion, 'ADMITTED');
  }
});
