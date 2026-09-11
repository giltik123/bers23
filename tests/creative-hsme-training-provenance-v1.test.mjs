import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  HSME_CORPUS_ROOT_V1_SCHEMA,
  HSME_CORPUS_SHARD_V1_SCHEMA,
  HSME_QUALITY_POLICY_V1,
  HSME_SYNTHETIC_SAMPLE_V1_SCHEMA,
  HSME_TRAINING_CHECKPOINT_V1_SCHEMA,
  HSME_TRAINING_RECIPE_V1_SCHEMA,
  normalizeHsmeCorpusRootV1,
  normalizeHsmeCorpusShardV1,
  normalizeHsmeSyntheticSampleV1,
  normalizeHsmeTeacherDecisionV1,
  normalizeHsmeTrainingCheckpointV1,
  normalizeHsmeTrainingRecipeV1,
  hsmeTrainingProvenanceDigestV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTrainingProvenanceV1.ts';

const H = (char) => char.repeat(64);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

const fixtureDecision = async () => JSON.parse(await readFile(new URL('../src/platform/creative/local-ai/hsme/hsme-2b1-teacher-decision.json', import.meta.url), 'utf8'));

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

test('teacher comparison stays fail-closed until immutable pins and distillation rights are admitted', async () => {
  const decision = normalizeHsmeTeacherDecisionV1(await fixtureDecision());
  assert.equal(decision.decisionStatus, 'REDESIGN_REQUIRED');
  assert.equal(decision.candidates.length, 3);
  assert.deepEqual(decision.selectedCandidateIds, []);

  const attempted = structuredClone(await fixtureDecision());
  attempted.decisionStatus = 'TEACHER_SET_ADMITTED';
  attempted.selectedCandidateIds = ['flux1-schnell-teacher-reference'];
  expectCode(() => normalizeHsmeTeacherDecisionV1(attempted), 'hsme_teacher_rights_unresolved');
});

test('corpus provenance is asset-level, content-addressed and license fail-closed', async () => {
  const admitted = {
    contentSha256: H('1'), sourceRef: 'commons:asset:123@immutable', sourceClass: 'REAL_LICENSED',
    licenseId: 'CC-BY-4.0', licenseEvidenceSha256: H('2'), rightsConclusion: 'ADMITTED', attribution: 'Creator / source', split: 'TRAIN',
    deduplicationKeySha256: H('3'), preprocessingSha256: H('4'), promptOrCaptionSha256: H('5'),
  };
  const rejected = { ...admitted, contentSha256: H('6'), sourceRef: 'web:unknown:456', rightsConclusion: 'REJECTED', exclusionReason: 'rights-unknown', split: 'VALIDATION' };
  const shard = normalizeHsmeCorpusShardV1({ schemaVersion: HSME_CORPUS_SHARD_V1_SCHEMA, shardId: 'corpus-shard-0001', assets: [rejected, admitted] });
  assert.deepEqual(shard.assets.map(asset => asset.contentSha256), [H('1'), H('6')]);
  expectCode(() => normalizeHsmeCorpusShardV1({ schemaVersion: HSME_CORPUS_SHARD_V1_SCHEMA, shardId: 'bad', assets: [{ ...rejected, exclusionReason: undefined }] }), 'hsme_training_text_invalid');

  const shardDigest = await hsmeTrainingProvenanceDigestV1(shard, hashPort);
  const root = normalizeHsmeCorpusRootV1({ schemaVersion: HSME_CORPUS_ROOT_V1_SCHEMA, corpusId: 'bers-dense-training-v1', shardDigests: [shardDigest], admittedAssetCount: 1, rejectedAssetCount: 1, corpusPolicySha256: H('7') });
  assert.equal(root.admittedAssetCount, 1);
});

test('synthetic distillation identity binds teacher, input, prompt, seed, sampler, precision and output hash', () => {
  const sample = normalizeHsmeSyntheticSampleV1({
    schemaVersion: HSME_SYNTHETIC_SAMPLE_V1_SCHEMA, teacherDecisionDigest: H('1'), teacherCandidateId: 'teacher-a', inputSha256: H('2'), promptSha256: H('3'),
    seed: 42, sampler: 'euler', scheduler: 'flow-match-v1', stepCount: 4, guidance: '1.0', precision: 'bf16', runtimeRepresentationSha256: H('4'), outputSha256: H('5'), filterPolicySha256: H('6'), filterDecision: 'ADMITTED',
  });
  assert.equal(sample.seed, 42);
  assert.equal(sample.stepCount, 4);
});

test('training recipe requires quality floor before efficiency and independent dual budgets', () => {
  const recipe = normalizeHsmeTrainingRecipeV1({
    schemaVersion: HSME_TRAINING_RECIPE_V1_SCHEMA, recipeId: 'bers-dense-core-v1-recipe', studentArchitectureSha256: H('1'), latentAutoencoderBindingSha256: H('2'), textConditionerBindingSha256: H('3'), initializationSha256: H('4'), objectiveSha256: H('5'), optimizerSha256: H('6'), scheduleSha256: H('7'), preprocessingSha256: H('8'), teacherDecisionDigest: H('9'), corpusRootDigest: H('a'), syntheticPolicySha256: H('b'), toolchainLockSha256: H('c'), seedRootSha256: H('d'), determinismMode: 'BITWISE_WHERE_SUPPORTED',
    qualityGate: { policy: HSME_QUALITY_POLICY_V1, referenceEvidenceSha256: H('e'), requiredMetrics: ['semantic-adherence','identity-preservation','garment-logo-pattern-preservation','anatomy-artifact-rate'] },
    resourcePolicy: { policy: 'INDEPENDENT_STORAGE_AND_WORKING_MEMORY', efficiencyEvidenceSha256: H('f') },
  });
  assert.equal(recipe.qualityGate.policy, 'QUALITY_FLOOR_BEFORE_EFFICIENCY');

  const weakened = structuredClone(recipe);
  weakened.qualityGate.policy = 'SMALLEST_MODEL_WINS';
  expectCode(() => normalizeHsmeTrainingRecipeV1(weakened), 'hsme_quality_policy_invalid');
});

test('smaller or faster checkpoint cannot advance when the quality floor fails', () => {
  const base = {
    schemaVersion: HSME_TRAINING_CHECKPOINT_V1_SCHEMA, checkpointSha256: H('1'), checkpointBytes: 500_000_000, globalStep: 1000,
    teacherDecisionDigest: H('2'), corpusRootDigest: H('3'), recipeDigest: H('4'), qualityEvidenceSha256: H('5'), resourceEvidenceSha256: H('6'), qualityGatePassed: false, status: 'RND_ONLY',
  };
  assert.equal(normalizeHsmeTrainingCheckpointV1(base).status, 'RND_ONLY');
  expectCode(() => normalizeHsmeTrainingCheckpointV1({ ...base, checkpointBytes: 200_000_000, status: 'TRAINING_CANDIDATE' }), 'hsme_checkpoint_quality_gate_failed');
  assert.equal(normalizeHsmeTrainingCheckpointV1({ ...base, qualityGatePassed: true, status: 'TRAINING_CANDIDATE' }).status, 'TRAINING_CANDIDATE');
});

test('training provenance digest is deterministic and domain separated', async () => {
  const decision = normalizeHsmeTeacherDecisionV1(await fixtureDecision());
  const first = await hsmeTrainingProvenanceDigestV1(decision, hashPort);
  const second = await hsmeTrainingProvenanceDigestV1(structuredClone(decision), hashPort);
  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{64}$/);
});
