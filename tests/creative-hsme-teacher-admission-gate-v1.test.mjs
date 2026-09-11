import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { HSME_TRAINING_PROVENANCE_V1_SCHEMA } from '../src/platform/creative/local-ai/hsme/HsmeTrainingProvenanceV1.ts';
import {
  HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
  hsmeTeacherArtifactManifestDigestV1,
  normalizeHsmeTeacherArtifactManifestV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherArtifactManifestV1.ts';
import { HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA } from '../src/platform/creative/local-ai/hsme/HsmeTeacherQualityEvidenceV1.ts';
import {
  HSME_TEACHER_LICENSE_REVIEW_V1_SCHEMA,
  HSME_TEACHER_TOOLCHAIN_V1_SCHEMA,
  hsmeTeacherLicenseReviewDigestV1,
  hsmeTeacherToolchainDigestV1,
  normalizeHsmeTeacherLicenseReviewV1,
  normalizeHsmeTeacherToolchainV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherTrustEvidenceV1.ts';
import {
  HSME_TEACHER_ADMISSION_GATE_V1_SCHEMA,
  proveHsmeTeacherAdmissionGateV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherAdmissionGateV1.ts';

const H = char => char.repeat(64);
const R = char => char.repeat(40);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };
const hf = (sourceRoot, immutableRevision) => ({ provider: 'HUGGING_FACE', sourceRoot, immutableRevision });
const github = (sourceRoot, immutableRevision) => ({ provider: 'GITHUB', sourceRoot, immutableRevision });

function qualityResult(teacherCandidateId, immutableRevision, modelContentSha256, capabilities, passes = true) {
  return {
    teacherCandidateId,
    immutableRevision,
    modelContentSha256,
    capabilities,
    outputSetSha256: H('6'),
    automatedChecks: capabilities.map((capability, index) => ({
      metricId: `${teacherCandidateId}-metric-${index}`,
      capability,
      direction: 'HIGHER_IS_BETTER',
      observedMicrounits: passes ? 900_000 : 700_000,
      thresholdMicrounits: 800_000,
      evidenceSha256: H(index % 2 === 0 ? '7' : '8'),
    })),
    humanChecks: capabilities.map((capability, index) => ({
      dimensionId: `${teacherCandidateId}-human-${index}`,
      capability,
      rubricSha256: H('9'),
      panelSha256: H('a'),
      evidenceSha256: H('b'),
      decision: 'PASS',
    })),
  };
}

async function fixture() {
  const primary = hf('Qwen/Qwen-Image', R('a'));
  const manifest = normalizeHsmeTeacherArtifactManifestV1({
    schemaVersion: HSME_TEACHER_ARTIFACT_MANIFEST_V1_SCHEMA,
    teacherCandidateId: 'teacher-a',
    primarySource: primary,
    artifacts: [
      { logicalId: 'denoiser', source: primary, relativePath: 'transformer/model.safetensors', role: 'DENOISER_WEIGHT', contentSha256: H('1'), bytes: 600, runtimeRequired: true },
      { logicalId: 'text-encoder', source: primary, relativePath: 'text_encoder/model.safetensors', role: 'TEXT_ENCODER_WEIGHT', contentSha256: H('2'), bytes: 200, runtimeRequired: true },
      { logicalId: 'vae', source: primary, relativePath: 'vae/model.safetensors', role: 'VAE_WEIGHT', contentSha256: H('3'), bytes: 100, runtimeRequired: true },
      { logicalId: 'config', source: primary, relativePath: 'transformer/config.json', role: 'MODEL_CONFIG', contentSha256: H('4'), bytes: 10, runtimeRequired: true },
      { logicalId: 'tokenizer', source: primary, relativePath: 'tokenizer/vocab.json', role: 'TOKENIZER_ASSET', contentSha256: H('5'), bytes: 11, runtimeRequired: true },
      { logicalId: 'scheduler', source: primary, relativePath: 'scheduler/scheduler_config.json', role: 'SCHEDULER_ASSET', contentSha256: H('6'), bytes: 12, runtimeRequired: true },
    ],
  });
  const manifestDigest = await hsmeTeacherArtifactManifestDigestV1(manifest, hashPort);

  const licenseReview = normalizeHsmeTeacherLicenseReviewV1({
    schemaVersion: HSME_TEACHER_LICENSE_REVIEW_V1_SCHEMA,
    teacherCandidateId: 'teacher-a',
    artifactManifestDigest: manifestDigest,
    aggregateLicenseId: 'Apache-2.0',
    dependencyReviews: [{
      source: primary,
      artifactLogicalIds: ['config', 'denoiser', 'scheduler', 'text-encoder', 'tokenizer', 'vae'],
      licenseId: 'Apache-2.0', licenseEvidenceSha256: H('7'), obligationsEvidenceSha256: H('8'), conclusion: 'ADMITTED',
    }],
    commercialUseConclusion: 'COMMERCIAL_ADMISSIBLE',
    distillationOutputUse: 'DISTILLATION_ALLOWED',
    reviewPolicySha256: H('9'),
    rationale: ['fixture-only explicit rights conclusion'],
  });
  const licenseDigest = await hsmeTeacherLicenseReviewDigestV1(licenseReview, hashPort);

  const toolchain = normalizeHsmeTeacherToolchainV1({
    schemaVersion: HSME_TEACHER_TOOLCHAIN_V1_SCHEMA,
    teacherCandidateId: 'teacher-a',
    artifactManifestDigest: manifestDigest,
    runtimeSource: github('QwenLM/Qwen-Image', R('b')),
    containerImageSha256: H('a'), packageLockSha256: H('b'), frameworkLockSha256: H('c'),
    targetProgramSha256: H('d'), invocationSchemaSha256: H('e'), determinismPolicySha256: H('f'),
    resourceEvidence: {
      installedBytes: 933, workingMemoryBytes: 2000, workingMemoryKind: 'ESTIMATED',
      hardwareProfileSha256: H('1'), methodSha256: H('2'), evidenceSha256: H('3'),
    },
    remoteCodePolicy: 'NO_MODEL_REPOSITORY_RUNTIME_CODE',
  });
  const toolchainDigest = await hsmeTeacherToolchainDigestV1(toolchain, hashPort);

  const decision = {
    schemaVersion: HSME_TRAINING_PROVENANCE_V1_SCHEMA,
    decisionStatus: 'TEACHER_SET_ADMITTED',
    candidates: [
      {
        candidateId: 'teacher-a', modelId: 'Qwen/Qwen-Image', architectureFamily: 'FLOW_MATCHING_DIT',
        immutableRevision: R('a'), contentSha256: manifestDigest, checkpointBytes: 900,
        licenseId: 'Apache-2.0', licenseConclusion: 'COMMERCIAL_ADMISSIBLE', distillationOutputUse: 'DISTILLATION_ALLOWED',
        licenseEvidenceSha256: licenseDigest, toolchainEvidenceSha256: toolchainDigest,
        installedBytes: 933, workingMemoryBytes: 2000,
        qualityDomain: ['image-editing', 'semantic-adherence', 'text-rendering'], knownWeaknesses: ['fixture-only'],
      },
      {
        candidateId: 'teacher-b', modelId: 'owner/teacher-b', architectureFamily: 'DIT',
        immutableRevision: R('c'), contentSha256: H('c'),
        licenseId: 'UNKNOWN', licenseConclusion: 'REVIEW_REQUIRED', distillationOutputUse: 'REVIEW_REQUIRED',
        installedBytes: 'UNKNOWN', workingMemoryBytes: 'UNKNOWN', qualityDomain: ['comparison'], knownWeaknesses: ['not-selected'],
      },
      {
        candidateId: 'teacher-c', modelId: 'owner/teacher-c', architectureFamily: 'DIT',
        immutableRevision: R('d'), contentSha256: H('d'),
        licenseId: 'UNKNOWN', licenseConclusion: 'REVIEW_REQUIRED', distillationOutputUse: 'REVIEW_REQUIRED',
        installedBytes: 'UNKNOWN', workingMemoryBytes: 'UNKNOWN', qualityDomain: ['comparison'], knownWeaknesses: ['not-selected'],
      },
    ],
    selectedCandidateIds: ['teacher-a'],
    rationale: ['canonical admission requires measured quality and exact trust evidence for the selected teacher set'],
  };

  const qualityBakeoff = {
    schemaVersion: HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA,
    policy: 'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    benchmarkPolicySha256: H('4'),
    fixtureSetSha256: H('5'),
    requiredCapabilities: ['TEXT_TO_IMAGE', 'IMAGE_EDITING'],
    candidateResults: [
      qualityResult('teacher-a', R('a'), manifestDigest, ['TEXT_TO_IMAGE', 'IMAGE_EDITING'], true),
      qualityResult('teacher-b', R('c'), H('c'), ['TEXT_TO_IMAGE'], false),
      qualityResult('teacher-c', R('d'), H('d'), ['IMAGE_EDITING', 'MULTI_REFERENCE_EDITING'], true),
    ],
    selectionRationaleSha256: H('2'),
  };

  return { decision, qualityBakeoff, manifest, licenseReview, toolchain };
}

async function expectCode(promise, code) {
  await assert.rejects(promise, error => error?.code === code, `expected ${code}`);
}

test('canonical gate admits only a measured quality-qualified exact selected-teacher evidence set', async () => {
  const { decision, qualityBakeoff, manifest, licenseReview, toolchain } = await fixture();
  const evidence = await proveHsmeTeacherAdmissionGateV1(decision, qualityBakeoff, [manifest], [licenseReview], [toolchain], hashPort);
  assert.equal(evidence.schemaVersion, HSME_TEACHER_ADMISSION_GATE_V1_SCHEMA);
  assert.deepEqual(evidence.selectedTeacherIds, ['teacher-a']);
  assert.deepEqual(evidence.qualityEvidence.selectedTeacherIds, ['teacher-a']);
  assert.deepEqual(evidence.trustEvidence.selectedTeacherIds, ['teacher-a']);
});

test('every quality comparator must be immutably pinned in the decision', async () => {
  const { decision, qualityBakeoff, manifest, licenseReview, toolchain } = await fixture();
  delete decision.candidates[1].contentSha256;
  await expectCode(
    proveHsmeTeacherAdmissionGateV1(decision, qualityBakeoff, [manifest], [licenseReview], [toolchain], hashPort),
    'hsme_teacher_admission_bakeoff_candidate_unpinned',
  );
});

test('quality comparator evidence must match its exact decision pin', async () => {
  const { decision, qualityBakeoff, manifest, licenseReview, toolchain } = await fixture();
  qualityBakeoff.candidateResults[1].modelContentSha256 = H('0');
  await expectCode(
    proveHsmeTeacherAdmissionGateV1(decision, qualityBakeoff, [manifest], [licenseReview], [toolchain], hashPort),
    'hsme_teacher_admission_bakeoff_content_mismatch',
  );
});

test('final admission fails before trust evidence when selected teacher measured quality threshold fails', async () => {
  const { decision, qualityBakeoff, manifest, licenseReview, toolchain } = await fixture();
  qualityBakeoff.candidateResults[0].automatedChecks[0].observedMicrounits = 700_000;
  await expectCode(
    proveHsmeTeacherAdmissionGateV1(decision, qualityBakeoff, [manifest], [licenseReview], [toolchain], hashPort),
    'hsme_teacher_quality_gate_failed',
  );
});

test('final admission fails when selected teacher human review fails', async () => {
  const { decision, qualityBakeoff, manifest, licenseReview, toolchain } = await fixture();
  qualityBakeoff.candidateResults[0].humanChecks[0].decision = 'FAIL';
  await expectCode(
    proveHsmeTeacherAdmissionGateV1(decision, qualityBakeoff, [manifest], [licenseReview], [toolchain], hashPort),
    'hsme_teacher_quality_gate_failed',
  );
});

test('extra stale manifest for an unselected teacher fails closed', async () => {
  const { decision, qualityBakeoff, manifest, licenseReview, toolchain } = await fixture();
  const extra = structuredClone(manifest);
  extra.teacherCandidateId = 'teacher-b';
  extra.primarySource = hf('owner/teacher-b', R('c'));
  extra.artifacts = extra.artifacts.map(value => ({ ...value, source: extra.primarySource }));
  await expectCode(
    proveHsmeTeacherAdmissionGateV1(decision, qualityBakeoff, [manifest, extra], [licenseReview], [toolchain], hashPort),
    'hsme_teacher_admission_evidence_set_mismatch',
  );
});

test('extra stale license review for an unselected teacher fails closed', async () => {
  const { decision, qualityBakeoff, manifest, licenseReview, toolchain } = await fixture();
  const extra = structuredClone(licenseReview);
  extra.teacherCandidateId = 'teacher-b';
  await expectCode(
    proveHsmeTeacherAdmissionGateV1(decision, qualityBakeoff, [manifest], [licenseReview, extra], [toolchain], hashPort),
    'hsme_teacher_admission_evidence_set_mismatch',
  );
});

test('extra stale toolchain for an unselected teacher fails closed', async () => {
  const { decision, qualityBakeoff, manifest, licenseReview, toolchain } = await fixture();
  const extra = structuredClone(toolchain);
  extra.teacherCandidateId = 'teacher-b';
  await expectCode(
    proveHsmeTeacherAdmissionGateV1(decision, qualityBakeoff, [manifest], [licenseReview], [toolchain, extra], hashPort),
    'hsme_teacher_admission_evidence_set_mismatch',
  );
});

test('missing evidence for a selected teacher fails closed before trust admission', async () => {
  const { decision, qualityBakeoff, manifest, licenseReview } = await fixture();
  await expectCode(
    proveHsmeTeacherAdmissionGateV1(decision, qualityBakeoff, [manifest], [licenseReview], [], hashPort),
    'hsme_teacher_admission_evidence_count_invalid',
  );
});
