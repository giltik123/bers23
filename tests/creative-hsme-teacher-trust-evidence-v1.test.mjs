import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { HSME_TRAINING_PROVENANCE_V1_SCHEMA } from '../src/platform/creative/local-ai/hsme/HsmeTrainingProvenanceV1.ts';
import {
  HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
  hsmeTeacherArtifactManifestDigestV1,
  normalizeHsmeTeacherArtifactManifestV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherArtifactManifestV1.ts';
import {
  HSME_TEACHER_LICENSE_REVIEW_V1_SCHEMA,
  HSME_TEACHER_TOOLCHAIN_V1_SCHEMA,
  HSME_TEACHER_TRUST_ADMISSION_V1_SCHEMA,
  hsmeTeacherLicenseReviewDigestV1,
  hsmeTeacherToolchainDigestV1,
  normalizeHsmeTeacherLicenseReviewV1,
  normalizeHsmeTeacherToolchainV1,
  proveHsmeTeacherTrustAdmissionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherTrustEvidenceV1.ts';

const H = char => char.repeat(64);
const R = char => char.repeat(40);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };
const hf = (sourceRoot, immutableRevision) => ({ provider: 'HUGGING_FACE', sourceRoot, immutableRevision });
const github = (sourceRoot, immutableRevision) => ({ provider: 'GITHUB', sourceRoot, immutableRevision });

function manifestRaw() {
  const primary = hf('Qwen/Qwen-Image', R('a'));
  const text = hf('Qwen/Qwen2.5-VL-7B-Instruct', R('b'));
  return {
    schemaVersion: HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
    teacherCandidateId: 'qwen-image-quality-teacher',
    primarySource: primary,
    artifacts: [
      { logicalId: 'denoiser-0001', source: primary, relativePath: 'transformer/model-00001.safetensors', role: 'DENOISER_WEIGHT', contentSha256: H('1'), bytes: 600, runtimeRequired: true },
      { logicalId: 'text-encoder-0001', source: text, relativePath: 'model-00001.safetensors', role: 'TEXT_ENCODER_WEIGHT', contentSha256: H('2'), bytes: 200, runtimeRequired: true },
      { logicalId: 'vae-0001', source: primary, relativePath: 'vae/model.safetensors', role: 'VAE_WEIGHT', contentSha256: H('3'), bytes: 100, runtimeRequired: true },
      { logicalId: 'transformer-config', source: primary, relativePath: 'transformer/config.json', role: 'MODEL_CONFIG', contentSha256: H('4'), bytes: 10, runtimeRequired: true },
      { logicalId: 'tokenizer-vocab', source: text, relativePath: 'tokenizer/vocab.json', role: 'TOKENIZER_ASSET', contentSha256: H('5'), bytes: 11, runtimeRequired: true },
      { logicalId: 'scheduler-config', source: primary, relativePath: 'scheduler/scheduler_config.json', role: 'SCHEDULER_ASSET', contentSha256: H('6'), bytes: 12, runtimeRequired: true },
      { logicalId: 'readme', source: primary, relativePath: 'README.md', role: 'RUNTIME_ASSET', contentSha256: H('7'), bytes: 5, runtimeRequired: false },
    ],
  };
}

function resourceEvidence() {
  return {
    installedBytes: 933,
    workingMemoryBytes: 2000,
    workingMemoryKind: 'ESTIMATED',
    hardwareProfileSha256: H('4'),
    methodSha256: H('5'),
    evidenceSha256: H('6'),
  };
}

async function fixture() {
  const manifest = normalizeHsmeTeacherArtifactManifestV1(manifestRaw());
  const manifestDigest = await hsmeTeacherArtifactManifestDigestV1(manifest, hashPort);
  const licenseReview = normalizeHsmeTeacherLicenseReviewV1({
    schemaVersion: HSME_TEACHER_LICENSE_REVIEW_V1_SCHEMA,
    teacherCandidateId: 'qwen-image-quality-teacher',
    artifactManifestDigest: manifestDigest,
    aggregateLicenseId: 'Apache-2.0',
    dependencyReviews: [
      {
        source: hf('Qwen/Qwen-Image', R('a')),
        artifactLogicalIds: ['denoiser-0001', 'scheduler-config', 'transformer-config', 'vae-0001'],
        licenseId: 'Apache-2.0', licenseEvidenceSha256: H('8'), obligationsEvidenceSha256: H('9'), conclusion: 'ADMITTED',
      },
      {
        source: hf('Qwen/Qwen2.5-VL-7B-Instruct', R('b')),
        artifactLogicalIds: ['text-encoder-0001', 'tokenizer-vocab'],
        licenseId: 'Apache-2.0', licenseEvidenceSha256: H('a'), obligationsEvidenceSha256: H('b'), conclusion: 'ADMITTED',
      },
    ],
    commercialUseConclusion: 'COMMERCIAL_ADMISSIBLE',
    distillationOutputUse: 'DISTILLATION_ALLOWED',
    reviewPolicySha256: H('c'),
    rationale: ['fixture represents an explicit dependency-level rights review; it is not production legal evidence'],
  });
  const licenseReviewDigest = await hsmeTeacherLicenseReviewDigestV1(licenseReview, hashPort);

  const toolchain = normalizeHsmeTeacherToolchainV1({
    schemaVersion: HSME_TEACHER_TOOLCHAIN_V1_SCHEMA,
    teacherCandidateId: 'qwen-image-quality-teacher',
    artifactManifestDigest: manifestDigest,
    runtimeSource: github('QwenLM/Qwen-Image', R('d')),
    containerImageSha256: H('d'),
    packageLockSha256: H('e'),
    frameworkLockSha256: H('f'),
    targetProgramSha256: H('1'),
    invocationSchemaSha256: H('2'),
    determinismPolicySha256: H('3'),
    resourceEvidence: resourceEvidence(),
    remoteCodePolicy: 'NO_MODEL_REPOSITORY_RUNTIME_CODE',
  });
  const toolchainDigest = await hsmeTeacherToolchainDigestV1(toolchain, hashPort);

  const decision = {
    schemaVersion: HSME_TRAINING_PROVENANCE_V1_SCHEMA,
    decisionStatus: 'TEACHER_SET_ADMITTED',
    candidates: [
      {
        candidateId: 'qwen-image-quality-teacher', modelId: 'Qwen/Qwen-Image', architectureFamily: 'FLOW_MATCHING_DIT',
        immutableRevision: R('a'), contentSha256: manifestDigest, checkpointBytes: 900,
        licenseId: 'Apache-2.0', licenseConclusion: 'COMMERCIAL_ADMISSIBLE', distillationOutputUse: 'DISTILLATION_ALLOWED',
        licenseEvidenceSha256: licenseReviewDigest, toolchainEvidenceSha256: toolchainDigest,
        installedBytes: 933, workingMemoryBytes: 2000,
        qualityDomain: ['image-editing', 'semantic-adherence', 'text-rendering'], knownWeaknesses: ['fixture-only'],
      },
      {
        candidateId: 'flux-quality-comparator', modelId: 'black-forest-labs/FLUX.1-schnell', architectureFamily: 'RECTIFIED_FLOW_TRANSFORMER',
        licenseId: 'Apache-2.0', licenseConclusion: 'REVIEW_REQUIRED', distillationOutputUse: 'REVIEW_REQUIRED',
        installedBytes: 'UNKNOWN', workingMemoryBytes: 'UNKNOWN', qualityDomain: ['prompt-adherence'], knownWeaknesses: ['rights-unresolved'],
      },
      {
        candidateId: 'sana-few-step-reference', modelId: 'Efficient-Large-Model/Sana_Sprint_0.6B_1024px_teacher', architectureFamily: 'LINEAR_DIT',
        licenseId: 'Apache-2.0 plus Gemma terms', licenseConclusion: 'REVIEW_REQUIRED', distillationOutputUse: 'REVIEW_REQUIRED',
        installedBytes: 'UNKNOWN', workingMemoryBytes: 'UNKNOWN', qualityDomain: ['few-step-generation'], knownWeaknesses: ['rights-unresolved'],
      },
    ],
    selectedCandidateIds: ['qwen-image-quality-teacher'],
    rationale: ['fixture proves license, resource and toolchain digests are derived evidence, not free-form hashes'],
  };
  return { decision, manifest, licenseReview, toolchain };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code, `expected ${code}`);
}

test('full teacher trust admission binds artifacts, per-dependency rights, independent resources and exact target-generation toolchain', async () => {
  const { decision, manifest, licenseReview, toolchain } = await fixture();
  const evidence = await proveHsmeTeacherTrustAdmissionV1(decision, [manifest], [licenseReview], [toolchain], hashPort);
  assert.equal(evidence.schemaVersion, HSME_TEACHER_TRUST_ADMISSION_V1_SCHEMA);
  assert.deepEqual(evidence.selectedTeacherIds, ['qwen-image-quality-teacher']);
  assert.equal(evidence.entries[0].runtimeArtifactCount, 6);
  assert.equal(evidence.entries[0].dependencyReviewCount, 2);
  assert.equal(evidence.entries[0].workingMemoryKind, 'ESTIMATED');
});

test('every runtime-required artifact must be covered by exactly one dependency license review', async () => {
  const { decision, manifest, licenseReview, toolchain } = await fixture();
  const changed = structuredClone(licenseReview);
  changed.dependencyReviews[1].artifactLogicalIds = ['text-encoder-0001'];
  await expectCode(proveHsmeTeacherTrustAdmissionV1(decision, [manifest], [changed], [toolchain], hashPort), 'hsme_teacher_license_artifact_coverage_incomplete');
});

test('dependency license source must match the exact artifact source and revision', async () => {
  const { decision, manifest, licenseReview, toolchain } = await fixture();
  const changed = structuredClone(licenseReview);
  changed.dependencyReviews[1].source.immutableRevision = R('e');
  await expectCode(proveHsmeTeacherTrustAdmissionV1(decision, [manifest], [changed], [toolchain], hashPort), 'hsme_teacher_license_source_mismatch');
});

test('candidate licenseEvidenceSha256 must be the normalized license-review digest', async () => {
  const { decision, manifest, licenseReview, toolchain } = await fixture();
  decision.candidates[0].licenseEvidenceSha256 = H('0');
  await expectCode(proveHsmeTeacherTrustAdmissionV1(decision, [manifest], [licenseReview], [toolchain], hashPort), 'hsme_teacher_license_digest_mismatch');
});

test('candidate toolchainEvidenceSha256 must be the normalized exact toolchain/resource digest', async () => {
  const { decision, manifest, licenseReview, toolchain } = await fixture();
  decision.candidates[0].toolchainEvidenceSha256 = H('0');
  await expectCode(proveHsmeTeacherTrustAdmissionV1(decision, [manifest], [licenseReview], [toolchain], hashPort), 'hsme_teacher_toolchain_digest_mismatch');
});

test('toolchain must bind the exact artifact manifest', async () => {
  const { decision, manifest, licenseReview, toolchain } = await fixture();
  const changed = structuredClone(toolchain);
  changed.artifactManifestDigest = H('0');
  await expectCode(proveHsmeTeacherTrustAdmissionV1(decision, [manifest], [licenseReview], [changed], hashPort), 'hsme_teacher_toolchain_manifest_mismatch');
});

test('installed/download bytes remain artifact-derived and cannot be changed by resource evidence', async () => {
  const { decision, manifest, licenseReview, toolchain } = await fixture();
  const changed = structuredClone(toolchain);
  changed.resourceEvidence.installedBytes = 934;
  await expectCode(proveHsmeTeacherTrustAdmissionV1(decision, [manifest], [licenseReview], [changed], hashPort), 'hsme_teacher_resource_installed_bytes_mismatch');
});

test('working-memory evidence is independent and must equal the separately recorded candidate value', async () => {
  const { decision, manifest, licenseReview, toolchain } = await fixture();
  const changed = structuredClone(toolchain);
  changed.resourceEvidence.workingMemoryBytes = 1999;
  await expectCode(proveHsmeTeacherTrustAdmissionV1(decision, [manifest], [licenseReview], [changed], hashPort), 'hsme_teacher_resource_working_memory_mismatch');
});

test('target-generation source must be an immutable GitHub revision, not a floating model endpoint', () => {
  const bad = {
    schemaVersion: HSME_TEACHER_TOOLCHAIN_V1_SCHEMA,
    teacherCandidateId: 'qwen-image-quality-teacher', artifactManifestDigest: H('1'),
    runtimeSource: hf('Qwen/Qwen-Image', R('a')),
    containerImageSha256: H('2'), packageLockSha256: H('3'), frameworkLockSha256: H('4'), targetProgramSha256: H('5'), invocationSchemaSha256: H('6'), determinismPolicySha256: H('7'),
    resourceEvidence: resourceEvidence(),
    remoteCodePolicy: 'NO_MODEL_REPOSITORY_RUNTIME_CODE',
  };
  assert.throws(() => normalizeHsmeTeacherToolchainV1(bad), error => error?.code === 'hsme_teacher_toolchain_source_invalid');
});

test('commercial admission fails closed if any runtime dependency review remains unresolved', () => {
  const raw = {
    schemaVersion: HSME_TEACHER_LICENSE_REVIEW_V1_SCHEMA,
    teacherCandidateId: 'teacher-a', artifactManifestDigest: H('1'), aggregateLicenseId: 'mixed',
    dependencyReviews: [{
      source: hf('owner/model', R('a')), artifactLogicalIds: ['weight-a'], licenseId: 'unknown', licenseEvidenceSha256: H('2'), obligationsEvidenceSha256: H('3'), conclusion: 'REVIEW_REQUIRED',
    }],
    commercialUseConclusion: 'COMMERCIAL_ADMISSIBLE', distillationOutputUse: 'DISTILLATION_ALLOWED', reviewPolicySha256: H('4'), rationale: ['unresolved dependency must fail closed'],
  };
  assert.throws(() => normalizeHsmeTeacherLicenseReviewV1(raw), error => error?.code === 'hsme_teacher_license_dependency_unresolved');
});

test('resource evidence must state whether working memory is measured or estimated', () => {
  const bad = {
    schemaVersion: HSME_TEACHER_TOOLCHAIN_V1_SCHEMA,
    teacherCandidateId: 'teacher-a', artifactManifestDigest: H('1'),
    runtimeSource: github('owner/repo', R('a')),
    containerImageSha256: H('2'), packageLockSha256: H('3'), frameworkLockSha256: H('4'), targetProgramSha256: H('5'), invocationSchemaSha256: H('6'), determinismPolicySha256: H('7'),
    resourceEvidence: { ...resourceEvidence(), workingMemoryKind: 'UNKNOWN' },
    remoteCodePolicy: 'NO_MODEL_REPOSITORY_RUNTIME_CODE',
  };
  assert.throws(() => normalizeHsmeTeacherToolchainV1(bad), error => error?.code === 'hsme_teacher_trust_enum_invalid');
});
