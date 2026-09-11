import {
  type HsmeTeacherDecisionV1,
  type HsmeTrainingHashPortV1,
  normalizeHsmeTeacherDecisionV1,
} from './HsmeTrainingProvenanceV1';

export const HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA = 'BERS_HSME_TEACHER_ARTIFACT_MANIFEST_V1' as const;
export const HSME_TEACHER_ARTIFACT_ADMISSION_V1_SCHEMA = 'BERS_HSME_TEACHER_ARTIFACT_ADMISSION_V1' as const;

const HEX64 = /^[0-9a-f]{64}$/;
const IMMUTABLE_REVISION = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SOURCE_PROVIDERS = Object.freeze(['HUGGING_FACE', 'GITHUB'] as const);
const ARTIFACT_ROLES = Object.freeze([
  'DENOISER_WEIGHT',
  'TEXT_ENCODER_WEIGHT',
  'VAE_WEIGHT',
  'MODEL_CONFIG',
  'TOKENIZER_ASSET',
  'SCHEDULER_ASSET',
  'RUNTIME_ASSET',
  'RUNTIME_CODE',
] as const);
const WEIGHT_ROLES = new Set<string>(['DENOISER_WEIGHT', 'TEXT_ENCODER_WEIGHT', 'VAE_WEIGHT']);

type TeacherSourceProviderV1 = typeof SOURCE_PROVIDERS[number];
type TeacherArtifactRoleV1 = typeof ARTIFACT_ROLES[number];

export type HsmeTeacherArtifactSourceV1 = Readonly<{
  provider: TeacherSourceProviderV1;
  sourceRoot: string;
  immutableRevision: string;
}>;

export type HsmeTeacherArtifactV1 = Readonly<{
  logicalId: string;
  source: HsmeTeacherArtifactSourceV1;
  relativePath: string;
  role: TeacherArtifactRoleV1;
  contentSha256: string;
  bytes: number;
  runtimeRequired: boolean;
}>;

export type HsmeTeacherArtifactManifestV1 = Readonly<{
  schemaVersion: typeof HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA;
  teacherCandidateId: string;
  primarySource: HsmeTeacherArtifactSourceV1;
  artifacts: readonly HsmeTeacherArtifactV1[];
}>;

export type HsmeTeacherArtifactAdmissionEntryV1 = Readonly<{
  teacherCandidateId: string;
  manifestDigest: string;
  primaryImmutableRevision: string;
  weightBytes: number;
  installedBytes: number;
  workingMemoryBytes: number;
  artifactCount: number;
  sourceCount: number;
}>;

export type HsmeTeacherArtifactAdmissionEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_TEACHER_ARTIFACT_ADMISSION_V1_SCHEMA;
  selectedTeacherIds: readonly string[];
  entries: readonly HsmeTeacherArtifactAdmissionEntryV1[];
}>;

export class HsmeTeacherArtifactManifestV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeTeacherArtifactManifestV1Error';
    this.code = code;
  }
}

export function normalizeHsmeTeacherArtifactManifestV1(raw: unknown): HsmeTeacherArtifactManifestV1 {
  const record = exactRecord(raw, ['schemaVersion', 'teacherCandidateId', 'primarySource', 'artifacts'], 'teacherArtifactManifest');
  if (record.schemaVersion !== HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA) {
    fail('hsme_teacher_artifact_schema_unsupported', 'teacher artifact manifest schema is unsupported');
  }
  if (!Array.isArray(record.artifacts) || record.artifacts.length < 1 || record.artifacts.length > 4096) {
    fail('hsme_teacher_artifact_count_invalid', 'teacher artifact manifest requires 1..4096 artifacts');
  }

  const primarySource = normalizeHsmeTeacherArtifactSourceV1(record.primarySource, 'primarySource');
  const artifacts = record.artifacts.map((value, index) => normalizeArtifact(value, `artifacts[${index}]`));
  const logicalIds = artifacts.map(artifact => artifact.logicalId);
  const sourcePaths = artifacts.map(artifact => artifactSourcePathKey(artifact));
  if (new Set(logicalIds).size !== logicalIds.length) {
    fail('hsme_teacher_artifact_logical_id_duplicate', 'teacher artifact logicalId must be unique');
  }
  if (new Set(sourcePaths).size !== sourcePaths.length) {
    fail('hsme_teacher_artifact_path_duplicate', 'teacher artifact source+revision+relativePath must be unique');
  }
  if (!artifacts.some(artifact => sameSource(artifact.source, primarySource))) {
    fail('hsme_teacher_primary_source_unused', 'teacher manifest must include at least one artifact from the primary source');
  }
  for (const artifact of artifacts) {
    if (
      artifact.source.provider === primarySource.provider
      && artifact.source.sourceRoot === primarySource.sourceRoot
      && artifact.source.immutableRevision !== primarySource.immutableRevision
    ) {
      fail('hsme_teacher_primary_revision_mixed', 'artifacts from the primary source must use the exact primary revision');
    }
  }

  return Object.freeze({
    schemaVersion: HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
    teacherCandidateId: identifier(record.teacherCandidateId, 'teacherCandidateId', 120),
    primarySource,
    artifacts: Object.freeze([...artifacts].sort((left, right) => lexical(left.logicalId, right.logicalId))),
  });
}

export function normalizeHsmeTeacherArtifactSourceV1(
  raw: unknown,
  path = 'teacherArtifactSource',
): HsmeTeacherArtifactSourceV1 {
  const record = exactRecord(raw, ['provider', 'sourceRoot', 'immutableRevision'], path);
  return Object.freeze({
    provider: enumValue(record.provider, SOURCE_PROVIDERS, `${path}.provider`),
    sourceRoot: sourceRoot(record.sourceRoot, `${path}.sourceRoot`),
    immutableRevision: immutableRevision(record.immutableRevision, `${path}.immutableRevision`),
  });
}

export async function hsmeTeacherArtifactManifestDigestV1(
  manifest: HsmeTeacherArtifactManifestV1,
  hashPort: HsmeTrainingHashPortV1,
): Promise<string> {
  const normalized = normalizeHsmeTeacherArtifactManifestV1(manifest);
  const canonical = JSON.stringify(canonicalValue(normalized));
  const digest = await hashPort.sha256(new TextEncoder().encode(`bers:hsme:teacher-artifact-manifest:v1\0${canonical}`));
  return sha256(digest, 'hashPort result');
}

export async function proveHsmeTeacherArtifactAdmissionV1(
  rawDecision: unknown,
  rawManifests: readonly unknown[],
  hashPort: HsmeTrainingHashPortV1,
): Promise<HsmeTeacherArtifactAdmissionEvidenceV1> {
  const decision = normalizeHsmeTeacherDecisionV1(rawDecision);
  assertDecisionAdmitted(decision);
  if (!Array.isArray(rawManifests) || rawManifests.length < 1 || rawManifests.length > 12) {
    fail('hsme_teacher_artifact_manifest_count_invalid', 'teacher admission requires 1..12 artifact manifests');
  }

  const manifests = rawManifests.map(normalizeHsmeTeacherArtifactManifestV1);
  const manifestByTeacher = new Map<string, HsmeTeacherArtifactManifestV1>();
  for (const manifest of manifests) {
    if (manifestByTeacher.has(manifest.teacherCandidateId)) {
      fail('hsme_teacher_artifact_manifest_duplicate', `duplicate manifest for ${manifest.teacherCandidateId}`);
    }
    manifestByTeacher.set(manifest.teacherCandidateId, manifest);
  }

  const entries: HsmeTeacherArtifactAdmissionEntryV1[] = [];
  for (const teacherCandidateId of decision.selectedCandidateIds) {
    const candidate = decision.candidates.find(value => value.candidateId === teacherCandidateId)!;
    const manifest = manifestByTeacher.get(teacherCandidateId);
    if (!manifest) {
      fail('hsme_teacher_artifact_manifest_missing', `selected teacher ${teacherCandidateId} has no artifact manifest`);
    }
    if (manifest.primarySource.sourceRoot !== candidate.modelId) {
      fail('hsme_teacher_artifact_source_mismatch', `${teacherCandidateId} primary source differs from modelId`);
    }
    if (manifest.primarySource.immutableRevision !== candidate.immutableRevision) {
      fail('hsme_teacher_artifact_revision_mismatch', `${teacherCandidateId} primary revision differs from admitted candidate`);
    }
    if (manifest.artifacts.some(artifact => artifact.role === 'RUNTIME_CODE')) {
      fail('hsme_teacher_remote_code_forbidden_v1', `${teacherCandidateId} requires model-repository runtime code; v1 admission is fail-closed`);
    }

    const manifestDigest = await hsmeTeacherArtifactManifestDigestV1(manifest, hashPort);
    if (candidate.contentSha256 !== manifestDigest) {
      fail('hsme_teacher_artifact_root_mismatch', `${teacherCandidateId} contentSha256 does not bind the canonical artifact manifest`);
    }

    const weightBytes = sumSafe(
      manifest.artifacts.filter(artifact => WEIGHT_ROLES.has(artifact.role)).map(artifact => artifact.bytes),
      'weightBytes',
    );
    if (weightBytes < 1 || candidate.checkpointBytes !== weightBytes) {
      fail('hsme_teacher_artifact_weight_bytes_mismatch', `${teacherCandidateId} checkpointBytes does not equal canonical weight bytes`);
    }

    const installedBytes = sumSafe(
      manifest.artifacts.filter(artifact => artifact.runtimeRequired).map(artifact => artifact.bytes),
      'installedBytes',
    );
    if (candidate.installedBytes === 'UNKNOWN' || candidate.installedBytes !== installedBytes) {
      fail('hsme_teacher_artifact_installed_bytes_mismatch', `${teacherCandidateId} installedBytes does not equal runtime-required artifact bytes`);
    }
    if (candidate.workingMemoryBytes === 'UNKNOWN' || candidate.workingMemoryBytes < 1) {
      fail('hsme_teacher_working_memory_unresolved', `${teacherCandidateId} requires non-zero working-memory evidence before admission`);
    }

    const sourceCount = new Set(manifest.artifacts.map(artifact => sourceKey(artifact.source))).size;
    entries.push(Object.freeze({
      teacherCandidateId,
      manifestDigest,
      primaryImmutableRevision: manifest.primarySource.immutableRevision,
      weightBytes,
      installedBytes,
      workingMemoryBytes: candidate.workingMemoryBytes,
      artifactCount: manifest.artifacts.length,
      sourceCount,
    }));
  }

  const selectedTeacherIds = Object.freeze([...decision.selectedCandidateIds].sort(lexical));
  return Object.freeze({
    schemaVersion: HSME_TEACHER_ARTIFACT_ADMISSION_V1_SCHEMA,
    selectedTeacherIds,
    entries: Object.freeze(entries.sort((left, right) => lexical(left.teacherCandidateId, right.teacherCandidateId))),
  });
}

function assertDecisionAdmitted(decision: HsmeTeacherDecisionV1): void {
  if (decision.decisionStatus !== 'TEACHER_SET_ADMITTED' || decision.selectedCandidateIds.length < 1) {
    fail('hsme_teacher_artifact_decision_not_admitted', 'teacher artifact admission requires TEACHER_SET_ADMITTED');
  }
}

function normalizeArtifact(raw: unknown, path: string): HsmeTeacherArtifactV1 {
  const record = exactRecord(raw, ['logicalId', 'source', 'relativePath', 'role', 'contentSha256', 'bytes', 'runtimeRequired'], path);
  const role = enumValue(record.role, ARTIFACT_ROLES, `${path}.role`);
  const runtimeRequired = booleanValue(record.runtimeRequired, `${path}.runtimeRequired`);
  if (WEIGHT_ROLES.has(role) && !runtimeRequired) {
    fail('hsme_teacher_weight_not_runtime_required', `${path} canonical weight must be runtimeRequired`);
  }
  return Object.freeze({
    logicalId: identifier(record.logicalId, `${path}.logicalId`, 160),
    source: normalizeHsmeTeacherArtifactSourceV1(record.source, `${path}.source`),
    relativePath: relativePath(record.relativePath, `${path}.relativePath`),
    role,
    contentSha256: sha256(record.contentSha256, `${path}.contentSha256`),
    bytes: integer(record.bytes, `${path}.bytes`, 1, Number.MAX_SAFE_INTEGER),
    runtimeRequired,
  });
}

function exactRecord(raw: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail('hsme_teacher_artifact_record_invalid', `${path} must be an object`);
  }
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!allowed.includes(key)) fail('hsme_teacher_artifact_field_unknown', `${path}.${key} is not allowed`);
  }
  for (const key of allowed) {
    if (!Object.hasOwn(record, key)) fail('hsme_teacher_artifact_field_missing', `${path}.${key} is required`);
  }
  return record;
}

function sourceRoot(value: unknown, path: string): string {
  const result = text(value, path, 240);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(result)) {
    fail('hsme_teacher_artifact_source_invalid', `${path} must be owner/name`);
  }
  return result;
}

function relativePath(value: unknown, path: string): string {
  const result = text(value, path, 500);
  if (result.startsWith('/') || result.includes('\\') || result.split('/').some(segment => segment === '' || segment === '.' || segment === '..')) {
    fail('hsme_teacher_artifact_path_invalid', `${path} must be a normalized safe relative path`);
  }
  return result;
}

function immutableRevision(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!IMMUTABLE_REVISION.test(result)) fail('hsme_teacher_artifact_revision_invalid', `${path} must be immutable 40/64-hex`);
  return result;
}

function sha256(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!HEX64.test(result)) fail('hsme_teacher_artifact_hash_invalid', `${path} must be lowercase SHA-256`);
  return result;
}

function identifier(value: unknown, path: string, max: number): string {
  const result = text(value, path, max);
  if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) fail('hsme_teacher_artifact_identifier_invalid', `${path} is invalid`);
  return result;
}

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    fail('hsme_teacher_artifact_text_invalid', `${path} is invalid`);
  }
  return value;
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_teacher_artifact_integer_invalid', `${path} is invalid`);
  }
  return value as number;
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('hsme_teacher_artifact_boolean_invalid', `${path} must be boolean`);
  return value;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
    fail('hsme_teacher_artifact_enum_invalid', `${path} is invalid`);
  }
  return value as T[number];
}

function artifactSourcePathKey(artifact: HsmeTeacherArtifactV1): string {
  return `${sourceKey(artifact.source)}\0${artifact.relativePath}`;
}

function sourceKey(source: HsmeTeacherArtifactSourceV1): string {
  return `${source.provider}\0${source.sourceRoot}\0${source.immutableRevision}`;
}

function sameSource(left: HsmeTeacherArtifactSourceV1, right: HsmeTeacherArtifactSourceV1): boolean {
  return sourceKey(left) === sourceKey(right);
}

function sumSafe(values: readonly number[], path: string): number {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) fail('hsme_teacher_artifact_sum_overflow', `${path} exceeds safe integer range`);
  }
  return total;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort(lexical).map(key => [key, canonicalValue(record[key])]));
  }
  return value;
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string, message: string): never {
  throw new HsmeTeacherArtifactManifestV1Error(code, message);
}
