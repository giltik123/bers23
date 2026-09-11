import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA,
  HsmeDenseBaselineEvidenceV1Error,
  hsmeDenseBaselineDecisionV1Digest,
  normalizeHsmeDenseBaselineDecisionV1,
  serializeHsmeDenseBaselineDecisionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

const decisionUrl = new URL('../src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-decision.json', import.meta.url);
const rawDecision = JSON.parse(await readFile(decisionUrl, 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));
const hash = {
  async sha256(bytes) {
    return createHash('sha256').update(bytes).digest('hex');
  },
};
const sha = char => char.repeat(64);

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof HsmeDenseBaselineEvidenceV1Error && error.code === code);
}

function futurePin() {
  return {
    modelId: 'bers-dense-core',
    version: '0.1.0-candidate.1',
    sourceUri: 'https://models.example.invalid/bers-dense-core',
    sourceRevision: '0123456789abcdef0123456789abcdef01234567',
    contentSha256: sha('a'),
    packageBytes: 800000000,
    license: 'BERS-reviewed-commercial',
    licenseConclusion: 'COMMERCIAL_ADMISSIBLE',
    licenseEvidenceSha256: sha('b'),
    toolchainLockSha256: sha('c'),
    architectureConfigSha256: sha('d'),
    representationManifestSha256: sha('e'),
    evaluationContractSha256: sha('f'),
    qualityEvidenceSha256: sha('1'),
    runtimeEvidenceSha256: sha('2'),
    hsmeBindingEvidenceSha256: sha('3'),
  };
}

test('HSME-2a decision normalizes to deterministic bytes and digest', async () => {
  const first = normalizeHsmeDenseBaselineDecisionV1(clone(rawDecision));
  const shuffled = clone(rawDecision);
  shuffled.candidates.reverse();
  shuffled.rationale.reverse();
  for (const candidate of shuffled.candidates) {
    candidate.reasons.reverse();
    candidate.sources.reverse();
    candidate.metrics.supportedStepCounts.reverse();
  }
  shuffled.trainingTarget.requiredEvidence.reverse();
  shuffled.trainingTarget.architectureReferences.reverse();
  shuffled.trainingTarget.targetStepCounts.reverse();
  const second = normalizeHsmeDenseBaselineDecisionV1(shuffled);

  assert.equal(first.schemaVersion, HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA);
  assert.equal(first.decisionStatus, 'REDESIGN_REQUIRED');
  assert.equal(serializeHsmeDenseBaselineDecisionV1(first), serializeHsmeDenseBaselineDecisionV1(second));
  assert.equal(await hsmeDenseBaselineDecisionV1Digest(first, hash), await hsmeDenseBaselineDecisionV1Digest(second, hash));
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.candidates));
});

test('current decision compares multiple strategies and selects BERS training rather than fake promotion', () => {
  const decision = normalizeHsmeDenseBaselineDecisionV1(clone(rawDecision));
  assert.ok(decision.candidates.length >= 5);
  assert.ok(decision.candidates.some(candidate => candidate.strategy === 'CONTROL_BASELINE'));
  assert.ok(decision.candidates.some(candidate => candidate.strategy === 'OFF_THE_SHELF_DIT'));
  assert.ok(decision.candidates.some(candidate => candidate.strategy === 'MOBILE_ARCHITECTURE_REFERENCE'));
  assert.equal(decision.selectedCandidateId, 'bers-dense-core-v1-training-target');
  assert.equal(decision.trainingTarget?.architectureFamily, 'COMPACT_DIT');
  assert.equal(decision.baselinePin, undefined);

  const tiny = decision.candidates.find(candidate => candidate.candidateId === 'tiny-sd-control-v1');
  assert.equal(tiny?.metrics.fullPipelineBytes, 1062108664);
  assert.equal(tiny?.verdict, 'CONTROL_ONLY');

  const sana = decision.candidates.find(candidate => candidate.candidateId === 'sana-sprint-0.6b-reference');
  assert.equal(sana?.metrics.textConditionerBytes, 5228683776);
  assert.deepEqual(sana?.metrics.supportedStepCounts, [1, 2, 3, 4]);
  assert.equal(sana?.verdict, 'REJECT_RUNTIME_FOOTPRINT');
});

test('decision fails closed if candidate comparison is narrowed below three strategies', () => {
  const invalid = clone(rawDecision);
  invalid.candidates = invalid.candidates.slice(0, 2);
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(invalid), 'hsme_dense_baseline_candidate_count_invalid');
});

test('decision fails closed when required control, off-the-shelf DiT or mobile reference is removed', () => {
  const noControl = clone(rawDecision);
  noControl.candidates = noControl.candidates.filter(candidate => candidate.strategy !== 'CONTROL_BASELINE');
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(noControl), 'hsme_dense_baseline_control_missing');

  const noDit = clone(rawDecision);
  noDit.candidates = noDit.candidates.filter(candidate => candidate.strategy !== 'OFF_THE_SHELF_DIT');
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(noDit), 'hsme_dense_baseline_dit_comparison_missing');

  const noMobile = clone(rawDecision);
  noMobile.candidates = noMobile.candidates.filter(candidate => candidate.strategy !== 'MOBILE_ARCHITECTURE_REFERENCE');
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(noMobile), 'hsme_dense_baseline_mobile_reference_missing');
});

test('BASELINE_PINNED cannot be asserted without immutable pin evidence', () => {
  const invalid = clone(rawDecision);
  invalid.decisionStatus = 'BASELINE_PINNED';
  delete invalid.trainingTarget;
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(invalid), 'hsme_dense_baseline_pin_required');
});

test('future baseline pin is content-addressed across source, license, toolchain, evaluation, quality, runtime and HSME binding', () => {
  const pinned = clone(rawDecision);
  pinned.decisionStatus = 'BASELINE_PINNED';
  delete pinned.trainingTarget;
  const selected = pinned.candidates.find(candidate => candidate.candidateId === pinned.selectedCandidateId);
  selected.verdict = 'SELECTED_BASELINE';
  pinned.baselinePin = futurePin();
  const normalized = normalizeHsmeDenseBaselineDecisionV1(pinned);
  assert.equal(normalized.decisionStatus, 'BASELINE_PINNED');
  assert.equal(normalized.baselinePin?.packageBytes, 800000000);
  assert.equal(normalized.baselinePin?.qualityEvidenceSha256, sha('1'));
  assert.equal(normalized.baselinePin?.runtimeEvidenceSha256, sha('2'));
  assert.equal(normalized.baselinePin?.hsmeBindingEvidenceSha256, sha('3'));

  const mutableRevision = clone(pinned);
  mutableRevision.baselinePin.sourceRevision = 'main';
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(mutableRevision), 'hsme_dense_baseline_pin_invalid');

  const missingQuality = clone(pinned);
  delete missingQuality.baselinePin.qualityEvidenceSha256;
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(missingQuality), 'hsme_dense_baseline_exact_schema_violation');

  const malformedEvidence = clone(pinned);
  malformedEvidence.baselinePin.runtimeEvidenceSha256 = 'not-a-sha';
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(malformedEvidence), 'hsme_dense_baseline_pin_invalid');
});

test('REDESIGN_REQUIRED cannot smuggle a fake pin or select a non-BERS candidate', () => {
  const fakePin = clone(rawDecision);
  fakePin.baselinePin = futurePin();
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(fakePin), 'hsme_dense_baseline_redesign_invalid');

  const wrongSelection = clone(rawDecision);
  wrongSelection.selectedCandidateId = 'sana-sprint-0.6b-reference';
  wrongSelection.trainingTarget.candidateId = 'sana-sprint-0.6b-reference';
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(wrongSelection), 'hsme_dense_baseline_training_target_invalid');
});

test('training target records current HSME envelope without turning R&D targets into schema authority', () => {
  const decision = normalizeHsmeDenseBaselineDecisionV1(clone(rawDecision));
  assert.ok(decision.trainingTarget);
  assert.equal(decision.trainingTarget.initialUsefulPackBytes.max, 900000000);
  assert.equal(decision.trainingTarget.activeWeightsMaxBytes, 800000000);
  assert.equal(decision.trainingTarget.textConditionerMaxBytes, 268435456);
  assert.deepEqual(decision.trainingTarget.targetStepCounts, [2, 4, 6, 8]);

  const evidenceDrivenRevision = clone(rawDecision);
  evidenceDrivenRevision.trainingTarget.initialUsefulPackBytes.max = 920000000;
  evidenceDrivenRevision.trainingTarget.activeWeightsMaxBytes = 820000000;
  const revised = normalizeHsmeDenseBaselineDecisionV1(evidenceDrivenRevision);
  assert.equal(revised.trainingTarget?.initialUsefulPackBytes.max, 920000000);
  assert.equal(revised.trainingTarget?.activeWeightsMaxBytes, 820000000);
});

test('exact schemas reject authority injection, unsafe numbers and polluted prototypes', () => {
  const widened = clone(rawDecision);
  widened.providerSelector = 'cloud';
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(widened), 'hsme_dense_baseline_exact_schema_violation');

  const unsafe = clone(rawDecision);
  unsafe.trainingTarget.activeWeightsMaxBytes = Number.MAX_VALUE;
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(unsafe), 'hsme_dense_baseline_value_invalid');

  const polluted = Object.assign(Object.create({ injected: true }), clone(rawDecision));
  expectCode(() => normalizeHsmeDenseBaselineDecisionV1(polluted), 'hsme_dense_baseline_exact_schema_violation');
});

test('digest rejects malformed hash-port output', async () => {
  const decision = normalizeHsmeDenseBaselineDecisionV1(clone(rawDecision));
  await assert.rejects(
    () => hsmeDenseBaselineDecisionV1Digest(decision, { async sha256() { return 'BAD'; } }),
    error => error instanceof HsmeDenseBaselineEvidenceV1Error && error.code === 'hsme_dense_baseline_hash_port_invalid',
  );
});
