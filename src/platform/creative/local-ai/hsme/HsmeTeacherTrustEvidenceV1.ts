import {
  type HsmeTrainingHashPortV1,
  normalizeHsmeTeacherDecisionV1,
} from './HsmeTrainingProvenanceV1';
import {
  type HsmeTeacherArtifactManifestV1,
  type HsmeTeacherArtifactSourceV1,
  hsmeTeacherArtifactManifestDigestV1,
  normalizeHsmeTeacherArtifactManifestV1,
  normalizeHsmeTeacherArtifactSourceV1,
  proveHsmeTeacherArtifactAdmissionV1,
} from './HsmeTeacherArtifactManifestV1';

export const HSME_TEACHER_LICENSE_REVIEW_V1_SCHEMA = 'BERS_HSME_TEACHER_LICENSE_REVIEW_V1' as const;
export const HSME_TEACHER_TOOLCHAIN_V1_SCHEMA = 'BERS_HSME_TEACHER_TOOLCHAIN_V1' as const;
export const HSME_TEACHER_TRUST_ADMISSION_V1_SCHEMA = 'BERS_HSME_TEACHER_TRUST_ADMISSION_V1' as const;

const HEX64 = /^[0-9a-f]{64}$/;
const LICENSE_CONCLUSIONS = Object.freeze(['COMMERCIAL_ADMISSIBLE', 'REVIEW_REQUIRED', 'REJECTED'] as const);
const OUTPUT_USE = Object.freeze(['DISTILLATION_ALLOWED', 'REVIEW_REQUIRED', 'PROHIBITED'] as const);
const DEPENDENCY_CONCLUSIONS = Object.freeze(['ADMITTED', 'REVIEW_REQUIRED', 'REJECTED'] as const);
const REMOTE_CODE_POLICIES = Object.freeze(['NO_MODEL_REPOSITORY_RUNTIME_CODE'] as const);
const WORKING_MEMORY_KINDS = Object.freeze(['MEASURED', 'ESTIMATED'] as const);

export type HsmeTeacherDependencyLicenseReviewV1 = Readonly<{
  source: HsmeTeacherArtifactSourceV1;
  artifactLogicalIds: readonly string[];
  licenseId: string;
  licenseEvidenceSha256: string;
  obligationsEvidenceSha256: string;
  conclusion: typeof DEPENDENCY_CONCLUSIONS[number];
}>;

export type HsmeTeacherLicenseReviewV1 = Readonly<{
  schemaVersion: typeof HSME_TEACHER_LICENSE_REVIEW_V1_SCHEMA;
  teacherCandidateId: string;
  artifactManifestDigest: string;
  aggregateLicenseId: string;
  dependencyReviews: readonly HsmeTeacherDependencyLicenseReviewV1[];
  commercialUseConclusion: typeof LICENSE_CONCLUSIONS[number];
  distillationOutputUse: typeof OUTPUT_USE[number];
  reviewPolicySha256: string;
  rationale: readonly string[];
}>;

export type HsmeTeacherResourceEvidenceV1 = Readonly<{
  installedBytes: number;
  workingMemoryBytes: number;
  workingMemoryKind: typeof WORKING_MEMORY_KINDS[number];
  hardwareProfileSha256: string;
  methodSha256: string;
  evidenceSha256: string;
}>;

export type HsmeTeacherToolchainV1 = Readonly<{
  schemaVersion: typeof HSME_TEACHER_TOOLCHAIN_V1_SCHEMA;
  teacherCandidateId: string;
  artifactManifestDigest: string;
  runtimeSource: HsmeTeacherArtifactSourceV1;
  containerImageSha256: string;
  packageLockSha256: string;
  frameworkLockSha256: string;
  targetProgramSha256: string;
  invocationSchemaSha256: string;
  determinismPolicySha256: string;
  resourceEvidence: HsmeTeacherResourceEvidenceV1;
  remoteCodePolicy: typeof REMOTE_CODE_POLICIES[number];
}>;

export type HsmeTeacherTrustAdmissionEntryV1 = Readonly<{
  teacherCandidateId: string;
  artifactManifestDigest: string;
  licenseReviewDigest: string;
  toolchainDigest: string;
  runtimeArtifactCount: number;
  dependencyReviewCount: number;
  workingMemoryKind: typeof WORKING_MEMORY_KINDS[number];
}>;

export type HsmeTeacherTrustAdmissionEvidenceV1 = Readonly<{
  schemaVersion: typeof HSME_TEACHER_TRUST_ADMISSION_V1_SCHEMA;
  selectedTeacherIds: readonly string[];
  entries: readonly HsmeTeacherTrustAdmissionEntryV1[];
}>;

export class HsmeTeacherTrustEvidenceV1Error extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'HsmeTeacherTrustEvidenceV1Error';
    this.code = code;
  }
}

export function normalizeHsmeTeacherLicenseReviewV1(raw: unknown): HsmeTeacherLicenseReviewV1 {
  const record = exactRecord(raw, [
    'schemaVersion',
    'teacherCandidateId',
    'artifactManifestDigest',
    'aggregateLicenseId',
    'dependencyReviews',
    'commercialUseConclusion',
    'distillationOutputUse',
    'reviewPolicySha256',
    'rationale',
  ], 'teacherLicenseReview');
  if (record.schemaVersion !== HSME_TEACHER_LICENSE_REVIEW_V1_SCHEMA) {
    fail('hsme_teacher_license_schema_unsupported', 'teacher license review schema is unsupported');
  }
  if (!Array.isArray(record.dependencyReviews) || record.dependencyReviews.length < 1 || record.dependencyReviews.length > 256) {
    fail('hsme_teacher_license_dependency_count_invalid', 'teacher license review requires 1..256 dependency reviews');
  }
  const dependencyReviews = record.dependencyReviews.map((value, index) => normalizeDependencyReview(value, `dependencyReviews[${index}]`));
  const coveredIds = dependencyReviews.flatMap(review => review.artifactLogicalIds);
  if (new Set(coveredIds).size !== coveredIds.length) {
    fail('hsme_teacher_license_artifact_coverage_duplicate', 'each artifact logicalId may be covered by only one dependency review');
  }

  const commercialUseConclusion = enumValue(record.commercialUseConclusion, LICENSE_CONCLUSIONS, 'commercialUseConclusion');
  const distillationOutputUse = enumValue(record.distillationOutputUse, OUTPUT_USE, 'distillationOutputUse');
  if (commercialUseConclusion === 'COMMERCIAL_ADMISSIBLE' && dependencyReviews.some(review => review.conclusion !== 'ADMITTED')) {
    fail('hsme_teacher_license_dependency_unresolved', 'commercial admission requires every covered runtime dependency to be ADMITTED');
  }
  if (distillationOutputUse === 'DISTILLATION_ALLOWED' && commercialUseConclusion !== 'COMMERCIAL_ADMISSIBLE') {
    fail('hsme_teacher_distillation_without_commercial_admission', 'distillation cannot be admitted while commercial-use review is unresolved or rejected');
  }

  return Object.freeze({
    schemaVersion: HSME_TEACHER_LICENSE_REVIEW_V1_SCHEMA,
    teacherCandidateId: identifier(record.teacherCandidateId, 'teacherCandidateId', 120),
    artifactManifestDigest: sha256(record.artifactManifestDigest, 'artifactManifestDigest'),
    aggregateLicenseId: text(record.aggregateLicenseId, 'aggregateLicenseId', 240),
    dependencyReviews: Object.freeze([...dependencyReviews].sort((left, right) => lexical(dependencyReviewKey(left), dependencyReviewKey(right)))),
    commercialUseConclusion,
    distillationOutputUse,
    reviewPolicySha256: sha256(record.reviewPolicySha256, 'reviewPolicySha256'),
    rationale: stringSet(record.rationale, 'rationale', 1, 24, 600),
  });
}

export function normalizeHsmeTeacherToolchainV1(raw: unknown): HsmeTeacherToolchainV1 {
  const record = exactRecord(raw, [
    'schemaVersion',
    'teacherCandidateId',
    'artifactManifestDigest',
    'runtimeSource',
    'containerImageSha256',
    'packageLockSha256',
    'frameworkLockSha256',
    'targetProgramSha256',
    'invocationSchemaSha256',
    'determinismPolicySha256',
    'resourceEvidence',
    'remoteCodePolicy',
  ], 'teacherToolchain');
  if (record.schemaVersion !== HSME_TEACHER_TOOLCHAIN_V1_SCHEMA) {
    fail('hsme_teacher_toolchain_schema_unsupported', 'teacher toolchain schema is unsupported');
  }
  const runtimeSource = normalizeHsmeTeacherArtifactSourceV1(record.runtimeSource, 'runtimeSource');
  if (runtimeSource.provider !== 'GITHUB') {
    fail('hsme_teacher_toolchain_source_invalid', 'target-generation runtime source must be an immutable GitHub repository revision');
  }
  return Object.freeze({
    schemaVersion: HSME_TEACHER_TOOLCHAIN_V1_SCHEMA,
    teacherCandidateId: identifier(record.teacherCandidateId, 'teacherCandidateId', 120),
    artifactManifestDigest: sha256(record.artifactManifestDigest, 'artifactManifestDigest'),
    runtimeSource,
    containerImageSha256: sha256(record.containerImageSha256, 'containerImageSha256'),
    packageLockSha256: sha256(record.packageLockSha256, 'packageLockSha256'),
    frameworkLockSha256: sha256(record.frameworkLockSha256, 'frameworkLockSha256'),
    targetProgramSha256: sha256(record.targetProgramSha256, 'targetProgramSha256'),
    invocationSchemaSha256: sha256(record.invocationSchemaSha256, 'invocationSchemaSha256'),
    determinismPolicySha256: sha256(record.determinismPolicySha256, 'determinismPolicySha256'),
    resourceEvidence: normalizeResourceEvidence(record.resourceEvidence, 'resourceEvidence'),
    remoteCodePolicy: enumValue(record.remoteCodePolicy, REMOTE_CODE_POLICIES, 'remoteCodePolicy'),
  });
}

export async function hsmeTeacherLicenseReviewDigestV1(
  review: HsmeTeacherLicenseReviewV1,
  hashPort: HsmeTrainingHashPortV1,
): Promise<string> {
  return domainDigest('bers:hsme:teacher-license-review:v1', normalizeHsmeTeacherLicenseReviewV1(review), hashPort);
}

export async function hsmeTeacherToolchainDigestV1(
  toolchain: HsmeTeacherToolchainV1,
  hashPort: HsmeTrainingHashPortV1,
): Promise<string> {
  return domainDigest('bers:hsme:teacher-toolchain:v1', normalizeHsmeTeacherToolchainV1(toolchain), hashPort);
}

export async function proveHsmeTeacherTrustAdmissionV1(
  rawDecision: unknown,
  rawManifests: readonly unknown[],
  rawLicenseReviews: readonly unknown[],
  rawToolchains: readonly unknown[],
  hashPort: HsmeTrainingHashPortV1,
): Promise<HsmeTeacherTrustAdmissionEvidenceV1> {
  if (!Array.isArray(rawLicenseReviews) || rawLicenseReviews.length < 1 || rawLicenseReviews.length > 12) {
    fail('hsme_teacher_license_review_count_invalid', 'teacher trust admission requires 1..12 license reviews');
  }
  if (!Array.isArray(rawToolchains) || rawToolchains.length < 1 || rawToolchains.length > 12) {
    fail('hsme_teacher_toolchain_count_invalid', 'teacher trust admission requires 1..12 toolchains');
  }

  const decision = normalizeHsmeTeacherDecisionV1(rawDecision);
  const artifactAdmission = await proveHsmeTeacherArtifactAdmissionV1(rawDecision, rawManifests, hashPort);
  const manifests = rawManifests.map(normalizeHsmeTeacherArtifactManifestV1);
  const manifestByTeacher = uniqueByTeacher(manifests, value => value.teacherCandidateId, 'hsme_teacher_trust_manifest_duplicate');
  const licenseReviews = rawLicenseReviews.map(normalizeHsmeTeacherLicenseReviewV1);
  const licenseByTeacher = uniqueByTeacher(licenseReviews, value => value.teacherCandidateId, 'hsme_teacher_license_review_duplicate');
  const toolchains = rawToolchains.map(normalizeHsmeTeacherToolchainV1);
  const toolchainByTeacher = uniqueByTeacher(toolchains, value => value.teacherCandidateId, 'hsme_teacher_toolchain_duplicate');

  const entries: HsmeTeacherTrustAdmissionEntryV1[] = [];
  for (const teacherCandidateId of decision.selectedCandidateIds) {
    const candidate = decision.candidates.find(value => value.candidateId === teacherCandidateId)!;
    const manifest = required(manifestByTeacher.get(teacherCandidateId), 'hsme_teacher_trust_manifest_missing', teacherCandidateId);
    const artifactEntry = artifactAdmission.entries.find(value => value.teacherCandidateId === teacherCandidateId)!;
    const manifestDigest = await hsmeTeacherArtifactManifestDigestV1(manifest, hashPort);
    if (manifestDigest !== artifactEntry.manifestDigest) {
      fail('hsme_teacher_trust_artifact_evidence_mismatch', `${teacherCandidateId} artifact admission digest changed`);
    }

    const licenseReview = required(licenseByTeacher.get(teacherCandidateId), 'hsme_teacher_license_review_missing', teacherCandidateId);
    if (licenseReview.artifactManifestDigest !== manifestDigest) {
      fail('hsme_teacher_license_manifest_mismatch', `${teacherCandidateId} license review is not bound to the artifact manifest`);
    }
    assertRuntimeLicenseCoverage(manifest, licenseReview);
    if (
      licenseReview.aggregateLicenseId !== candidate.licenseId
      || licenseReview.commercialUseConclusion !== candidate.licenseConclusion
      || licenseReview.distillationOutputUse !== candidate.distillationOutputUse
    ) {
      fail('hsme_teacher_license_candidate_mismatch', `${teacherCandidateId} candidate license/output conclusions differ from reviewed evidence`);
    }
    if (licenseReview.commercialUseConclusion !== 'COMMERCIAL_ADMISSIBLE' || licenseReview.distillationOutputUse !== 'DISTILLATION_ALLOWED') {
      fail('hsme_teacher_license_not_admitted', `${teacherCandidateId} license or distillation-output review is not admitted`);
    }
    const licenseReviewDigest = await hsmeTeacherLicenseReviewDigestV1(licenseReview, hashPort);
    if (candidate.licenseEvidenceSha256 !== licenseReviewDigest) {
      fail('hsme_teacher_license_digest_mismatch', `${teacherCandidateId} licenseEvidenceSha256 does not bind the normalized review`);
    }

    const toolchain = required(toolchainByTeacher.get(teacherCandidateId), 'hsme_teacher_toolchain_missing', teacherCandidateId);
    if (toolchain.artifactManifestDigest !== manifestDigest) {
      fail('hsme_teacher_toolchain_manifest_mismatch', `${teacherCandidateId} toolchain is not bound to the artifact manifest`);
    }
    if (
      toolchain.resourceEvidence.installedBytes !== artifactEntry.installedBytes
      || toolchain.resourceEvidence.installedBytes !== candidate.installedBytes
    ) {
      fail('hsme_teacher_resource_installed_bytes_mismatch', `${teacherCandidateId} resource evidence does not match canonical installed bytes`);
    }
    if (toolchain.resourceEvidence.workingMemoryBytes !== candidate.workingMemoryBytes) {
      fail('hsme_teacher_resource_working_memory_mismatch', `${teacherCandidateId} working-memory evidence differs from candidate`);
    }
    const toolchainDigest = await hsmeTeacherToolchainDigestV1(toolchain, hashPort);
    if (candidate.toolchainEvidenceSha256 !== toolchainDigest) {
      fail('hsme_teacher_toolchain_digest_mismatch', `${teacherCandidateId} toolchainEvidenceSha256 does not bind the normalized toolchain`);
    }

    entries.push(Object.freeze({
      teacherCandidateId,
      artifactManifestDigest: manifestDigest,
      licenseReviewDigest,
      toolchainDigest,
      runtimeArtifactCount: manifest.artifacts.filter(artifact => artifact.runtimeRequired).length,
      dependencyReviewCount: licenseReview.dependencyReviews.length,
      workingMemoryKind: toolchain.resourceEvidence.workingMemoryKind,
    }));
  }

  return Object.freeze({
    schemaVersion: HSME_TEACHER_TRUST_ADMISSION_V1_SCHEMA,
    selectedTeacherIds: Object.freeze([...decision.selectedCandidateIds].sort(lexical)),
    entries: Object.freeze(entries.sort((left, right) => lexical(left.teacherCandidateId, right.teacherCandidateId))),
  });
}

function normalizeDependencyReview(raw: unknown, path: string): HsmeTeacherDependencyLicenseReviewV1 {
  const record = exactRecord(raw, [
    'source',
    'artifactLogicalIds',
    'licenseId',
    'licenseEvidenceSha256',
    'obligationsEvidenceSha256',
    'conclusion',
  ], path);
  return Object.freeze({
    source: normalizeHsmeTeacherArtifactSourceV1(record.source, `${path}.source`),
    artifactLogicalIds: identifierSet(record.artifactLogicalIds, `${path}.artifactLogicalIds`, 1, 4096, 160),
    licenseId: text(record.licenseId, `${path}.licenseId`, 200),
    licenseEvidenceSha256: sha256(record.licenseEvidenceSha256, `${path}.licenseEvidenceSha256`),
    obligationsEvidenceSha256: sha256(record.obligationsEvidenceSha256, `${path}.obligationsEvidenceSha256`),
    conclusion: enumValue(record.conclusion, DEPENDENCY_CONCLUSIONS, `${path}.conclusion`),
  });
}

function normalizeResourceEvidence(raw: unknown, path: string): HsmeTeacherResourceEvidenceV1 {
  const record = exactRecord(raw, [
    'installedBytes',
    'workingMemoryBytes',
    'workingMemoryKind',
    'hardwareProfileSha256',
    'methodSha256',
    'evidenceSha256',
  ], path);
  return Object.freeze({
    installedBytes: integer(record.installedBytes, `${path}.installedBytes`, 1, Number.MAX_SAFE_INTEGER),
    workingMemoryBytes: integer(record.workingMemoryBytes, `${path}.workingMemoryBytes`, 1, Number.MAX_SAFE_INTEGER),
    workingMemoryKind: enumValue(record.workingMemoryKind, WORKING_MEMORY_KINDS, `${path}.workingMemoryKind`),
    hardwareProfileSha256: sha256(record.hardwareProfileSha256, `${path}.hardwareProfileSha256`),
    methodSha256: sha256(record.methodSha256, `${path}.methodSha256`),
    evidenceSha256: sha256(record.evidenceSha256, `${path}.evidenceSha256`),
  });
}

function assertRuntimeLicenseCoverage(manifest: HsmeTeacherArtifactManifestV1, review: HsmeTeacherLicenseReviewV1): void {
  const runtimeArtifacts = manifest.artifacts.filter(artifact => artifact.runtimeRequired);
  const runtimeById = new Map(runtimeArtifacts.map(artifact => [artifact.logicalId, artifact]));
  const covered = new Set<string>();
  for (const dependency of review.dependencyReviews) {
    for (const logicalId of dependency.artifactLogicalIds) {
      const artifact = runtimeById.get(logicalId);
      if (!artifact) {
        fail('hsme_teacher_license_artifact_unknown', `license review covers non-runtime or unknown artifact ${logicalId}`);
      }
      if (!sameSource(artifact.source, dependency.source)) {
        fail('hsme_teacher_license_source_mismatch', `license review source differs for artifact ${logicalId}`);
      }
      if (covered.has(logicalId)) {
        fail('hsme_teacher_license_artifact_coverage_duplicate', `artifact ${logicalId} is covered more than once`);
      }
      covered.add(logicalId);
    }
  }
  if (covered.size !== runtimeArtifacts.length) {
    fail('hsme_teacher_license_artifact_coverage_incomplete', 'every runtime-required artifact must be covered by exactly one dependency license review');
  }
}

function uniqueByTeacher<T>(values: readonly T[], id: (value: T) => string, code: string): Map<string, T> {
  const result = new Map<string, T>();
  for (const value of values) {
    const key = id(value);
    if (result.has(key)) fail(code, `duplicate evidence for ${key}`);
    result.set(key, value);
  }
  return result;
}

function required<T>(value: T | undefined, code: string, teacherCandidateId: string): T {
  if (value === undefined) fail(code, `missing evidence for ${teacherCandidateId}`);
  return value;
}

async function domainDigest(domain: string, value: unknown, hashPort: HsmeTrainingHashPortV1): Promise<string> {
  const canonical = JSON.stringify(canonicalValue(value));
  const digest = await hashPort.sha256(new TextEncoder().encode(`${domain}\0${canonical}`));
  return sha256(digest, 'hashPort result');
}

function exactRecord(raw: unknown, allowed: readonly string[], path: string): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('hsme_teacher_trust_record_invalid', `${path} must be an object`);
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!allowed.includes(key)) fail('hsme_teacher_trust_field_unknown', `${path}.${key} is not allowed`);
  for (const key of allowed) if (!Object.hasOwn(record, key)) fail('hsme_teacher_trust_field_missing', `${path}.${key} is required`);
  return record;
}

function identifier(value: unknown, path: string, max: number): string {
  const result = text(value, path, max);
  if (!/^[a-z0-9][a-z0-9._:@/-]*$/.test(result)) fail('hsme_teacher_trust_identifier_invalid', `${path} is invalid`);
  return result;
}

function text(value: unknown, path: string, max: number): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || value.trim() !== value || /[\u0000-\u001f\u007f]/.test(value)) {
    fail('hsme_teacher_trust_text_invalid', `${path} is invalid`);
  }
  return value;
}

function integer(value: unknown, path: string, min: number, max: number): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > max) {
    fail('hsme_teacher_trust_integer_invalid', `${path} is invalid`);
  }
  return value as number;
}

function sha256(value: unknown, path: string): string {
  const result = text(value, path, 64);
  if (!HEX64.test(result)) fail('hsme_teacher_trust_hash_invalid', `${path} must be lowercase SHA-256`);
  return result;
}

function enumValue<T extends readonly string[]>(value: unknown, values: T, path: string): T[number] {
  if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) fail('hsme_teacher_trust_enum_invalid', `${path} is invalid`);
  return value as T[number];
}

function identifierSet(value: unknown, path: string, min: number, max: number, maxLen: number): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail('hsme_teacher_trust_array_invalid', `${path} must contain ${min}..${max} entries`);
  const result = value.map((entry, index) => identifier(entry, `${path}[${index}]`, maxLen));
  if (new Set(result).size !== result.length) fail('hsme_teacher_trust_array_duplicate', `${path} must be unique`);
  return Object.freeze([...result].sort(lexical));
}

function stringSet(value: unknown, path: string, min: number, max: number, maxLen: number): readonly string[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) fail('hsme_teacher_trust_array_invalid', `${path} must contain ${min}..${max} entries`);
  const result = value.map((entry, index) => text(entry, `${path}[${index}]`, maxLen));
  if (new Set(result).size !== result.length) fail('hsme_teacher_trust_array_duplicate', `${path} must be unique`);
  return Object.freeze([...result].sort(lexical));
}

function dependencyReviewKey(review: HsmeTeacherDependencyLicenseReviewV1): string {
  return `${sourceKey(review.source)}\0${review.licenseId}\0${review.artifactLogicalIds.join('\0')}`;
}

function sourceKey(source: HsmeTeacherArtifactSourceV1): string {
  return `${source.provider}\0${source.sourceRoot}\0${source.immutableRevision}`;
}

function sameSource(left: HsmeTeacherArtifactSourceV1, right: HsmeTeacherArtifactSourceV1): boolean {
  return sourceKey(left) === sourceKey(right);
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
  throw new HsmeTeacherTrustEvidenceV1Error(code, message);
}
