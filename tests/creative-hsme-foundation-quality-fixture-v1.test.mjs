import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  HSME_FOUNDATION_QUALITY_FIXTURE_V1_SCHEMA,
  normalizeHsmeFoundationQualityFixtureV1,
  proveHsmeFoundationQualityFixtureV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFixtureV1.ts';

const H = char => char.repeat(64);
const R = char => char.repeat(40);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

const hardDimensions = [
  'identity-preservation',
  'garment-logo-pattern-preservation',
  'non-target-preservation',
  'semantic-adherence',
  'anatomy-artifact-rate',
];

async function promptSha(prompt) {
  return hashPort.sha256(new TextEncoder().encode(prompt));
}

function candidate(candidateId, role, sourceRoot, revisionChar, hashChar, representationId, precisionId, derivedFromContentSha256 = 'NONE') {
  return {
    candidateId,
    role,
    sourceRoot,
    immutableRevision: R(revisionChar),
    contentSha256: H(hashChar),
    representationId,
    precisionId,
    derivedFromContentSha256,
  };
}

function asset(assetId, hashChar, overrides = {}) {
  return {
    assetId,
    mediaType: 'IMAGE',
    contentSha256: H(hashChar),
    provenanceClass: 'PROJECT_CREATED',
    provenanceEvidenceSha256: H('a'),
    licenseConclusion: 'BENCHMARK_ALLOWED',
    licenseEvidenceSha256: H('b'),
    redistributionAllowed: true,
    retentionAllowed: true,
    containsIdentifiablePerson: false,
    personConsent: 'NOT_APPLICABLE',
    personConsentEvidenceSha256: 'NOT_APPLICABLE',
    benchmarkAllowed: true,
    trainingAllowed: false,
    ...overrides,
  };
}

async function fixture() {
  const t2iPrompt = 'Photorealistic studio portrait wearing a patterned jacket with readable BERS label.';
  const editPrompt = 'Change only the jacket material to dark denim while preserving identity, pose, hands, logo and background.';
  const multiPrompt = 'Dress the person from the first reference in the garment from the second reference while preserving identity and garment pattern.';

  return {
    schemaVersion: HSME_FOUNDATION_QUALITY_FIXTURE_V1_SCHEMA,
    qualityPolicy: 'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    fixtureSetId: 'bers-foundation-quality-v1',
    candidates: [
      candidate('tiny-sd-control', 'CONTROL_BASELINE', 'segmind/tiny-sd', '1', '1', 'tiny-sd-bf16', 'bf16'),
      candidate('flux2-klein-base-4b-bf16', 'DIRECT_FOUNDATION', 'black-forest-labs/FLUX.2-klein-base-4B', '2', '2', 'flux2-klein-base-4b-bf16', 'bf16'),
      candidate('flux2-klein-base-4b-fp8', 'DIRECT_FOUNDATION', 'black-forest-labs/FLUX.2-klein-base-4b-fp8', '3', '3', 'flux2-klein-base-4b-fp8', 'fp8', H('2')),
      candidate('sana-sprint-0.6b-bf16', 'MOBILE_REUSE', 'Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers', '4', '4', 'sana-sprint-0.6b-bf16', 'bf16'),
      candidate('sana-sprint-1.6b-bf16', 'MOBILE_REUSE', 'Efficient-Large-Model/Sana_Sprint_1.6B_1024px_diffusers', '5', '5', 'sana-sprint-1.6b-bf16', 'bf16'),
      candidate('qwen-image-edit-reference', 'QUALITY_REFERENCE', 'Qwen/Qwen-Image-Edit', '6', '6', 'qwen-image-edit-bf16', 'bf16'),
    ],
    assets: [
      asset('person-reference', '7', {
        containsIdentifiablePerson: true,
        personConsent: 'DOCUMENTED',
        personConsentEvidenceSha256: H('c'),
      }),
      asset('garment-reference', '8'),
      asset('background-reference', '9'),
    ],
    cases: [
      {
        caseId: 't2i-realism-001',
        track: 'TEXT_TO_IMAGE',
        promptUtf8: t2iPrompt,
        promptSha256: await promptSha(t2iPrompt),
        inputAssetIds: [],
        referenceAssetIds: [],
        dimensions: ['semantic-adherence', 'anatomy-artifact-rate', 'garment-logo-pattern-preservation'],
      },
      {
        caseId: 'single-edit-identity-001',
        track: 'SINGLE_IMAGE_EDIT',
        promptUtf8: editPrompt,
        promptSha256: await promptSha(editPrompt),
        inputAssetIds: ['person-reference'],
        referenceAssetIds: ['background-reference'],
        dimensions: ['identity-preservation', 'non-target-preservation', 'semantic-adherence', 'anatomy-artifact-rate'],
      },
      {
        caseId: 'multi-ref-tryon-001',
        track: 'MULTI_REFERENCE_EDIT',
        promptUtf8: multiPrompt,
        promptSha256: await promptSha(multiPrompt),
        inputAssetIds: ['person-reference'],
        referenceAssetIds: ['garment-reference'],
        dimensions: ['identity-preservation', 'garment-logo-pattern-preservation', 'non-target-preservation', 'semantic-adherence', 'anatomy-artifact-rate'],
      },
    ],
    dimensionPolicies: [
      {
        dimensionId: 'identity-preservation',
        maxLossMicrounits: 50_000,
        scoringMode: 'BLINDED_HUMAN_LOSS',
        reviewMode: 'BLINDED_HUMAN',
        referenceCandidateId: 'qwen-image-edit-reference',
      },
      {
        dimensionId: 'garment-logo-pattern-preservation',
        maxLossMicrounits: 50_000,
        scoringMode: 'HYBRID_MAX_LOSS',
        reviewMode: 'HYBRID',
        referenceCandidateId: 'qwen-image-edit-reference',
      },
      {
        dimensionId: 'non-target-preservation',
        maxLossMicrounits: 40_000,
        scoringMode: 'HYBRID_MAX_LOSS',
        reviewMode: 'HYBRID',
        referenceCandidateId: 'qwen-image-edit-reference',
      },
      {
        dimensionId: 'semantic-adherence',
        maxLossMicrounits: 50_000,
        scoringMode: 'HYBRID_MAX_LOSS',
        reviewMode: 'HYBRID',
        referenceCandidateId: 'qwen-image-edit-reference',
      },
      {
        dimensionId: 'anatomy-artifact-rate',
        maxLossMicrounits: 20_000,
        scoringMode: 'BLINDED_HUMAN_LOSS',
        reviewMode: 'BLINDED_HUMAN',
        referenceCandidateId: 'qwen-image-edit-reference',
      },
    ],
    automatedMetricPolicies: [
      {
        metricId: 'garment-structure-support-v1',
        dimensionId: 'garment-logo-pattern-preservation',
        methodId: 'pinned-garment-structure-support',
        toolchainSha256: H('d'),
        policySha256: H('e'),
      },
      {
        metricId: 'non-target-region-support-v1',
        dimensionId: 'non-target-preservation',
        methodId: 'pinned-region-similarity-support',
        toolchainSha256: H('f'),
        policySha256: H('a'),
      },
      {
        metricId: 'semantic-support-v1',
        dimensionId: 'semantic-adherence',
        methodId: 'pinned-semantic-support',
        toolchainSha256: H('b'),
        policySha256: H('c'),
      },
    ],
    blindedRubric: {
      blindingMode: 'CANDIDATE_AND_EFFICIENCY_HIDDEN',
      randomizedPresentation: true,
      randomizationSeedSha256: H('d'),
      candidateIdentityVisibleToReviewer: false,
      efficiencyIdentityVisibleToReviewer: false,
      sourceAndReferenceVisibleAsCaseRequires: true,
      independentDimensionScoring: true,
      rubricDocumentSha256: H('e'),
      panelPolicySha256: H('f'),
    },
    outputsObserved: false,
    postObservationPolicyChangesAllowed: false,
    candidateSpecificPromptOverridesAllowed: false,
    benchmarkInputsTrainingAllowed: false,
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    billingAuthorityGranted: false,
    projectArtifactMutationAllowed: false,
    durableModelFleetAuthorityGranted: false,
    aeeExecutionAuthorityGranted: false,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

async function expectAsyncCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code, `expected ${code}`);
}

test('fixture locks multiple family variants before outputs and produces four canonical evidence digests', async () => {
  const raw = await fixture();
  const evidence = await proveHsmeFoundationQualityFixtureV1(raw, hashPort);
  assert.equal(evidence.qualityPolicy, 'QUALITY_FLOOR_BEFORE_EFFICIENCY');
  assert.equal(evidence.candidateCount, 6);
  assert.equal(evidence.assetCount, 3);
  assert.equal(evidence.caseCount, 3);
  assert.deepEqual(evidence.tracks, ['TEXT_TO_IMAGE', 'SINGLE_IMAGE_EDIT', 'MULTI_REFERENCE_EDIT']);
  assert.deepEqual(evidence.dimensionPriority, hardDimensions);
  for (const value of [
    evidence.candidateLockSha256,
    evidence.fixtureSetSha256,
    evidence.benchmarkPolicySha256,
    evidence.blindedRubricSha256,
  ]) assert.match(value, /^[0-9a-f]{64}$/);
});

test('derived lower-precision representation must bind a parent already in the frozen candidate lock', async () => {
  const raw = await fixture();
  raw.candidates.find(value => value.candidateId === 'flux2-klein-base-4b-fp8').derivedFromContentSha256 = H('0');
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(raw),
    'hsme_foundation_fixture_derived_parent_missing',
  );
});

test('candidate set mutation changes the candidate-lock digest even when the benchmark fixture is otherwise identical', async () => {
  const left = await proveHsmeFoundationQualityFixtureV1(await fixture(), hashPort);
  const changed = await fixture();
  changed.candidates = changed.candidates.filter(value => value.candidateId !== 'sana-sprint-1.6b-bf16');
  const right = await proveHsmeFoundationQualityFixtureV1(changed, hashPort);
  assert.notEqual(left.candidateLockSha256, right.candidateLockSha256);
  assert.equal(left.fixtureSetSha256, right.fixtureSetSha256);
});

test('outputs cannot already be observed when the benchmark policy is admitted', async () => {
  const raw = await fixture();
  raw.outputsObserved = true;
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(raw),
    'hsme_foundation_fixture_outputs_already_observed',
  );
});

test('post-observation policy changes and candidate-specific prompt tuning are forbidden', async () => {
  const post = await fixture();
  post.postObservationPolicyChangesAllowed = true;
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(post),
    'hsme_foundation_fixture_post_observation_mutation_forbidden',
  );

  const promptOverride = await fixture();
  promptOverride.candidateSpecificPromptOverridesAllowed = true;
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(promptOverride),
    'hsme_foundation_fixture_candidate_prompt_override_forbidden',
  );
});

test('benchmark assets cannot be admitted for training use', async () => {
  const raw = await fixture();
  raw.assets[0].trainingAllowed = true;
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(raw),
    'hsme_foundation_fixture_asset_training_use_forbidden',
  );
});

test('unresolved asset rights cannot enter the benchmark fixture', async () => {
  const raw = await fixture();
  raw.assets[1].licenseConclusion = 'REVIEW_REQUIRED';
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(raw),
    'hsme_foundation_fixture_asset_rights_not_admitted',
  );
});

test('identifiable-person fixture requires documented consent evidence', async () => {
  const raw = await fixture();
  raw.assets[0].personConsent = 'BLOCKED';
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(raw),
    'hsme_foundation_fixture_person_consent_required',
  );

  const missingEvidence = await fixture();
  missingEvidence.assets[0].personConsentEvidenceSha256 = 'NOT_APPLICABLE';
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(missingEvidence),
    'hsme_foundation_fixture_hash_invalid',
  );
});

test('blinded review cannot expose candidate identity or efficiency identity', async () => {
  const candidateVisible = await fixture();
  candidateVisible.blindedRubric.candidateIdentityVisibleToReviewer = true;
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(candidateVisible),
    'hsme_foundation_fixture_candidate_blinding_required',
  );

  const efficiencyVisible = await fixture();
  efficiencyVisible.blindedRubric.efficiencyIdentityVisibleToReviewer = true;
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(efficiencyVisible),
    'hsme_foundation_fixture_efficiency_blinding_required',
  );
});

test('all three benchmark tracks are mandatory', async () => {
  const raw = await fixture();
  raw.cases = raw.cases.filter(value => value.track !== 'MULTI_REFERENCE_EDIT');
  const replacement = structuredClone(raw.cases[0]);
  replacement.caseId = 't2i-extra-002';
  replacement.promptUtf8 = 'A second canonical text-to-image case.';
  replacement.promptSha256 = await promptSha(replacement.promptUtf8);
  raw.cases.push(replacement);
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(raw),
    'hsme_foundation_fixture_track_missing',
  );
});

test('all five hard quality dimensions must remain in the predeclared ordered policy', async () => {
  const raw = await fixture();
  const index = raw.dimensionPolicies.findIndex(value => value.dimensionId === 'identity-preservation');
  raw.dimensionPolicies[index] = {
    dimensionId: 'material-realism',
    maxLossMicrounits: 50_000,
    scoringMode: 'BLINDED_HUMAN_LOSS',
    reviewMode: 'BLINDED_HUMAN',
    referenceCandidateId: 'qwen-image-edit-reference',
  };
  for (const testCase of raw.cases) {
    testCase.dimensions = testCase.dimensions.map(value =>
      value === 'identity-preservation' ? 'material-realism' : value,
    );
  }
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(raw),
    'hsme_foundation_fixture_mandatory_dimension_missing',
  );
});

test('prompt content is cryptographically bound before benchmark outputs', async () => {
  const raw = await fixture();
  raw.cases[0].promptUtf8 += ' changed after lock';
  await expectAsyncCode(
    proveHsmeFoundationQualityFixtureV1(raw, hashPort),
    'hsme_foundation_fixture_prompt_digest_mismatch',
  );
});

test('automated and hybrid quality dimensions require a pinned automated metric policy', async () => {
  const raw = await fixture();
  raw.automatedMetricPolicies = raw.automatedMetricPolicies.filter(
    value => value.dimensionId !== 'semantic-adherence',
  );
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(raw),
    'hsme_foundation_fixture_metric_missing',
  );
});

test('reference candidate for every dimension must be a locked quality-reference candidate', async () => {
  const raw = await fixture();
  raw.dimensionPolicies[0].referenceCandidateId = 'flux2-klein-base-4b-bf16';
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(raw),
    'hsme_foundation_fixture_reference_role_invalid',
  );
});

test('track-specific input rules are fail closed', async () => {
  const t2i = await fixture();
  t2i.cases.find(value => value.track === 'TEXT_TO_IMAGE').inputAssetIds = ['person-reference'];
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(t2i),
    'hsme_foundation_fixture_t2i_input_forbidden',
  );

  const single = await fixture();
  single.cases.find(value => value.track === 'SINGLE_IMAGE_EDIT').inputAssetIds = [];
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(single),
    'hsme_foundation_fixture_single_edit_input_invalid',
  );

  const multi = await fixture();
  const multiCase = multi.cases.find(value => value.track === 'MULTI_REFERENCE_EDIT');
  multiCase.inputAssetIds = ['person-reference'];
  multiCase.referenceAssetIds = [];
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(multi),
    'hsme_foundation_fixture_multi_reference_input_invalid',
  );
});

test('fixture normalization is canonical for unordered candidate, asset, case and metric collections', async () => {
  const left = await proveHsmeFoundationQualityFixtureV1(await fixture(), hashPort);
  const changed = await fixture();
  changed.candidates.reverse();
  changed.assets.reverse();
  changed.cases.reverse();
  changed.automatedMetricPolicies.reverse();
  const right = await proveHsmeFoundationQualityFixtureV1(changed, hashPort);
  assert.deepEqual(right, left);
});

test('dimension order is meaningful and changes benchmark-policy digest', async () => {
  const left = await proveHsmeFoundationQualityFixtureV1(await fixture(), hashPort);
  const changed = await fixture();
  [changed.dimensionPolicies[0], changed.dimensionPolicies[1]] = [
    changed.dimensionPolicies[1],
    changed.dimensionPolicies[0],
  ];
  const right = await proveHsmeFoundationQualityFixtureV1(changed, hashPort);
  assert.notEqual(right.benchmarkPolicySha256, left.benchmarkPolicySha256);
  assert.notDeepEqual(right.dimensionPriority, left.dimensionPriority);
});

test('aggregate score and efficiency fields are structurally forbidden from the pre-output quality plan', async () => {
  const aggregate = await fixture();
  aggregate.aggregateScore = 99;
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(aggregate),
    'hsme_foundation_fixture_field_unknown',
  );

  const efficiency = await fixture();
  efficiency.latencyBudgetMs = 200;
  expectCode(
    () => normalizeHsmeFoundationQualityFixtureV1(efficiency),
    'hsme_foundation_fixture_field_unknown',
  );
});

test('benchmark fixture cannot grant product or execution authority', async () => {
  for (const [field, code] of [
    ['productionAuthorityGranted', 'hsme_foundation_fixture_production_authority_forbidden'],
    ['providerAuthorityGranted', 'hsme_foundation_fixture_provider_authority_forbidden'],
    ['billingAuthorityGranted', 'hsme_foundation_fixture_billing_authority_forbidden'],
    ['projectArtifactMutationAllowed', 'hsme_foundation_fixture_project_mutation_forbidden'],
    ['durableModelFleetAuthorityGranted', 'hsme_foundation_fixture_fleet_authority_forbidden'],
    ['aeeExecutionAuthorityGranted', 'hsme_foundation_fixture_aee_authority_forbidden'],
  ]) {
    const raw = await fixture();
    raw[field] = true;
    expectCode(() => normalizeHsmeFoundationQualityFixtureV1(raw), code);
  }
});
