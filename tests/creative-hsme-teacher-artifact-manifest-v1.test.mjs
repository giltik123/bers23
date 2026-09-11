import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  HSME_TRAINING_PROVENANCE_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeTrainingProvenanceV1.ts';
import {
  HSME_TEACHER_ARTIFACT_ADMISSION_V1_SCHEMA,
  HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
  hsmeTeacherArtifactManifestDigestV1,
  normalizeHsmeTeacherArtifactManifestV1,
  proveHsmeTeacherArtifactAdmissionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherArtifactManifestV1.ts';

const H = char => char.repeat(64);
const R = char => char.repeat(40);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };
const source = (sourceRoot, immutableRevision) => ({ provider: 'HUGGING_FACE', sourceRoot, immutableRevision });

function baseManifest() {
  const primarySource = source('Qwen/Qwen-Image', R('a'));
  const textSource = source('Qwen/Qwen2.5-VL-7B-Instruct', R('b'));
  return {
    schemaVersion: HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
    teacherCandidateId: 'qwen-image-quality-teacher',
    primarySource,
    artifacts: [
      { logicalId: 'denoiser-0001', source: primarySource, relativePath: 'transformer/model-00001.safetensors', role: 'DENOISER_WEIGHT', contentSha256: H('1'), bytes: 600, runtimeRequired: true },
      { logicalId: 'text-encoder-0001', source: textSource, relativePath: 'model-00001.safetensors', role: 'TEXT_ENCODER_WEIGHT', contentSha256: H('2'), bytes: 200, runtimeRequired: true },
      { logicalId: 'vae-0001', source: primarySource, relativePath: 'vae/model.safetensors', role: 'VAE_WEIGHT', contentSha256: H('3'), bytes: 100, runtimeRequired: true },
      { logicalId: 'transformer-config', source: primarySource, relativePath: 'transformer/config.json', role: 'MODEL_CONFIG', contentSha256: H('4'), bytes: 10, runtimeRequired: true },
      { logicalId: 'tokenizer-vocab', source: textSource, relativePath: 'tokenizer/vocab.json', role: 'TOKENIZER_ASSET', contentSha256: H('5'), bytes: 11, runtimeRequired: true },
      { logicalId: 'scheduler-config', source: primarySource, relativePath: 'scheduler/scheduler_config.json', role: 'SCHEDULER_ASSET', contentSha256: H('6'), bytes: 12, runtimeRequired: true },
      { logicalId: 'research-note', source: primarySource, relativePath: 'README.md', role: 'RUNTIME_ASSET', contentSha256: H('7'), bytes: 5, runtimeRequired: false },
    ],
  };
}

async function fixture() {
  const manifest = normalizeHsmeTeacherArtifactManifestV1(baseManifest());
  const manifestDigest = await hsmeTeacherArtifactManifestDigestV1(manifest, hashPort);
  const decision = {
    schemaVersion: HSME_TRAINING_PROVENANCE_V1_SCHEMA,
    decisionStatus: 'TEACHER_SET_ADMITTED',
    candidates: [
      {
        candidateId: 'qwen-image-quality-teacher', modelId: 'Qwen/Qwen-Image', architectureFamily: 'FLOW_MATCHING_DIT',
        immutableRevision: R('a'), contentSha256: manifestDigest, checkpointBytes: 900,
        licenseId: 'Apache-2.0', licenseConclusion: 'COMMERCIAL_ADMISSIBLE', distillationOutputUse: 'DISTILLATION_ALLOWED',
        licenseEvidenceSha256: H('8'), toolchainEvidenceSha256: H('9'), installedBytes: 933, workingMemoryBytes: 2000,
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
    rationale: ['fixture proves canonical dependency-aware component pinning without granting production model authority'],
  };
  return { decision, manifest };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code, `expected ${code}`);
}

test('canonical artifact manifest digest is order-independent after normalization', async () => {
  const forward = normalizeHsmeTeacherArtifactManifestV1(baseManifest());
  const reversedRaw = baseManifest();
  reversedRaw.artifacts.reverse();
  const reversed = normalizeHsmeTeacherArtifactManifestV1(reversedRaw);
  assert.deepEqual(forward.artifacts.map(value => value.logicalId), reversed.artifacts.map(value => value.logicalId));
  assert.equal(await hsmeTeacherArtifactManifestDigestV1(forward, hashPort), await hsmeTeacherArtifactManifestDigestV1(reversed, hashPort));
});

test('selected teacher binds primary revision plus cross-repository dependencies and exact byte accounting', async () => {
  const { decision, manifest } = await fixture();
  const evidence = await proveHsmeTeacherArtifactAdmissionV1(decision, [manifest], hashPort);
  assert.equal(evidence.schemaVersion, HSME_TEACHER_ARTIFACT_ADMISSION_V1_SCHEMA);
  assert.deepEqual(evidence.selectedTeacherIds, ['qwen-image-quality-teacher']);
  assert.equal(evidence.entries[0].primaryImmutableRevision, R('a'));
  assert.equal(evidence.entries[0].weightBytes, 900);
  assert.equal(evidence.entries[0].installedBytes, 933);
  assert.equal(evidence.entries[0].workingMemoryBytes, 2000);
  assert.equal(evidence.entries[0].artifactCount, 7);
  assert.equal(evidence.entries[0].sourceCount, 2);
});

test('candidate contentSha256 must bind the canonical dependency-aware artifact manifest', async () => {
  const { decision, manifest } = await fixture();
  const changed = structuredClone(manifest);
  changed.artifacts[0].bytes += 1;
  await expectCode(proveHsmeTeacherArtifactAdmissionV1(decision, [changed], hashPort), 'hsme_teacher_artifact_root_mismatch');
});

test('candidate checkpointBytes is exact aggregate canonical weight bytes, not a free-form estimate', async () => {
  const { decision, manifest } = await fixture();
  decision.candidates[0].checkpointBytes = 899;
  await expectCode(proveHsmeTeacherArtifactAdmissionV1(decision, [manifest], hashPort), 'hsme_teacher_artifact_weight_bytes_mismatch');
});

test('installed bytes are derived only from runtime-required artifacts across all immutable dependencies', async () => {
  const { decision, manifest } = await fixture();
  decision.candidates[0].installedBytes = 938;
  await expectCode(proveHsmeTeacherArtifactAdmissionV1(decision, [manifest], hashPort), 'hsme_teacher_artifact_installed_bytes_mismatch');
});

test('working-memory evidence remains independent from installed bytes and cannot stay UNKNOWN', async () => {
  const { decision, manifest } = await fixture();
  decision.candidates[0].workingMemoryBytes = 'UNKNOWN';
  await expectCode(proveHsmeTeacherArtifactAdmissionV1(decision, [manifest], hashPort), 'hsme_teacher_working_memory_unresolved');
});

test('primary manifest revision must exactly equal the admitted immutable teacher revision', async () => {
  const { decision, manifest } = await fixture();
  const changed = structuredClone(manifest);
  const oldPrimary = changed.primarySource;
  const changedPrimary = source(oldPrimary.sourceRoot, R('c'));
  changed.primarySource = changedPrimary;
  changed.artifacts = changed.artifacts.map(artifact => (
    artifact.source.provider === oldPrimary.provider
      && artifact.source.sourceRoot === oldPrimary.sourceRoot
      && artifact.source.immutableRevision === oldPrimary.immutableRevision
      ? { ...artifact, source: changedPrimary }
      : artifact
  ));
  await expectCode(proveHsmeTeacherArtifactAdmissionV1(decision, [changed], hashPort), 'hsme_teacher_artifact_revision_mismatch');
});

test('artifacts from the primary source cannot silently mix revisions', () => {
  const changed = baseManifest();
  changed.artifacts[0].source = source('Qwen/Qwen-Image', R('c'));
  assert.throws(() => normalizeHsmeTeacherArtifactManifestV1(changed), error => error?.code === 'hsme_teacher_primary_revision_mixed');
});

test('the same relative path may exist in different dependency roots but not twice in the same immutable source', () => {
  const valid = baseManifest();
  valid.artifacts[1].relativePath = valid.artifacts[0].relativePath;
  assert.doesNotThrow(() => normalizeHsmeTeacherArtifactManifestV1(valid));

  const invalid = baseManifest();
  invalid.artifacts[1].source = structuredClone(invalid.artifacts[0].source);
  invalid.artifacts[1].relativePath = invalid.artifacts[0].relativePath;
  assert.throws(() => normalizeHsmeTeacherArtifactManifestV1(invalid), error => error?.code === 'hsme_teacher_artifact_path_duplicate');
});

test('canonical weights cannot be marked non-runtime merely to understate installed bytes', () => {
  const changed = baseManifest();
  changed.artifacts[0].runtimeRequired = false;
  assert.throws(() => normalizeHsmeTeacherArtifactManifestV1(changed), error => error?.code === 'hsme_teacher_weight_not_runtime_required');
});

test('v1 fails closed on model-repository runtime code instead of silently trusting remote code', async () => {
  const { decision, manifest } = await fixture();
  const changed = structuredClone(manifest);
  changed.artifacts[0].role = 'RUNTIME_CODE';
  await expectCode(proveHsmeTeacherArtifactAdmissionV1(decision, [changed], hashPort), 'hsme_teacher_remote_code_forbidden_v1');
});

test('artifact paths cannot escape an immutable dependency root', () => {
  const changed = baseManifest();
  changed.artifacts[0].relativePath = '../outside.safetensors';
  assert.throws(() => normalizeHsmeTeacherArtifactManifestV1(changed), error => error?.code === 'hsme_teacher_artifact_path_invalid');
});
