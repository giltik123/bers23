import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  HSME_CORPUS_ROOT_V1_SCHEMA,
  HSME_CORPUS_SHARD_V1_SCHEMA,
  HSME_QUALITY_POLICY_V1,
  HSME_SYNTHETIC_SAMPLE_V1_SCHEMA,
  HSME_TRAINING_CHECKPOINT_V1_SCHEMA,
  HSME_TRAINING_PROVENANCE_V1_SCHEMA,
  HSME_TRAINING_RECIPE_V1_SCHEMA,
  hsmeTrainingProvenanceDigestV1,
  normalizeHsmeCorpusRootV1,
  normalizeHsmeCorpusShardV1,
  normalizeHsmeSyntheticSampleV1,
  normalizeHsmeTeacherDecisionV1,
  normalizeHsmeTrainingRecipeV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTrainingProvenanceV1.ts';
import {
  HSME_TRAINING_REPRODUCTION_GATE_V1_SCHEMA,
  proveHsmeTrainingReproductionFixtureV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTrainingReproductionGateV1.ts';

const H = char => char.repeat(64);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

async function makeFixture() {
  const teacherDecision = normalizeHsmeTeacherDecisionV1({
    schemaVersion: HSME_TRAINING_PROVENANCE_V1_SCHEMA,
    decisionStatus: 'TEACHER_SET_ADMITTED',
    candidates: [
      {
        candidateId: 'teacher-a', modelId: 'fixture/teacher-a', architectureFamily: 'DIT',
        immutableRevision: H('1'), contentSha256: H('2'), checkpointBytes: 8_000_000_000,
        licenseId: 'Apache-2.0', licenseConclusion: 'COMMERCIAL_ADMISSIBLE', distillationOutputUse: 'DISTILLATION_ALLOWED',
        licenseEvidenceSha256: H('3'), toolchainEvidenceSha256: H('4'), installedBytes: 8_000_000_000, workingMemoryBytes: 12_000_000_000,
        qualityDomain: ['identity-preservation', 'semantic-adherence'], knownWeaknesses: ['fixture-only'],
      },
      {
        candidateId: 'teacher-b', modelId: 'fixture/teacher-b', architectureFamily: 'FLOW_DIT',
        licenseId: 'Apache-2.0', licenseConclusion: 'REVIEW_REQUIRED', distillationOutputUse: 'REVIEW_REQUIRED',
        installedBytes: 'UNKNOWN', workingMemoryBytes: 'UNKNOWN', qualityDomain: ['semantic-adherence'], knownWeaknesses: ['rights-unresolved'],
      },
      {
        candidateId: 'teacher-c', modelId: 'fixture/teacher-c', architectureFamily: 'DIT',
        licenseId: 'OTHER', licenseConclusion: 'REJECTED', distillationOutputUse: 'PROHIBITED',
        installedBytes: 'UNKNOWN', workingMemoryBytes: 'UNKNOWN', qualityDomain: ['speed'], knownWeaknesses: ['license-chain'],
      },
    ],
    selectedCandidateIds: ['teacher-a'],
    rationale: ['bounded deterministic fixture uses only the fully admitted teacher'],
  });
  const teacherDecisionDigest = await hsmeTrainingProvenanceDigestV1(teacherDecision, hashPort);

  const corpusShard = normalizeHsmeCorpusShardV1({
    schemaVersion: HSME_CORPUS_SHARD_V1_SCHEMA,
    shardId: 'fixture-shard-0001',
    assets: [
      {
        contentSha256: H('5'), sourceRef: 'fixture:licensed:asset-1@immutable', sourceClass: 'REAL_LICENSED',
        licenseId: 'CC-BY-4.0', licenseEvidenceSha256: H('6'), rightsConclusion: 'ADMITTED', attribution: 'Fixture Creator', split: 'TRAIN',
        deduplicationKeySha256: H('7'), preprocessingSha256: H('8'), promptOrCaptionSha256: H('9'),
      },
      {
        contentSha256: H('a'), sourceRef: 'fixture:unknown:asset-2@immutable', sourceClass: 'REAL_LICENSED',
        licenseId: 'UNKNOWN', licenseEvidenceSha256: H('b'), rightsConclusion: 'REJECTED', attribution: 'Unknown', split: 'VALIDATION',
        deduplicationKeySha256: H('c'), preprocessingSha256: H('d'), promptOrCaptionSha256: H('e'), exclusionReason: 'rights-unknown',
      },
    ],
  });
  const shardDigest = await hsmeTrainingProvenanceDigestV1(corpusShard, hashPort);
  const corpusRoot = normalizeHsmeCorpusRootV1({
    schemaVersion: HSME_CORPUS_ROOT_V1_SCHEMA,
    corpusId: 'fixture-corpus-v1', shardDigests: [shardDigest], admittedAssetCount: 1, rejectedAssetCount: 1, corpusPolicySha256: H('f'),
  });
  const corpusRootDigest = await hsmeTrainingProvenanceDigestV1(corpusRoot, hashPort);

  const syntheticSample = normalizeHsmeSyntheticSampleV1({
    schemaVersion: HSME_SYNTHETIC_SAMPLE_V1_SCHEMA,
    teacherDecisionDigest, teacherCandidateId: 'teacher-a', inputSha256: H('1'), promptSha256: H('2'), seed: 42,
    sampler: 'euler', scheduler: 'flow-match-v1', stepCount: 4, guidance: '1.0', precision: 'bf16',
    runtimeRepresentationSha256: H('3'), outputSha256: H('4'), filterPolicySha256: H('5'), filterDecision: 'ADMITTED',
  });
  const syntheticSampleDigest = await hsmeTrainingProvenanceDigestV1(syntheticSample, hashPort);

  const recipe = normalizeHsmeTrainingRecipeV1({
    schemaVersion: HSME_TRAINING_RECIPE_V1_SCHEMA,
    recipeId: 'fixture-dense-student-v1', studentArchitectureSha256: H('6'), latentAutoencoderBindingSha256: H('7'), textConditionerBindingSha256: H('8'),
    initializationSha256: H('9'), objectiveSha256: H('a'), optimizerSha256: H('b'), scheduleSha256: H('c'), preprocessingSha256: H('d'),
    teacherDecisionDigest, corpusRootDigest, syntheticPolicySha256: H('e'), toolchainLockSha256: H('f'), seedRootSha256: H('1'),
    determinismMode: 'BITWISE_WHERE_SUPPORTED',
    qualityGate: { policy: HSME_QUALITY_POLICY_V1, referenceEvidenceSha256: H('2'), requiredMetrics: ['semantic-adherence','identity-preservation','garment-logo-pattern-preservation','anatomy-artifact-rate'] },
    resourcePolicy: { policy: 'INDEPENDENT_STORAGE_AND_WORKING_MEMORY', efficiencyEvidenceSha256: H('3') },
  });
  const recipeDigest = await hsmeTrainingProvenanceDigestV1(recipe, hashPort);

  const checkpoint = {
    schemaVersion: HSME_TRAINING_CHECKPOINT_V1_SCHEMA, checkpointSha256: H('4'), checkpointBytes: 600_000_000, globalStep: 10,
    teacherDecisionDigest, corpusRootDigest, recipeDigest, qualityEvidenceSha256: H('5'), resourceEvidenceSha256: H('6'),
    qualityGatePassed: true, status: 'TRAINING_CANDIDATE',
  };
  const resumeCheckpoint = {
    ...checkpoint, checkpointSha256: H('7'), checkpointBytes: 601_000_000, globalStep: 20, parentCheckpointSha256: checkpoint.checkpointSha256,
  };

  return {
    schemaVersion: HSME_TRAINING_REPRODUCTION_GATE_V1_SCHEMA,
    teacherDecision,
    corpusShards: [corpusShard],
    corpusRoot,
    syntheticSamples: [syntheticSample],
    recipe,
    checkpoint,
    resumeCheckpoint,
    deterministicTargetReproduction: [{ syntheticSampleDigest, reproducedOutputSha256: syntheticSample.outputSha256 }],
  };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code, `expected ${code}`);
}

test('bounded fixture binds teacher, corpus shards, recipe, deterministic target and resume checkpoint', async () => {
  const evidence = await proveHsmeTrainingReproductionFixtureV1(await makeFixture(), hashPort);
  assert.equal(evidence.schemaVersion, HSME_TRAINING_REPRODUCTION_GATE_V1_SCHEMA);
  assert.equal(evidence.corpusShardDigests.length, 1);
  assert.equal(evidence.deterministicTargetCount, 1);
  assert.equal(evidence.resumeCheckpointSha256, H('7'));
});

test('corpus root cannot claim a shard set different from the supplied content-addressed shards', async () => {
  const fixture = structuredClone(await makeFixture());
  fixture.corpusRoot.shardDigests = [H('0')];
  await expectCode(proveHsmeTrainingReproductionFixtureV1(fixture, hashPort), 'hsme_reproduction_corpus_root_mismatch');
});

test('corpus-wide deduplication rejects duplicate asset identity across different shards', async () => {
  const fixture = structuredClone(await makeFixture());
  const duplicateShard = structuredClone(fixture.corpusShards[0]);
  duplicateShard.shardId = 'fixture-shard-0002';
  duplicateShard.assets = [structuredClone(duplicateShard.assets[0])];
  fixture.corpusShards.push(duplicateShard);
  await expectCode(proveHsmeTrainingReproductionFixtureV1(fixture, hashPort), 'hsme_reproduction_asset_duplicate');
});

test('resume cannot silently change teacher, corpus or recipe identity', async () => {
  const fixture = structuredClone(await makeFixture());
  fixture.resumeCheckpoint.corpusRootDigest = H('0');
  await expectCode(proveHsmeTrainingReproductionFixtureV1(fixture, hashPort), 'hsme_reproduction_resume_identity_mismatch');
});

test('bitwise-capable deterministic teacher target must reproduce identical output bytes', async () => {
  const fixture = structuredClone(await makeFixture());
  fixture.deterministicTargetReproduction[0].reproducedOutputSha256 = H('0');
  await expectCode(proveHsmeTrainingReproductionFixtureV1(fixture, hashPort), 'hsme_reproduction_target_hash_mismatch');
});

test('target replay evidence is bound to the full synthetic-sample identity, not output hash alone', async () => {
  const fixture = structuredClone(await makeFixture());
  fixture.syntheticSamples[0].seed = 43;
  await expectCode(proveHsmeTrainingReproductionFixtureV1(fixture, hashPort), 'hsme_reproduction_target_unknown');
});

test('bounded gate refuses a teacher decision that is not actually admitted', async () => {
  const fixture = structuredClone(await makeFixture());
  fixture.teacherDecision.decisionStatus = 'REDESIGN_REQUIRED';
  fixture.teacherDecision.selectedCandidateIds = [];
  await expectCode(proveHsmeTrainingReproductionFixtureV1(fixture, hashPort), 'hsme_reproduction_teacher_not_admitted');
});
