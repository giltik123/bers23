import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  HSME_FOUNDATION_BENCHMARK_MANIFEST_V1_SCHEMA,
  hsmeFoundationBenchmarkManifestV1Digest,
  normalizeHsmeFoundationBenchmarkManifestV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkManifestV1.ts';

const H = c => c.repeat(64);
const R = c => c.repeat(40);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

const dimensions = [
  'identity-preservation',
  'garment-logo-pattern-preservation',
  'non-target-preservation',
  'semantic-adherence',
  'anatomy-artifact-rate',
];

function candidate(id, roles, root, rev, hash, capabilities, mode = 'ZERO_TRAINING') {
  return {
    candidateId: id,
    roles,
    sourceRoot: root,
    immutableRevision: R(rev),
    modelContentSha256: H(hash),
    capabilities,
    executionProfileSha256: H('e'),
    licenseState: 'REVIEW_REQUIRED',
    licenseEvidenceSha256: H('f'),
    benchmarkMode: mode,
  };
}

function manifest() {
  return {
    schemaVersion: HSME_FOUNDATION_BENCHMARK_MANIFEST_V1_SCHEMA,
    qualityPolicy: 'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    fixtureSetSha256: H('1'),
    fixturePolicySha256: H('2'),
    promptInputSetSha256: H('3'),
    blindedReviewRubricSha256: H('4'),
    deterministicInputPolicySha256: H('5'),
    outputSetContractSha256: H('6'),
    requiredCapabilities: ['TEXT_TO_IMAGE', 'IMAGE_EDITING', 'MULTI_REFERENCE_EDITING'],
    candidates: [
      candidate('tiny-sd-control', ['CONTROL_BASELINE'], 'segmind/tiny-sd', '1', 'a', ['TEXT_TO_IMAGE']),
      candidate('flux2-klein-direct', ['DIRECT_FOUNDATION'], 'black-forest-labs/FLUX.2-klein-4B', '2', 'b', ['TEXT_TO_IMAGE', 'IMAGE_EDITING', 'MULTI_REFERENCE_EDITING']),
      candidate('sana-sprint-mobile-reuse', ['MOBILE_REUSE'], 'Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers', '3', 'c', ['TEXT_TO_IMAGE']),
      candidate('qwen-image-edit-reference', ['QUALITY_REFERENCE'], 'Qwen/Qwen-Image-Edit', '4', 'd', ['IMAGE_EDITING', 'MULTI_REFERENCE_EDITING']),
    ],
    dimensions: dimensions.map((dimensionId, index) => ({
      dimensionId,
      referenceCandidateId: 'qwen-image-edit-reference',
      maxLossMicrounits: index === 4 ? 20 : 50,
      reviewMode: index < 3 ? 'BLINDED_HUMAN' : 'HYBRID',
    })),
    postObservationCandidateChangesAllowed: false,
    postObservationThresholdChangesAllowed: false,
    postObservationDimensionOrderChangesAllowed: false,
    postObservationReferenceChangesAllowed: false,
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    billingAuthorityGranted: false,
    projectArtifactMutationAllowed: false,
    aeeExecutionAuthorityGranted: false,
    trainingOrDistillationAllowed: false,
  };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

test('manifest binds four comparison roles and quality-first policy before outputs exist', () => {
  const value = normalizeHsmeFoundationBenchmarkManifestV1(manifest());
  assert.equal(value.qualityPolicy, 'QUALITY_FLOOR_BEFORE_EFFICIENCY');
  assert.deepEqual(value.candidates.map(x => x.candidateId), [
    'flux2-klein-direct',
    'qwen-image-edit-reference',
    'sana-sprint-mobile-reuse',
    'tiny-sd-control',
  ]);
  assert.deepEqual(value.dimensions.map(x => x.dimensionId), dimensions);
});

test('every canonical hard dimension is mandatory even when count stays valid', () => {
  const raw = manifest();
  raw.dimensions[0] = {
    dimensionId: 'material-realism',
    referenceCandidateId: 'qwen-image-edit-reference',
    maxLossMicrounits: 50,
    reviewMode: 'BLINDED_HUMAN',
  };
  expectCode(
    () => normalizeHsmeFoundationBenchmarkManifestV1(raw),
    'hsme_foundation_benchmark_manifest_required_dimension_missing',
  );
});

test('reference ids must name candidates explicitly marked QUALITY_REFERENCE', () => {
  const raw = manifest();
  raw.dimensions[0].referenceCandidateId = 'flux2-klein-direct';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkManifestV1(raw),
    'hsme_foundation_benchmark_manifest_reference_role_invalid',
  );
});

test('all four candidate roles are structurally required', () => {
  const raw = manifest();
  raw.candidates[3].roles = ['CONTROL_BASELINE'];
  expectCode(
    () => normalizeHsmeFoundationBenchmarkManifestV1(raw),
    'hsme_foundation_benchmark_manifest_role_missing',
  );
});

test('immutable revisions and exact model content digests are required', () => {
  const badRevision = manifest();
  badRevision.candidates[1].immutableRevision = 'main';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkManifestV1(badRevision),
    'hsme_foundation_benchmark_manifest_revision_invalid',
  );

  const badHash = manifest();
  badHash.candidates[1].modelContentSha256 = 'UNKNOWN';
  expectCode(
    () => normalizeHsmeFoundationBenchmarkManifestV1(badHash),
    'hsme_foundation_benchmark_manifest_hash_invalid',
  );
});

test('post-observation candidate, threshold, order and reference mutation is forbidden', () => {
  for (const flag of [
    'postObservationCandidateChangesAllowed',
    'postObservationThresholdChangesAllowed',
    'postObservationDimensionOrderChangesAllowed',
    'postObservationReferenceChangesAllowed',
  ]) {
    const raw = manifest();
    raw[flag] = true;
    expectCode(
      () => normalizeHsmeFoundationBenchmarkManifestV1(raw),
      'hsme_foundation_benchmark_manifest_authority_or_mutation_invalid',
    );
  }
});

test('production, provider, billing, project, AEE and training authority are all false', () => {
  for (const flag of [
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'trainingOrDistillationAllowed',
  ]) {
    const raw = manifest();
    raw[flag] = true;
    expectCode(
      () => normalizeHsmeFoundationBenchmarkManifestV1(raw),
      'hsme_foundation_benchmark_manifest_authority_or_mutation_invalid',
    );
  }
});

test('candidate ordering is canonical but dimension priority remains digest-significant', async () => {
  const left = manifest();
  const candidateReordered = manifest();
  candidateReordered.candidates.reverse();
  assert.equal(
    await hsmeFoundationBenchmarkManifestV1Digest(left, hashPort),
    await hsmeFoundationBenchmarkManifestV1Digest(candidateReordered, hashPort),
  );

  const dimensionReordered = manifest();
  [dimensionReordered.dimensions[0], dimensionReordered.dimensions[1]] = [
    dimensionReordered.dimensions[1],
    dimensionReordered.dimensions[0],
  ];
  assert.notEqual(
    await hsmeFoundationBenchmarkManifestV1Digest(left, hashPort),
    await hsmeFoundationBenchmarkManifestV1Digest(dimensionReordered, hashPort),
  );
});

test('caller cannot inject observed scores or efficiency fields into the pre-observation manifest', () => {
  const raw = manifest();
  raw.observedScores = {};
  expectCode(
    () => normalizeHsmeFoundationBenchmarkManifestV1(raw),
    'hsme_foundation_benchmark_manifest_field_unknown',
  );

  const raw2 = manifest();
  raw2.installedBytes = 1;
  expectCode(
    () => normalizeHsmeFoundationBenchmarkManifestV1(raw2),
    'hsme_foundation_benchmark_manifest_field_unknown',
  );
});
