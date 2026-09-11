export const HSME_TRAINING_PROVENANCE_V1_SCHEMA = 'BERS_HSME_TRAINING_PROVENANCE_V1' as const;
export const HSME_CORPUS_SHARD_V1_SCHEMA = 'BERS_HSME_CORPUS_SHARD_V1' as const;
export const HSME_CORPUS_ROOT_V1_SCHEMA = 'BERS_HSME_CORPUS_ROOT_V1' as const;
export const HSME_SYNTHETIC_SAMPLE_V1_SCHEMA = 'BERS_HSME_SYNTHETIC_SAMPLE_V1' as const;
export const HSME_TRAINING_RECIPE_V1_SCHEMA = 'BERS_HSME_TRAINING_RECIPE_V1' as const;
export const HSME_TRAINING_CHECKPOINT_V1_SCHEMA = 'BERS_HSME_TRAINING_CHECKPOINT_V1' as const;
export const HSME_QUALITY_POLICY_V1 = 'QUALITY_FLOOR_BEFORE_EFFICIENCY' as const;
export const HSME_DUAL_BUDGET_POLICY_V1 = 'INDEPENDENT_STORAGE_AND_WORKING_MEMORY' as const;

const HEX64 = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const TEACHER_DECISIONS = Object.freeze(['REDESIGN_REQUIRED', 'TEACHER_SET_ADMITTED'] as const);
const LICENSE_CONCLUSIONS = Object.freeze(['COMMERCIAL_ADMISSIBLE', 'REVIEW_REQUIRED', 'REJECTED'] as const);
const OUTPUT_USE = Object.freeze(['DISTILLATION_ALLOWED', 'REVIEW_REQUIRED', 'PROHIBITED'] as const);
const SOURCE_CLASSES = Object.freeze(['REAL_LICENSED', 'SYNTHETIC_TEACHER', 'INTERNAL_APPROVED'] as const);
const RIGHTS = Object.freeze(['ADMITTED', 'REJECTED'] as const);
const SPLITS = Object.freeze(['TRAIN', 'VALIDATION', 'TEST'] as const);
const DETERMINISM = Object.freeze(['BITWISE_WHERE_SUPPORTED', 'STATISTICAL_DISTRIBUTED'] as const);
const CHECKPOINT_STATUS = Object.freeze(['RND_ONLY', 'TRAINING_CANDIDATE'] as const);

export type HsmeTeacherCandidateV1 = Readonly<{
  candidateId: string;
  modelId: string;
  architectureFamily: string;
  immutableRevision?: string;
  contentSha256?: string;
  checkpointBytes?: number;
  licenseId: string;
  licenseConclusion: typeof LICENSE_CONCLUSIONS[number];
  distillationOutputUse: typeof OUTPUT_USE[number];
  licenseEvidenceSha256?: string;
  toolchainEvidenceSha256?: string;
  installedBytes: number | 'UNKNOWN';
  workingMemoryBytes: number | 'UNKNOWN';
  qualityDomain: readonly string[];
  knownWeaknesses: readonly string[];
}>;

export type HsmeTeacherDecisionV1 = Readonly<{
  schemaVersion: typeof HSME_TRAINING_PROVENANCE_V1_SCHEMA;
  decisionStatus: typeof TEACHER_DECISIONS[number];
  candidates: readonly HsmeTeacherCandidateV1[];
  selectedCandidateIds: readonly string[];
  rationale: readonly string[];
}>;

export type HsmeCorpusAssetV1 = Readonly<{
  contentSha256: string;
  sourceRef: string;
  sourceClass: typeof SOURCE_CLASSES[number];
  licenseId: string;
  licenseEvidenceSha256: string;
  rightsConclusion: typeof RIGHTS[number];
  attribution: string;
  split: typeof SPLITS[number];
  deduplicationKeySha256: string;
  preprocessingSha256: string;
  promptOrCaptionSha256: string;
  exclusionReason?: string;
}>;

export type HsmeCorpusShardV1 = Readonly<{
  schemaVersion: typeof HSME_CORPUS_SHARD_V1_SCHEMA;
  shardId: string;
  assets: readonly HsmeCorpusAssetV1[];
}>;

export type HsmeCorpusRootV1 = Readonly<{
  schemaVersion: typeof HSME_CORPUS_ROOT_V1_SCHEMA;
  corpusId: string;
  shardDigests: readonly string[];
  admittedAssetCount: number;
  rejectedAssetCount: number;
  corpusPolicySha256: string;
}>;

export type HsmeSyntheticSampleV1 = Readonly<{
  schemaVersion: typeof HSME_SYNTHETIC_SAMPLE_V1_SCHEMA;
  teacherDecisionDigest: string;
  teacherCandidateId: string;
  inputSha256: string;
  promptSha256: string;
  seed: number;
  sampler: string;
  scheduler: string;
  stepCount: number;
  guidance: string;
  precision: string;
  runtimeRepresentationSha256: string;
  outputSha256: string;
  filterPolicySha256: string;
  filterDecision: 'ADMITTED' | 'REJECTED';
}>;

export type HsmeTrainingRecipeV1 = Readonly<{
  schemaVersion: typeof HSME_TRAINING_RECIPE_V1_SCHEMA;
  recipeId: string;
  studentArchitectureSha256: string;
  latentAutoencoderBindingSha256: string;
  textConditionerBindingSha256: string;
  initializationSha256: string;
  objectiveSha256: string;
  optimizerSha256: string;
  scheduleSha256: string;
  preprocessingSha256: string;
  teacherDecisionDigest: string;
  corpusRootDigest: string;
  syntheticPolicySha256: string;
  toolchainLockSha256: string;
  seedRootSha256: string;
  determinismMode: typeof DETERMINISM[number];
  qualityGate: Readonly<{
    policy: typeof HSME_QUALITY_POLICY_V1;
    referenceEvidenceSha256: string;
    requiredMetrics: readonly string[];
  }>;
  resourcePolicy: Readonly<{
    policy: typeof HSME_DUAL_BUDGET_POLICY_V1;
    efficiencyEvidenceSha256: string;
  }>;
}>;

export type HsmeTrainingCheckpointV1 = Readonly<{
  schemaVersion: typeof HSME_TRAINING_CHECKPOINT_V1_SCHEMA;
  checkpointSha256: string;
  checkpointBytes: number;
  globalStep: number;
  teacherDecisionDigest: string;
  corpusRootDigest: string;
  recipeDigest: string;
  parentCheckpointSha256?: string;
  qualityEvidenceSha256: string;
  resourceEvidenceSha256: string;
  qualityGatePassed: boolean;
  status: typeof CHECKPOINT_STATUS[number];
}>;

export interface HsmeTrainingHashPortV1 { sha256(bytes: Uint8Array): Promise<string>; }

export class HsmeTrainingProvenanceV1Error extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeTrainingProvenanceV1Error';
    this.code = code;
  }
}

export function normalizeHsmeTeacherDecisionV1(raw: unknown): HsmeTeacherDecisionV1 {
  const record = exactRecord(raw, ['schemaVersion','decisionStatus','candidates','selectedCandidateIds','rationale'], 'teacherDecision');
  if (record.schemaVersion !== HSME_TRAINING_PROVENANCE_V1_SCHEMA) fail('hsme_training_schema_unsupported', 'teacher decision schema is unsupported');
  const decisionStatus = enumValue(record.decisionStatus, TEACHER_DECISIONS, 'decisionStatus');
  if (!Array.isArray(record.candidates) || record.candidates.length < 3 || record.candidates.length > 12) fail('hsme_teacher_candidate_count_invalid', 'teacher comparison requires 3..12 candidates');
  const candidates = record.candidates.map((value, index) => normalizeTeacherCandidate(value, `candidates[${index}]`));
  const ids = candidates.map(candidate => candidate.candidateId);
  if (new Set(ids).size !== ids.length) fail('hsme_teacher_candidate_duplicate', 'candidateId must be unique');
  const selectedCandidateIds = stringSet(record.selectedCandidateIds, 'selectedCandidateIds', 0, 4, 120);
  for (const selected of selectedCandidateIds) if (!ids.includes(selected)) fail('hsme_teacher_selection_invalid', `unknown selected teacher ${selected}`);
  if (decisionStatus === 'TEACHER_SET_ADMITTED') {
    if (selectedCandidateIds.length < 1) fail('hsme_teacher_selection_required', 'admitted teacher set requires at least one selected teacher');
    for (const id of selectedCandidateIds) {
      const candidate = candidates.find(value => value.candidateId === id)!;
      assertTeacherAdmissible(candidate);
    }
  } else if (selectedCandidateIds.length !== 0) {
    fail('hsme_teacher_redesign_invalid', 'REDESIGN_REQUIRED cannot claim admitted teachers');
  }
  return freeze({
    schemaVersion: HSME_TRAINING_PROVENANCE_V1_SCHEMA,
    decisionStatus,
    candidates: Object.freeze([...candidates].sort((a,b) => lexical(a.candidateId,b.candidateId))),
    selectedCandidateIds,
    rationale: stringSet(record.rationale, 'rationale', 1, 20, 500),
  });
}

export function normalizeHsmeCorpusShardV1(raw: unknown): HsmeCorpusShardV1 {
  const record = exactRecord(raw, ['schemaVersion','shardId','assets'], 'corpusShard');
  if (record.schemaVersion !== HSME_CORPUS_SHARD_V1_SCHEMA) fail('hsme_corpus_schema_unsupported', 'corpus shard schema is unsupported');
  if (!Array.isArray(record.assets) || record.assets.length < 1 || record.assets.length > 10000) fail('hsme_corpus_asset_count_invalid', 'corpus shard requires 1..10000 assets');
  const assets = record.assets.map((value,index) => normalizeCorpusAsset(value, `assets[${index}]`));
  const hashes = assets.map(asset => asset.contentSha256);
  if (new Set(hashes).size !== hashes.length) fail('hsme_corpus_asset_duplicate', 'asset content SHA must be unique inside a shard');
  return freeze({ schemaVersion: HSME_CORPUS_SHARD_V1_SCHEMA, shardId: identifier(record.shardId,'shardId',120), assets: Object.freeze([...assets].sort((a,b)=>lexical(a.contentSha256,b.contentSha256))) });
}

export function normalizeHsmeCorpusRootV1(raw: unknown): HsmeCorpusRootV1 {
  const record = exactRecord(raw, ['schemaVersion','corpusId','shardDigests','admittedAssetCount','rejectedAssetCount','corpusPolicySha256'], 'corpusRoot');
  if (record.schemaVersion !== HSME_CORPUS_ROOT_V1_SCHEMA) fail('hsme_corpus_schema_unsupported', 'corpus root schema is unsupported');
  const shardDigests = hashSet(record.shardDigests,'shardDigests',1,100000);
  return freeze({
    schemaVersion: HSME_CORPUS_ROOT_V1_SCHEMA,
    corpusId: identifier(record.corpusId,'corpusId',120),
    shardDigests,
    admittedAssetCount: integer(record.admittedAssetCount,'admittedAssetCount',0,Number.MAX_SAFE_INTEGER),
    rejectedAssetCount: integer(record.rejectedAssetCount,'rejectedAssetCount',0,Number.MAX_SAFE_INTEGER),
    corpusPolicySha256: hash(record.corpusPolicySha256,'corpusPolicySha256'),
  });
}

export function normalizeHsmeSyntheticSampleV1(raw: unknown): HsmeSyntheticSampleV1 {
  const record = exactRecord(raw, ['schemaVersion','teacherDecisionDigest','teacherCandidateId','inputSha256','promptSha256','seed','sampler','scheduler','stepCount','guidance','precision','runtimeRepresentationSha256','outputSha256','filterPolicySha256','filterDecision'], 'syntheticSample');
  if (record.schemaVersion !== HSME_SYNTHETIC_SAMPLE_V1_SCHEMA) fail('hsme_synthetic_schema_unsupported','synthetic sample schema is unsupported');
  return freeze({
    schemaVersion: HSME_SYNTHETIC_SAMPLE_V1_SCHEMA,
    teacherDecisionDigest: hash(record.teacherDecisionDigest,'teacherDecisionDigest'),
    teacherCandidateId: identifier(record.teacherCandidateId,'teacherCandidateId',120),
    inputSha256: hash(record.inputSha256,'inputSha256'), promptSha256: hash(record.promptSha256,'promptSha256'),
    seed: integer(record.seed,'seed',0,Number.MAX_SAFE_INTEGER),
    sampler: text(record.sampler,'sampler',120), scheduler: text(record.scheduler,'scheduler',120),
    stepCount: integer(record.stepCount,'stepCount',1,1000), guidance: text(record.guidance,'guidance',80), precision: text(record.precision,'precision',80),
    runtimeRepresentationSha256: hash(record.runtimeRepresentationSha256,'runtimeRepresentationSha256'), outputSha256: hash(record.outputSha256,'outputSha256'),
    filterPolicySha256: hash(record.filterPolicySha256,'filterPolicySha256'), filterDecision: enumValue(record.filterDecision,Object.freeze(['ADMITTED','REJECTED'] as const),'filterDecision'),
  });
}

export function normalizeHsmeTrainingRecipeV1(raw: unknown): HsmeTrainingRecipeV1 {
  const record = exactRecord(raw, ['schemaVersion','recipeId','studentArchitectureSha256','latentAutoencoderBindingSha256','textConditionerBindingSha256','initializationSha256','objectiveSha256','optimizerSha256','scheduleSha256','preprocessingSha256','teacherDecisionDigest','corpusRootDigest','syntheticPolicySha256','toolchainLockSha256','seedRootSha256','determinismMode','qualityGate','resourcePolicy'], 'trainingRecipe');
  if (record.schemaVersion !== HSME_TRAINING_RECIPE_V1_SCHEMA) fail('hsme_recipe_schema_unsupported','training recipe schema is unsupported');
  const qualityGate = exactRecord(record.qualityGate,['policy','referenceEvidenceSha256','requiredMetrics'],'qualityGate');
  if (qualityGate.policy !== HSME_QUALITY_POLICY_V1) fail('hsme_quality_policy_invalid', `quality policy must be ${HSME_QUALITY_POLICY_V1}`);
  const resourcePolicy = exactRecord(record.resourcePolicy,['policy','efficiencyEvidenceSha256'],'resourcePolicy');
  if (resourcePolicy.policy !== HSME_DUAL_BUDGET_POLICY_V1) fail('hsme_resource_policy_invalid', `resource policy must be ${HSME_DUAL_BUDGET_POLICY_V1}`);
  return freeze({
    schemaVersion: HSME_TRAINING_RECIPE_V1_SCHEMA,
    recipeId: identifier(record.recipeId,'recipeId',120),
    studentArchitectureSha256: hash(record.studentArchitectureSha256,'studentArchitectureSha256'),
    latentAutoencoderBindingSha256: hash(record.latentAutoencoderBindingSha256,'latentAutoencoderBindingSha256'),
    textConditionerBindingSha256: hash(record.textConditionerBindingSha256,'textConditionerBindingSha256'),
    initializationSha256: hash(record.initializationSha256,'initializationSha256'), objectiveSha256: hash(record.objectiveSha256,'objectiveSha256'),
    optimizerSha256: hash(record.optimizerSha256,'optimizerSha256'), scheduleSha256: hash(record.scheduleSha256,'scheduleSha256'), preprocessingSha256: hash(record.preprocessingSha256,'preprocessingSha256'),
    teacherDecisionDigest: hash(record.teacherDecisionDigest,'teacherDecisionDigest'), corpusRootDigest: hash(record.corpusRootDigest,'corpusRootDigest'), syntheticPolicySha256: hash(record.syntheticPolicySha256,'syntheticPolicySha256'),
    toolchainLockSha256: hash(record.toolchainLockSha256,'toolchainLockSha256'), seedRootSha256: hash(record.seedRootSha256,'seedRootSha256'),
    determinismMode: enumValue(record.determinismMode,DETERMINISM,'determinismMode'),
    qualityGate: freeze({ policy: HSME_QUALITY_POLICY_V1, referenceEvidenceSha256: hash(qualityGate.referenceEvidenceSha256,'qualityGate.referenceEvidenceSha256'), requiredMetrics: stringSet(qualityGate.requiredMetrics,'qualityGate.requiredMetrics',4,24,120) }),
    resourcePolicy: freeze({ policy: HSME_DUAL_BUDGET_POLICY_V1, efficiencyEvidenceSha256: hash(resourcePolicy.efficiencyEvidenceSha256,'resourcePolicy.efficiencyEvidenceSha256') }),
  });
}

export function normalizeHsmeTrainingCheckpointV1(raw: unknown): HsmeTrainingCheckpointV1 {
  const record = exactRecord(raw, ['schemaVersion','checkpointSha256','checkpointBytes','globalStep','teacherDecisionDigest','corpusRootDigest','recipeDigest','parentCheckpointSha256','qualityEvidenceSha256','resourceEvidenceSha256','qualityGatePassed','status'], 'trainingCheckpoint', ['parentCheckpointSha256']);
  if (record.schemaVersion !== HSME_TRAINING_CHECKPOINT_V1_SCHEMA) fail('hsme_checkpoint_schema_unsupported','training checkpoint schema is unsupported');
  const qualityGatePassed = booleanValue(record.qualityGatePassed,'qualityGatePassed');
  const status = enumValue(record.status,CHECKPOINT_STATUS,'status');
  if (status === 'TRAINING_CANDIDATE' && !qualityGatePassed) fail('hsme_checkpoint_quality_gate_failed','a smaller/faster checkpoint cannot advance while the required quality floor fails');
  return freeze({
    schemaVersion: HSME_TRAINING_CHECKPOINT_V1_SCHEMA,
    checkpointSha256: hash(record.checkpointSha256,'checkpointSha256'), checkpointBytes: integer(record.checkpointBytes,'checkpointBytes',1,Number.MAX_SAFE_INTEGER), globalStep: integer(record.globalStep,'globalStep',0,Number.MAX_SAFE_INTEGER),
    teacherDecisionDigest: hash(record.teacherDecisionDigest,'teacherDecisionDigest'), corpusRootDigest: hash(record.corpusRootDigest,'corpusRootDigest'), recipeDigest: hash(record.recipeDigest,'recipeDigest'),
    ...(Object.hasOwn(record,'parentCheckpointSha256') ? { parentCheckpointSha256: hash(record.parentCheckpointSha256,'parentCheckpointSha256') } : {}),
    qualityEvidenceSha256: hash(record.qualityEvidenceSha256,'qualityEvidenceSha256'), resourceEvidenceSha256: hash(record.resourceEvidenceSha256,'resourceEvidenceSha256'), qualityGatePassed, status,
  });
}

export async function hsmeTrainingProvenanceDigestV1(value: unknown, hashPort: HsmeTrainingHashPortV1): Promise<string> {
  const canonical = JSON.stringify(canonicalValue(value));
  const digest = await hashPort.sha256(new TextEncoder().encode(`bers:hsme:training-provenance:v1\0${canonical}`));
  return hash(digest,'hashPort result');
}

function normalizeTeacherCandidate(raw: unknown, path: string): HsmeTeacherCandidateV1 {
  const record = exactRecord(raw,['candidateId','modelId','architectureFamily','immutableRevision','contentSha256','checkpointBytes','licenseId','licenseConclusion','distillationOutputUse','licenseEvidenceSha256','toolchainEvidenceSha256','installedBytes','workingMemoryBytes','qualityDomain','knownWeaknesses'],path,['immutableRevision','contentSha256','checkpointBytes','licenseEvidenceSha256','toolchainEvidenceSha256']);
  return freeze({
    candidateId: identifier(record.candidateId,`${path}.candidateId`,120), modelId: text(record.modelId,`${path}.modelId`,180), architectureFamily: text(record.architectureFamily,`${path}.architectureFamily`,120),
    ...(Object.hasOwn(record,'immutableRevision') ? { immutableRevision: immutableRevision(record.immutableRevision,`${path}.immutableRevision`) } : {}),
    ...(Object.hasOwn(record,'contentSha256') ? { contentSha256: hash(record.contentSha256,`${path}.contentSha256`) } : {}),
    ...(Object.hasOwn(record,'checkpointBytes') ? { checkpointBytes: integer(record.checkpointBytes,`${path}.checkpointBytes`,1,Number.MAX_SAFE_INTEGER) } : {}),
    licenseId: text(record.licenseId,`${path}.licenseId`,160), licenseConclusion: enumValue(record.licenseConclusion,LICENSE_CONCLUSIONS,`${path}.licenseConclusion`), distillationOutputUse: enumValue(record.distillationOutputUse,OUTPUT_USE,`${path}.distillationOutputUse`),
    ...(Object.hasOwn(record,'licenseEvidenceSha256') ? { licenseEvidenceSha256: hash(record.licenseEvidenceSha256,`${path}.licenseEvidenceSha256`) } : {}),
    ...(Object.hasOwn(record,'toolchainEvidenceSha256') ? { toolchainEvidenceSha256: hash(record.toolchainEvidenceSha256,`${path}.toolchainEvidenceSha256`) } : {}),
    installedBytes: unknownOrInteger(record.installedBytes,`${path}.installedBytes`), workingMemoryBytes: unknownOrInteger(record.workingMemoryBytes,`${path}.workingMemoryBytes`),
    qualityDomain: stringSet(record.qualityDomain,`${path}.qualityDomain`,1,16,120), knownWeaknesses: stringSet(record.knownWeaknesses,`${path}.knownWeaknesses`,0,16,240),
  });
}

function assertTeacherAdmissible(candidate: HsmeTeacherCandidateV1): void {
  if (candidate.licenseConclusion !== 'COMMERCIAL_ADMISSIBLE' || candidate.distillationOutputUse !== 'DISTILLATION_ALLOWED') fail('hsme_teacher_rights_unresolved', `${candidate.candidateId} is not commercially/distillation admitted`);
  if (!candidate.immutableRevision || !candidate.contentSha256 || !candidate.checkpointBytes || !candidate.licenseEvidenceSha256 || !candidate.toolchainEvidenceSha256) fail('hsme_teacher_pin_incomplete', `${candidate.candidateId} lacks immutable pin evidence`);
}

function normalizeCorpusAsset(raw: unknown, path: string): HsmeCorpusAssetV1 {
  const record = exactRecord(raw,['contentSha256','sourceRef','sourceClass','licenseId','licenseEvidenceSha256','rightsConclusion','attribution','split','deduplicationKeySha256','preprocessingSha256','promptOrCaptionSha256','exclusionReason'],path,['exclusionReason']);
  const rightsConclusion = enumValue(record.rightsConclusion,RIGHTS,`${path}.rightsConclusion`);
  const exclusionReason = Object.hasOwn(record,'exclusionReason') ? text(record.exclusionReason,`${path}.exclusionReason`,320) : undefined;
  if (rightsConclusion === 'REJECTED' && !exclusionReason) fail('hsme_corpus_rejection_reason_required', `${path} rejected asset requires exclusionReason`);
  if (rightsConclusion === 'ADMITTED' && exclusionReason) fail('hsme_corpus_admission_invalid', `${path} admitted asset cannot carry exclusionReason`);
  return freeze({ contentSha256: hash(record.contentSha256,`${path}.contentSha256`), sourceRef: text(record.sourceRef,`${path}.sourceRef`,600), sourceClass: enumValue(record.sourceClass,SOURCE_CLASSES,`${path}.sourceClass`), licenseId: text(record.licenseId,`${path}.licenseId`,160), licenseEvidenceSha256: hash(record.licenseEvidenceSha256,`${path}.licenseEvidenceSha256`), rightsConclusion, attribution: text(record.attribution,`${path}.attribution`,500), split: enumValue(record.split,SPLITS,`${path}.split`), deduplicationKeySha256: hash(record.deduplicationKeySha256,`${path}.deduplicationKeySha256`), preprocessingSha256: hash(record.preprocessingSha256,`${path}.preprocessingSha256`), promptOrCaptionSha256: hash(record.promptOrCaptionSha256,`${path}.promptOrCaptionSha256`), ...(exclusionReason ? { exclusionReason } : {}) });
}

function exactRecord(raw: unknown, allowed: readonly string[], path: string, optional: readonly string[] = []): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('hsme_training_record_invalid', `${path} must be an object`);
  const record = raw as Record<string,unknown>;
  for (const key of Object.keys(record)) if (!allowed.includes(key)) fail('hsme_training_field_unknown', `${path}.${key} is not allowed`);
  for (const key of allowed) if (!optional.includes(key) && !Object.hasOwn(record,key)) fail('hsme_training_field_missing', `${path}.${key} is required`);
  return record;
}
function hash(value: unknown, path: string): string { const result = text(value,path,64); if (!HEX64.test(result)) fail('hsme_training_hash_invalid', `${path} must be lowercase SHA-256`); return result; }
function immutableRevision(value: unknown, path: string): string { const result = text(value,path,64); if (!IMMUTABLE_REVISION.test(result)) fail('hsme_training_revision_invalid', `${path} must be immutable 40/64-hex`); return result; }
function identifier(value: unknown, path: string, max: number): string { const result = text(value,path,max); if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) fail('hsme_training_identifier_invalid', `${path} is invalid`); return result; }
function text(value: unknown, path: string, max: number): string { if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) fail('hsme_training_text_invalid', `${path} is invalid`); return value; }
function integer(value: unknown, path: string, min: number, max: number): number { if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) fail('hsme_training_integer_invalid', `${path} is invalid`); return value as number; }
function unknownOrInteger(value: unknown, path: string): number|'UNKNOWN' { return value === 'UNKNOWN' ? 'UNKNOWN' : integer(value,path,0,Number.MAX_SAFE_INTEGER); }
function booleanValue(value: unknown, path: string): boolean { if (typeof value !== 'boolean') fail('hsme_training_boolean_invalid', `${path} must be boolean`); return value; }
function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] { if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) fail('hsme_training_enum_invalid', `${path} is invalid`); return value as T[number]; }
function stringSet(value: unknown, path: string, min: number, max: number, maxLen: number): readonly string[] { if (!Array.isArray(value) || value.length < min || value.length > max) fail('hsme_training_array_invalid', `${path} must contain ${min}..${max} entries`); const result = value.map((entry,index)=>text(entry,`${path}[${index}]`,maxLen)); if (new Set(result).size !== result.length) fail('hsme_training_array_duplicate', `${path} must be unique`); return Object.freeze([...result].sort(lexical)); }
function hashSet(value: unknown, path: string, min: number, max: number): readonly string[] { if (!Array.isArray(value) || value.length < min || value.length > max) fail('hsme_training_array_invalid', `${path} must contain ${min}..${max} entries`); const result = value.map((entry,index)=>hash(entry,`${path}[${index}]`)); if (new Set(result).size !== result.length) fail('hsme_training_array_duplicate', `${path} must be unique`); return Object.freeze([...result].sort(lexical)); }
function lexical(a: string,b: string): number { return a < b ? -1 : a > b ? 1 : 0; }
function freeze<T extends object>(value: T): Readonly<T> { return Object.freeze(value); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (value && typeof value === 'object') { const record = value as Record<string,unknown>; return Object.fromEntries(Object.keys(record).sort(lexical).map(key => [key, canonicalValue(record[key])])); } return value; }
function fail(code: string, message: string): never { throw new HsmeTrainingProvenanceV1Error(code,message); }
