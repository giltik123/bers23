import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  HSME_FOUNDATION_REUSE_DECISION_V1_SCHEMA,
  HSME_FOUNDATION_REUSE_QUALITY_POLICY,
  hsmeFoundationReuseDecisionV1Digest,
  mayEscalateToFullHsmeStudentDistillationV1,
  normalizeHsmeFoundationReuseDecisionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionV1.ts';

const H = char => char.repeat(64);
const R = char => char.repeat(40);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

function unresolvedRuntime() {
  return {
    backboneBytes: 'UNKNOWN',
    conditionerBytes: 'UNKNOWN',
    vaeBytes: 'UNKNOWN',
    adapterBytes: 'UNKNOWN',
    otherRequiredBytes: 'UNKNOWN',
    workingMemoryBytes: 'UNKNOWN',
    evidenceSha256: 'UNKNOWN',
  };
}

function zeroTraining() {
  return {
    mode: 'ZERO_TRAINING',
    trainableParameters: 0,
    frozenParameters: 'UNKNOWN',
    trainingExamples: 0,
    gpuSeconds: 0,
    trainingCostMicrousd: 0,
    evidenceSha256: 'UNKNOWN',
  };
}

function source(root, revisionChar, hashChar) {
  return { sourceRoot: root, immutableRevision: R(revisionChar), contentSha256: H(hashChar) };
}

function pendingDecision() {
  return {
    schemaVersion: HSME_FOUNDATION_REUSE_DECISION_V1_SCHEMA,
    qualityPolicy: HSME_FOUNDATION_REUSE_QUALITY_POLICY,
    decisionStatus: 'EVALUATION_PENDING',
    mobileInstalledBudgetBytes: 1_500_000_000,
    mobileWorkingMemoryBudgetBytes: 3_000_000_000,
    rationale: ['compare reuse before authorizing full image-student distillation'],
    candidates: [
      {
        candidateId: 'tiny-sd-control',
        strategy: 'CONTROL_BASELINE',
        targetTier: 'REFERENCE',
        evidenceState: 'UNRESOLVED',
        source: source('segmind/tiny-sd', 'a', '1'),
        licenseConclusion: 'REVIEW_REQUIRED',
        licenseEvidenceSha256: 'UNKNOWN',
        quality: { status: 'UNKNOWN', evidenceSha256: 'UNKNOWN' },
        runtime: unresolvedRuntime(),
        training: zeroTraining(),
        rejectionReasons: [],
      },
      {
        candidateId: 'flux2-klein-4b-direct',
        strategy: 'DIRECT_FOUNDATION',
        targetTier: 'DESKTOP_HIGH_END',
        evidenceState: 'UNRESOLVED',
        source: source('black-forest-labs/FLUX.2-klein-base-4B', 'b', '2'),
        licenseConclusion: 'REVIEW_REQUIRED',
        licenseEvidenceSha256: 'UNKNOWN',
        quality: { status: 'UNKNOWN', evidenceSha256: 'UNKNOWN' },
        runtime: unresolvedRuntime(),
        training: zeroTraining(),
        rejectionReasons: [],
      },
      {
        candidateId: 'sana-0.6b-conditioning-bridge',
        strategy: 'FROZEN_FOUNDATION_ADAPTATION',
        targetTier: 'MOBILE_DEFAULT',
        evidenceState: 'UNRESOLVED',
        source: source('Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers', 'c', '3'),
        licenseConclusion: 'REVIEW_REQUIRED',
        licenseEvidenceSha256: 'UNKNOWN',
        quality: { status: 'UNKNOWN', evidenceSha256: 'UNKNOWN' },
        runtime: unresolvedRuntime(),
        training: {
          mode: 'PROJECTOR_BRIDGE',
          trainableParameters: 'UNKNOWN',
          frozenParameters: 'UNKNOWN',
          trainingExamples: 'UNKNOWN',
          gpuSeconds: 'UNKNOWN',
          trainingCostMicrousd: 'UNKNOWN',
          evidenceSha256: 'UNKNOWN',
        },
        rejectionReasons: [],
      },
    ],
  };
}

function qualifyAdaptation(raw, overrides = {}) {
  const candidate = raw.candidates.find(value => value.strategy === 'FROZEN_FOUNDATION_ADAPTATION');
  Object.assign(candidate, {
    targetTier: 'MOBILE_DEFAULT',
    evidenceState: 'QUALIFIED',
    licenseConclusion: 'COMMERCIAL_ADMISSIBLE',
    licenseEvidenceSha256: H('4'),
    quality: { status: 'PASS', evidenceSha256: H('5') },
    runtime: {
      backboneBytes: 600_000_000,
      conditionerBytes: 120_000_000,
      vaeBytes: 90_000_000,
      adapterBytes: 30_000_000,
      otherRequiredBytes: 10_000_000,
      workingMemoryBytes: 2_000_000_000,
      evidenceSha256: H('6'),
    },
    training: {
      mode: 'PROJECTOR_BRIDGE',
      trainableParameters: 20_000_000,
      frozenParameters: 650_000_000,
      trainingExamples: 100,
      gpuSeconds: 7_200,
      trainingCostMicrousd: 1_500_000,
      evidenceSha256: H('7'),
    },
    rejectionReasons: [],
    ...overrides,
  });
  raw.decisionStatus = 'BOUNDED_ADAPTATION_ADVANCE';
  raw.selectedCandidateId = candidate.candidateId;
  return candidate;
}

function rejectReuseCandidatesWithHardEvidence(raw) {
  const direct = raw.candidates.find(value => value.strategy === 'DIRECT_FOUNDATION');
  direct.evidenceState = 'REJECTED';
  direct.licenseConclusion = 'NON_COMMERCIAL';
  direct.licenseEvidenceSha256 = H('e');
  direct.rejectionReasons = ['fixture hard blocker: direct foundation is non-commercial'];

  const adaptation = raw.candidates.find(value => value.strategy === 'FROZEN_FOUNDATION_ADAPTATION');
  adaptation.evidenceState = 'REJECTED';
  adaptation.quality = { status: 'FAIL', evidenceSha256: H('f') };
  adaptation.rejectionReasons = ['fixture hard blocker: bounded adaptation failed the measured quality floor'];

  raw.decisionStatus = 'REUSE_PATH_INSUFFICIENT';
  delete raw.selectedCandidateId;
}

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

test('pending decision compares control, direct foundation, and frozen-foundation adaptation without authorizing training escalation', () => {
  const decision = normalizeHsmeFoundationReuseDecisionV1(pendingDecision());
  assert.equal(decision.decisionStatus, 'EVALUATION_PENDING');
  assert.equal(mayEscalateToFullHsmeStudentDistillationV1(decision), false);
  assert.deepEqual(decision.candidates.map(value => value.strategy).sort(), [
    'CONTROL_BASELINE',
    'DIRECT_FOUNDATION',
    'FROZEN_FOUNDATION_ADAPTATION',
  ]);
});

test('normalization is idempotent even though mandatory installed bytes are derived', () => {
  const once = normalizeHsmeFoundationReuseDecisionV1(pendingDecision());
  const twice = normalizeHsmeFoundationReuseDecisionV1(once);
  assert.deepEqual(twice, once);
});

test('mandatory installed bytes are derived from the complete runtime, including backbone and adapter', () => {
  const raw = pendingDecision();
  qualifyAdaptation(raw);
  const decision = normalizeHsmeFoundationReuseDecisionV1(raw);
  const selected = decision.candidates.find(value => value.candidateId === decision.selectedCandidateId);
  assert.equal(selected.runtime.mandatoryInstalledBytes, 850_000_000);
  assert.equal(selected.runtime.adapterBytes, 30_000_000);
});

test('caller cannot understate a large backbone by supplying an adapter-only total', () => {
  const raw = pendingDecision();
  const candidate = qualifyAdaptation(raw);
  candidate.runtime.mandatoryInstalledBytes = candidate.runtime.adapterBytes;
  expectCode(() => normalizeHsmeFoundationReuseDecisionV1(raw), 'hsme_foundation_reuse_installed_total_mismatch');
});

test('bounded adaptation can advance only after measured quality, license, runtime and training evidence pass', () => {
  const raw = pendingDecision();
  qualifyAdaptation(raw);
  const decision = normalizeHsmeFoundationReuseDecisionV1(raw);
  assert.equal(decision.decisionStatus, 'BOUNDED_ADAPTATION_ADVANCE');
  assert.equal(decision.selectedCandidateId, 'sana-0.6b-conditioning-bridge');
  assert.equal(mayEscalateToFullHsmeStudentDistillationV1(decision), false);
});

test('a cheaper adaptation cannot advance when the quality floor fails', () => {
  const raw = pendingDecision();
  const candidate = qualifyAdaptation(raw);
  candidate.evidenceState = 'REJECTED';
  candidate.quality = { status: 'FAIL', evidenceSha256: H('8') };
  candidate.rejectionReasons = ['measured BERS quality floor failed despite acceptable footprint'];
  expectCode(() => normalizeHsmeFoundationReuseDecisionV1(raw), 'hsme_foundation_reuse_advance_evidence_invalid');
});

test('commercial review remaining unresolved cannot be represented as QUALIFIED', () => {
  const raw = pendingDecision();
  const candidate = qualifyAdaptation(raw, {
    licenseConclusion: 'REVIEW_REQUIRED',
    licenseEvidenceSha256: 'UNKNOWN',
  });
  expectCode(() => normalizeHsmeFoundationReuseDecisionV1(raw), 'hsme_foundation_reuse_qualified_license_invalid');
  assert.equal(candidate.licenseConclusion, 'REVIEW_REQUIRED');
});

test('mobile advance counts full required bytes and rejects an oversized backbone even when adapter is tiny', () => {
  const raw = pendingDecision();
  const candidate = qualifyAdaptation(raw);
  candidate.runtime.backboneBytes = 1_400_000_000;
  candidate.runtime.adapterBytes = 1_000_000;
  candidate.runtime.evidenceSha256 = H('9');
  expectCode(() => normalizeHsmeFoundationReuseDecisionV1(raw), 'hsme_foundation_reuse_installed_budget_failed');
});

test('direct foundation cannot close the HSME-2 mobile gate when it is only a desktop/high-end tier', () => {
  const raw = pendingDecision();
  const candidate = raw.candidates.find(value => value.strategy === 'DIRECT_FOUNDATION');
  Object.assign(candidate, {
    evidenceState: 'QUALIFIED',
    licenseConclusion: 'COMMERCIAL_ADMISSIBLE',
    licenseEvidenceSha256: H('a'),
    quality: { status: 'PASS', evidenceSha256: H('b') },
    runtime: {
      backboneBytes: 900_000_000,
      conditionerBytes: 100_000_000,
      vaeBytes: 100_000_000,
      adapterBytes: 0,
      otherRequiredBytes: 0,
      workingMemoryBytes: 2_000_000_000,
      evidenceSha256: H('c'),
    },
    training: {
      ...zeroTraining(),
      frozenParameters: 4_000_000_000,
      evidenceSha256: H('d'),
    },
  });
  raw.decisionStatus = 'DIRECT_FOUNDATION_ADVANCE';
  raw.selectedCandidateId = candidate.candidateId;
  expectCode(() => normalizeHsmeFoundationReuseDecisionV1(raw), 'hsme_foundation_reuse_mobile_tier_required');
});

test('full student distillation escalation is fail-closed until every reuse candidate has a measured hard blocker', () => {
  const raw = pendingDecision();
  raw.decisionStatus = 'REUSE_PATH_INSUFFICIENT';
  expectCode(() => normalizeHsmeFoundationReuseDecisionV1(raw), 'hsme_foundation_reuse_insufficient_not_proven');

  for (const candidate of raw.candidates) {
    if (candidate.strategy === 'CONTROL_BASELINE') continue;
    candidate.evidenceState = 'REJECTED';
    candidate.rejectionReasons = ['text-only rejection is not sufficient evidence'];
  }
  expectCode(() => normalizeHsmeFoundationReuseDecisionV1(raw), 'hsme_foundation_reuse_insufficient_hard_blocker_missing');

  rejectReuseCandidatesWithHardEvidence(raw);
  const decision = normalizeHsmeFoundationReuseDecisionV1(raw);
  assert.equal(mayEscalateToFullHsmeStudentDistillationV1(decision), true);
});

test('public escalation helper cannot bypass validation with a forged status-only decision', () => {
  const forged = pendingDecision();
  forged.decisionStatus = 'REUSE_PATH_INSUFFICIENT';
  expectCode(() => mayEscalateToFullHsmeStudentDistillationV1(forged), 'hsme_foundation_reuse_insufficient_not_proven');
});

test('candidate order does not change the canonical decision digest after normalization', async () => {
  const left = normalizeHsmeFoundationReuseDecisionV1(pendingDecision());
  const reversedRaw = pendingDecision();
  reversedRaw.candidates.reverse();
  const right = normalizeHsmeFoundationReuseDecisionV1(reversedRaw);
  assert.equal(
    await hsmeFoundationReuseDecisionV1Digest(left, hashPort),
    await hsmeFoundationReuseDecisionV1Digest(right, hashPort),
  );
});
