import assert from 'node:assert/strict';
import test from 'node:test';
import {
  HSME_TRAINING_PROVENANCE_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeTrainingProvenanceV1.ts';
import {
  HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA,
  normalizeHsmeTeacherQualityBakeoffV1,
  proveHsmeTeacherQualityAdmissionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherQualityEvidenceV1.ts';

const H = char => char.repeat(64);
const R = char => char.repeat(40);

function decision() {
  return {
    schemaVersion: HSME_TRAINING_PROVENANCE_V1_SCHEMA,
    decisionStatus: 'TEACHER_SET_ADMITTED',
    candidates: [
      {
        candidateId: 'quality-teacher-a', modelId: 'owner/teacher-a', architectureFamily: 'DIT',
        immutableRevision: R('1'), contentSha256: H('a'), checkpointBytes: 50_000,
        licenseId: 'Apache-2.0', licenseConclusion: 'COMMERCIAL_ADMISSIBLE', distillationOutputUse: 'DISTILLATION_ALLOWED',
        licenseEvidenceSha256: H('1'), toolchainEvidenceSha256: H('2'),
        installedBytes: 100_000, workingMemoryBytes: 200_000,
        qualityDomain: ['human-realism', 'image-editing', 'semantic-adherence'], knownWeaknesses: ['fixture-only'],
      },
      {
        candidateId: 'compact-teacher-b', modelId: 'owner/teacher-b', architectureFamily: 'DIT',
        immutableRevision: R('2'), contentSha256: H('b'), checkpointBytes: 5_000,
        licenseId: 'UNKNOWN', licenseConclusion: 'REVIEW_REQUIRED', distillationOutputUse: 'REVIEW_REQUIRED',
        installedBytes: 10_000, workingMemoryBytes: 20_000,
        qualityDomain: ['text-to-image'], knownWeaknesses: ['quality-floor-not-selected'],
      },
      {
        candidateId: 'reference-teacher-c', modelId: 'owner/teacher-c', architectureFamily: 'DIT',
        immutableRevision: R('3'), contentSha256: H('c'), checkpointBytes: 8_000,
        licenseId: 'UNKNOWN', licenseConclusion: 'REVIEW_REQUIRED', distillationOutputUse: 'REVIEW_REQUIRED',
        installedBytes: 16_000, workingMemoryBytes: 32_000,
        qualityDomain: ['multi-reference'], knownWeaknesses: ['reference-only'],
      },
    ],
    selectedCandidateIds: ['quality-teacher-a'],
    rationale: ['quality floor is evaluated before storage or working-memory efficiency'],
  };
}

function metric(metricId, capability, observedMicrounits, thresholdMicrounits, direction = 'HIGHER_IS_BETTER', char = 'd') {
  return { metricId, capability, direction, observedMicrounits, thresholdMicrounits, evidenceSha256: H(char) };
}

function human(dimensionId, capability, decisionValue = 'PASS', char = 'e') {
  return {
    dimensionId,
    capability,
    rubricSha256: H(char),
    panelSha256: H(char === 'e' ? 'f' : 'e'),
    evidenceSha256: H(char === 'd' ? 'c' : 'd'),
    decision: decisionValue,
  };
}

function result(teacherCandidateId, immutableRevision, modelContentSha256, capabilities, char) {
  return {
    teacherCandidateId,
    immutableRevision,
    modelContentSha256,
    capabilities,
    outputSetSha256: H(char),
    automatedChecks: capabilities.map((capability, index) => metric(
      `${teacherCandidateId}-metric-${index}`,
      capability,
      900_000,
      800_000,
      'HIGHER_IS_BETTER',
      index % 2 === 0 ? 'd' : 'e',
    )),
    humanChecks: capabilities.map((capability, index) => human(
      `${teacherCandidateId}-human-${index}`,
      capability,
      'PASS',
      index % 2 === 0 ? 'e' : 'f',
    )),
  };
}

function bakeoff() {
  const compact = result('compact-teacher-b', R('2'), H('b'), ['TEXT_TO_IMAGE'], '7');
  compact.automatedChecks[0].observedMicrounits = 700_000;
  compact.automatedChecks[0].thresholdMicrounits = 800_000;
  return {
    schemaVersion: HSME_TEACHER_QUALITY_BAKEOFF_V1_SCHEMA,
    policy: 'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    benchmarkPolicySha256: H('4'),
    fixtureSetSha256: H('5'),
    requiredCapabilities: ['TEXT_TO_IMAGE', 'IMAGE_EDITING'],
    candidateResults: [
      result('quality-teacher-a', R('1'), H('a'), ['TEXT_TO_IMAGE', 'IMAGE_EDITING'], '6'),
      compact,
      result('reference-teacher-c', R('3'), H('c'), ['IMAGE_EDITING', 'MULTI_REFERENCE_EDITING'], '8'),
    ],
    selectionRationaleSha256: H('9'),
  };
}

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

test('selected teacher quality gate is derived from threshold checks and human review before efficiency is considered', () => {
  const normalized = normalizeHsmeTeacherQualityBakeoffV1(bakeoff());
  assert.equal(normalized.candidateResults.find(value => value.teacherCandidateId === 'quality-teacher-a').qualityGatePassed, true);
  assert.equal(normalized.candidateResults.find(value => value.teacherCandidateId === 'compact-teacher-b').qualityGatePassed, false);

  const evidence = proveHsmeTeacherQualityAdmissionV1(decision(), bakeoff());
  assert.equal(evidence.policy, 'QUALITY_FLOOR_BEFORE_EFFICIENCY');
  assert.deepEqual(evidence.selectedTeacherIds, ['quality-teacher-a']);
  assert.deepEqual(evidence.coveredCapabilities, ['IMAGE_EDITING', 'TEXT_TO_IMAGE']);
  assert.equal(evidence.comparedCandidateCount, 3);
});

test('smaller teacher cannot be selected when an automated quality threshold fails', () => {
  const changedDecision = decision();
  changedDecision.candidates[1].licenseConclusion = 'COMMERCIAL_ADMISSIBLE';
  changedDecision.candidates[1].distillationOutputUse = 'DISTILLATION_ALLOWED';
  changedDecision.candidates[1].licenseEvidenceSha256 = H('1');
  changedDecision.candidates[1].toolchainEvidenceSha256 = H('2');
  changedDecision.selectedCandidateIds = ['compact-teacher-b'];
  changedDecision.rationale = ['fixture attempts to choose the smaller teacher despite a failed measured quality threshold'];
  expectCode(() => proveHsmeTeacherQualityAdmissionV1(changedDecision, bakeoff()), 'hsme_teacher_quality_gate_failed');
});

test('human visual review failure blocks admission even when automated metrics pass', () => {
  const changed = bakeoff();
  const selected = changed.candidateResults[0];
  selected.humanChecks[0].decision = 'FAIL';
  expectCode(() => proveHsmeTeacherQualityAdmissionV1(decision(), changed), 'hsme_teacher_quality_gate_failed');
});

test('selected teacher set must cover every required product capability', () => {
  const changed = bakeoff();
  changed.requiredCapabilities = ['TEXT_TO_IMAGE', 'IMAGE_EDITING', 'MULTI_REFERENCE_EDITING'];
  expectCode(() => proveHsmeTeacherQualityAdmissionV1(decision(), changed), 'hsme_teacher_quality_selected_coverage_incomplete');
});

test('every claimed capability requires both automated and human evidence', () => {
  const missingAutomated = bakeoff();
  missingAutomated.candidateResults[0].automatedChecks = missingAutomated.candidateResults[0].automatedChecks.filter(check => check.capability !== 'IMAGE_EDITING');
  expectCode(() => normalizeHsmeTeacherQualityBakeoffV1(missingAutomated), 'hsme_teacher_quality_automated_check_count_invalid');

  const missingHuman = bakeoff();
  missingHuman.candidateResults[0].humanChecks = missingHuman.candidateResults[0].humanChecks.filter(check => check.capability !== 'IMAGE_EDITING');
  expectCode(() => normalizeHsmeTeacherQualityBakeoffV1(missingHuman), 'hsme_teacher_quality_human_check_count_invalid');
});

test('quality evidence must bind the exact admitted model content and revision', () => {
  const changedContent = bakeoff();
  changedContent.candidateResults[0].modelContentSha256 = H('0');
  expectCode(() => proveHsmeTeacherQualityAdmissionV1(decision(), changedContent), 'hsme_teacher_quality_content_mismatch');

  const changedRevision = bakeoff();
  changedRevision.candidateResults[0].immutableRevision = R('9');
  expectCode(() => proveHsmeTeacherQualityAdmissionV1(decision(), changedRevision), 'hsme_teacher_quality_revision_mismatch');
});

test('quality bakeoff must compare exactly every candidate in the decision', () => {
  const changed = bakeoff();
  changed.candidateResults[2].teacherCandidateId = 'untracked-teacher';
  expectCode(() => proveHsmeTeacherQualityAdmissionV1(decision(), changed), 'hsme_teacher_quality_candidate_set_mismatch');
});

test('quality evidence rejects free-form qualityGatePassed override', () => {
  const changed = bakeoff();
  changed.candidateResults[1].qualityGatePassed = true;
  expectCode(() => normalizeHsmeTeacherQualityBakeoffV1(changed), 'hsme_teacher_quality_field_unknown');
});
