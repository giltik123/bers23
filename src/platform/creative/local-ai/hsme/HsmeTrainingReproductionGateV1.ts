import {
  type HsmeCorpusRootV1,
  type HsmeCorpusShardV1,
  type HsmeSyntheticSampleV1,
  type HsmeTeacherDecisionV1,
  type HsmeTrainingCheckpointV1,
  type HsmeTrainingHashPortV1,
  type HsmeTrainingRecipeV1,
  hsmeTrainingProvenanceDigestV1,
  normalizeHsmeCorpusRootV1,
  normalizeHsmeCorpusShardV1,
  normalizeHsmeSyntheticSampleV1,
  normalizeHsmeTeacherDecisionV1,
  normalizeHsmeTrainingCheckpointV1,
  normalizeHsmeTrainingRecipeV1,
} from './HsmeTrainingProvenanceV1';

export const HSME_TRAINING_REPRODUCTION_GATE_V1_SCHEMA = 'BERS_HSME_TRAINING_REPRODUCTION_GATE_V1' as const;

export type HsmeDeterministicTargetReproductionV1 = Readonly<{
  syntheticSampleDigest: string;
  reproducedOutputSha256: string;
}>;

export type HsmeTrainingReproductionFixtureV1 = Readonly<{
  schemaVersion: typeof HSME_TRAINING_REPRODUCTION_GATE_V1_SCHEMA;
  teacherDecision: HsmeTeacherDecisionV1;
  corpusShards: readonly HsmeCorpusShardV1[];
  corpusRoot: HsmeCorpusRootV1;
  syntheticSamples: readonly HsmeSyntheticSampleV1[];
  recipe: HsmeTrainingRecipeV1;
  checkpoint: HsmeTrainingCheckpointV1;
  resumeCheckpoint?: HsmeTrainingCheckpointV1;
  deterministicTargetReproduction: readonly HsmeDeterministicTargetReproductionV1[];
}>;

export type HsmeTrainingReproductionEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_TRAINING_REPRODUCTION_GATE_V1_SCHEMA;
  teacherDecisionDigest: string;
  corpusShardDigests: readonly string[];
  corpusRootDigest: string;
  recipeDigest: string;
  checkpointSha256: string;
  resumeCheckpointSha256?: string;
  deterministicTargetCount: number;
}>;

export class HsmeTrainingReproductionGateV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeTrainingReproductionGateV1Error';
    this.code = code;
  }
}

export async function proveHsmeTrainingReproductionFixtureV1(
  raw: HsmeTrainingReproductionFixtureV1,
  hashPort: HsmeTrainingHashPortV1,
): Promise<HsmeTrainingReproductionEvidenceV1> {
  if (!raw || typeof raw !== 'object' || raw.schemaVersion !== HSME_TRAINING_REPRODUCTION_GATE_V1_SCHEMA) {
    fail('hsme_reproduction_schema_invalid', 'reproduction fixture schema is unsupported');
  }

  const teacherDecision = normalizeHsmeTeacherDecisionV1(raw.teacherDecision);
  if (teacherDecision.decisionStatus !== 'TEACHER_SET_ADMITTED' || teacherDecision.selectedCandidateIds.length < 1) {
    fail('hsme_reproduction_teacher_not_admitted', 'bounded reproduction requires an admitted immutable teacher set');
  }
  const teacherDecisionDigest = await hsmeTrainingProvenanceDigestV1(teacherDecision, hashPort);

  if (!Array.isArray(raw.corpusShards) || raw.corpusShards.length < 1 || raw.corpusShards.length > 1024) {
    fail('hsme_reproduction_shard_count_invalid', 'bounded reproduction requires 1..1024 corpus shards');
  }
  const corpusShards = raw.corpusShards.map(normalizeHsmeCorpusShardV1);
  const seenAssetContent = new Set<string>();
  const seenDeduplicationKeys = new Set<string>();
  for (const shard of corpusShards) {
    for (const asset of shard.assets) {
      if (seenAssetContent.has(asset.contentSha256)) {
        fail('hsme_reproduction_asset_duplicate', 'asset content SHA must be unique across the entire corpus');
      }
      if (seenDeduplicationKeys.has(asset.deduplicationKeySha256)) {
        fail('hsme_reproduction_deduplication_key_duplicate', 'deduplication identity must be unique across the entire corpus');
      }
      seenAssetContent.add(asset.contentSha256);
      seenDeduplicationKeys.add(asset.deduplicationKeySha256);
    }
  }
  const corpusShardDigests = Object.freeze((await Promise.all(
    corpusShards.map(shard => hsmeTrainingProvenanceDigestV1(shard, hashPort)),
  )).sort(lexical));
  if (new Set(corpusShardDigests).size !== corpusShardDigests.length) {
    fail('hsme_reproduction_shard_duplicate', 'corpus shard digests must be unique');
  }

  const corpusRoot = normalizeHsmeCorpusRootV1(raw.corpusRoot);
  if (!sameStrings(corpusRoot.shardDigests, corpusShardDigests)) {
    fail('hsme_reproduction_corpus_root_mismatch', 'corpus root does not bind exactly the supplied shard set');
  }
  const admittedAssetCount = corpusShards.reduce(
    (sum, shard) => sum + shard.assets.filter(asset => asset.rightsConclusion === 'ADMITTED').length,
    0,
  );
  const rejectedAssetCount = corpusShards.reduce(
    (sum, shard) => sum + shard.assets.filter(asset => asset.rightsConclusion === 'REJECTED').length,
    0,
  );
  if (corpusRoot.admittedAssetCount !== admittedAssetCount || corpusRoot.rejectedAssetCount !== rejectedAssetCount) {
    fail('hsme_reproduction_corpus_count_mismatch', 'corpus root asset counts do not match supplied shards');
  }
  const corpusRootDigest = await hsmeTrainingProvenanceDigestV1(corpusRoot, hashPort);

  if (!Array.isArray(raw.syntheticSamples) || raw.syntheticSamples.length < 1 || raw.syntheticSamples.length > 10000) {
    fail('hsme_reproduction_sample_count_invalid', 'bounded reproduction requires 1..10000 synthetic samples');
  }
  const syntheticSamples = raw.syntheticSamples.map(normalizeHsmeSyntheticSampleV1);
  const selectedTeachers = new Set(teacherDecision.selectedCandidateIds);
  for (const sample of syntheticSamples) {
    if (sample.teacherDecisionDigest !== teacherDecisionDigest || !selectedTeachers.has(sample.teacherCandidateId)) {
      fail('hsme_reproduction_sample_teacher_mismatch', 'synthetic sample is not bound to the admitted teacher decision');
    }
  }
  const syntheticSampleDigests = await Promise.all(
    syntheticSamples.map(sample => hsmeTrainingProvenanceDigestV1(sample, hashPort)),
  );
  if (new Set(syntheticSampleDigests).size !== syntheticSampleDigests.length) {
    fail('hsme_reproduction_sample_duplicate', 'synthetic sample identity must be unique');
  }
  const sampleOutputByDigest = new Map<string, string>();
  syntheticSampleDigests.forEach((digest, index) => sampleOutputByDigest.set(digest, syntheticSamples[index].outputSha256));

  const recipe = normalizeHsmeTrainingRecipeV1(raw.recipe);
  if (recipe.teacherDecisionDigest !== teacherDecisionDigest || recipe.corpusRootDigest !== corpusRootDigest) {
    fail('hsme_reproduction_recipe_identity_mismatch', 'training recipe does not bind the supplied teacher and corpus identities');
  }
  const recipeDigest = await hsmeTrainingProvenanceDigestV1(recipe, hashPort);

  const checkpoint = normalizeHsmeTrainingCheckpointV1(raw.checkpoint);
  assertCheckpointIdentity(checkpoint, teacherDecisionDigest, corpusRootDigest, recipeDigest, 'checkpoint');

  let resumeCheckpoint: HsmeTrainingCheckpointV1 | undefined;
  if (raw.resumeCheckpoint !== undefined) {
    resumeCheckpoint = normalizeHsmeTrainingCheckpointV1(raw.resumeCheckpoint);
    assertCheckpointIdentity(resumeCheckpoint, teacherDecisionDigest, corpusRootDigest, recipeDigest, 'resume checkpoint');
    if (resumeCheckpoint.parentCheckpointSha256 !== checkpoint.checkpointSha256) {
      fail('hsme_reproduction_resume_parent_mismatch', 'resume checkpoint must bind the exact parent checkpoint bytes');
    }
    if (resumeCheckpoint.globalStep <= checkpoint.globalStep) {
      fail('hsme_reproduction_resume_step_invalid', 'resume checkpoint must advance globalStep');
    }
  }

  if (!Array.isArray(raw.deterministicTargetReproduction)) {
    fail('hsme_reproduction_target_evidence_invalid', 'deterministic target reproduction must be an array');
  }
  if (recipe.determinismMode === 'BITWISE_WHERE_SUPPORTED' && raw.deterministicTargetReproduction.length < 1) {
    fail('hsme_reproduction_target_evidence_required', 'bitwise-capable fixture requires reproduced target evidence');
  }
  const seenTargets = new Set<string>();
  for (const target of raw.deterministicTargetReproduction) {
    const sampleDigest = sha256(target?.syntheticSampleDigest, 'syntheticSampleDigest');
    const reproduced = sha256(target?.reproducedOutputSha256, 'reproducedOutputSha256');
    const expectedOutput = sampleOutputByDigest.get(sampleDigest);
    if (!expectedOutput) {
      fail('hsme_reproduction_target_unknown', 'target reproduction must reference an exact supplied synthetic-sample identity');
    }
    if (seenTargets.has(sampleDigest)) {
      fail('hsme_reproduction_target_duplicate', 'target reproduction evidence must be unique per synthetic-sample identity');
    }
    seenTargets.add(sampleDigest);
    if (expectedOutput !== reproduced) {
      fail('hsme_reproduction_target_hash_mismatch', 'deterministic teacher target reproduction changed output bytes');
    }
  }

  return Object.freeze({
    schemaVersion: HSME_TRAINING_REPRODUCTION_GATE_V1_SCHEMA,
    teacherDecisionDigest,
    corpusShardDigests,
    corpusRootDigest,
    recipeDigest,
    checkpointSha256: checkpoint.checkpointSha256,
    ...(resumeCheckpoint ? { resumeCheckpointSha256: resumeCheckpoint.checkpointSha256 } : {}),
    deterministicTargetCount: seenTargets.size,
  });
}

function assertCheckpointIdentity(
  checkpoint: HsmeTrainingCheckpointV1,
  teacherDecisionDigest: string,
  corpusRootDigest: string,
  recipeDigest: string,
  label: string,
): void {
  if (
    checkpoint.teacherDecisionDigest !== teacherDecisionDigest
    || checkpoint.corpusRootDigest !== corpusRootDigest
    || checkpoint.recipeDigest !== recipeDigest
  ) {
    fail('hsme_reproduction_resume_identity_mismatch', `${label} silently changes teacher, corpus or recipe identity`);
  }
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function sha256(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) {
    fail('hsme_reproduction_hash_invalid', `${label} must be lowercase SHA-256`);
  }
  return value;
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string, message: string): never {
  throw new HsmeTrainingReproductionGateV1Error(code, message);
}
