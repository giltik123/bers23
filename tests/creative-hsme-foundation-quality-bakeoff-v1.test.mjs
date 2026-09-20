import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  HSME_FOUNDATION_REUSE_DECISION_V1_SCHEMA,
  HSME_FOUNDATION_REUSE_QUALITY_POLICY,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionV1.ts';
import {
  HSME_FOUNDATION_QUALITY_BAKEOFF_V1_SCHEMA,
  hsmeFoundationQualityBakeoffV1Digest,
  normalizeHsmeFoundationQualityBakeoffV1,
  proveHsmeFoundationQualityFirstReuseSelectionV1,
  proveHsmeFoundationQualityPreferredSetV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityBakeoffV1.ts';

const H = char => char.repeat(64);
const R = char => char.repeat(40);
const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };

const dimensions = [
  'identity-preservation',
  'garment-logo-pattern-preservation',
  'non-target-preservation',
  'semantic-adherence',
  'anatomy-artifact-rate',
];

function source(root, revisionChar, hashChar) {
  return { sourceRoot: root, immutableRevision: R(revisionChar), contentSha256: H(hashChar) };
}

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

function zeroTraining(evidence = H('a'), frozenParameters = 4_000_000_000) {
  return {
    mode: 'ZERO_TRAINING',
    trainableParameters: 0,
    frozenParameters,
    trainingExamples: 0,
    gpuSeconds: 0,
    trainingCostMicrousd: 0,
    evidenceSha256: evidence,
  };
}

function reuseDecision(selectedCandidateId = 'flux2-klein-4b-direct') {
  const raw = {
    schemaVersion: HSME_FOUNDATION_REUSE_DECISION_V1_SCHEMA,
    qualityPolicy: HSME_FOUNDATION_REUSE_QUALITY_POLICY,
    decisionStatus: selectedCandidateId === 'flux2-klein-4b-direct'
      ? 'DIRECT_FOUNDATION_ADVANCE'
      : 'BOUNDED_ADAPTATION_ADVANCE',
    mobileInstalledBudgetBytes: 1_500_000_000,
    mobileWorkingMemoryBudgetBytes: 3_000_000_000,
    rationale: ['synthetic fixture proves quality selection before efficiency tie-breaks'],
    candidates: [
      {
        candidateId: 'tiny-sd-control',
        strategy: 'CONTROL_BASELINE',
        targetTier: 'REFERENCE',
        evidenceState: 'UNRESOLVED',
        source: source('segmind/tiny-sd', '1', '1'),
        licenseConclusion: 'REVIEW_REQUIRED',
        licenseEvidenceSha256: 'UNKNOWN',
        quality: { status: 'UNKNOWN', evidenceSha256: 'UNKNOWN' },
        runtime: unresolvedRuntime(),
        training: {
          ...zeroTraining('UNKNOWN', 'UNKNOWN'),
          evidenceSha256: 'UNKNOWN',
        },
        rejectionReasons: [],
      },
      {
        candidateId: 'flux2-klein-4b-direct',
        strategy: 'DIRECT_FOUNDATION',
        targetTier: 'MOBILE_DEFAULT',
        evidenceState: 'QUALIFIED',
        source: source('black-forest-labs/FLUX.2-klein-base-4B', '2', '2'),
        licenseConclusion: 'COMMERCIAL_ADMISSIBLE',
        licenseEvidenceSha256: H('b'),
        quality: { status: 'PASS', evidenceSha256: H('c') },
        runtime: {
          backboneBytes: 900_000_000,
          conditionerBytes: 100_000_000,
          vaeBytes: 100_000_000,
          adapterBytes: 0,
          otherRequiredBytes: 20_000_000,
          workingMemoryBytes: 2_400_000_000,
          evidenceSha256: H('d'),
        },
        training: zeroTraining(H('e')),
        rejectionReasons: [],
      },
      {
        candidateId: 'sana-0.6b-split',
        strategy: 'FROZEN_FOUNDATION_ADAPTATION',
        targetTier: 'MOBILE_DEFAULT',
        evidenceState: 'QUALIFIED',
        source: source('Efficient-Large-Model/Sana_Sprint_0.6B_1024px_diffusers', '3', '3'),
        licenseConclusion: 'COMMERCIAL_ADMISSIBLE',
        licenseEvidenceSha256: H('f'),
        quality: { status: 'PASS', evidenceSha256: H('4') },
        runtime: {
          backboneBytes: 560_000_000,
          conditionerBytes: 0,
          vaeBytes: 120_000_000,
          adapterBytes: 20_000_000,
          otherRequiredBytes: 10_000_000,
          workingMemoryBytes: 1_700_000_000,
          evidenceSha256: H('5'),
        },
        training: {
          mode: 'PROJECTOR_BRIDGE',
          trainableParameters: 12_000_000,
          frozenParameters: 650_000_000,
          trainingExamples: 80,
          gpuSeconds: 3_600,
          trainingCostMicrousd: 600_000,
          evidenceSha256: H('6'),
        },
        rejectionReasons: [],
      },
    ],
    selectedCandidateId,
  };
  return raw;
}

function dimensionResults(losses, char) {
  return dimensions.map((dimensionId, index) => ({
    dimensionId,
    lossMicrounits: losses[index],
    evidenceSha256: H(index % 2 === 0 ? char : '9'),
  }));
}

function bakeoff() {
  return {
    schemaVersion: HSME_FOUNDATION_QUALITY_BAKEOFF_V1_SCHEMA,
    qualityPolicy: HSME_FOUNDATION_REUSE_QUALITY_POLICY,
    benchmarkPolicySha256: H('7'),
    fixtureSetSha256: H('8'),
    selectionCandidateIds: ['flux2-klein-4b-direct', 'sana-0.6b-split'],
    dimensionPolicies: dimensions.map((dimensionId, index) => ({
      dimensionId,
      referenceCandidateId: 'qwen-image-edit-reference',
      maxLossMicrounits: index === 4 ? 20 : 50,
      reviewMode: index < 3 ? 'BLINDED_HUMAN' : 'HYBRID',
    })),
    candidateResults: [
      {
        candidateId: 'tiny-sd-control',
        roles: ['CONTROL_BASELINE'],
        immutableRevision: R('1'),
        modelContentSha256: H('1'),
        outputSetSha256: H('a'),
        dimensionResults: dimensionResults([120, 150, 130, 90, 40], 'a'),
      },
      {
        candidateId: 'flux2-klein-4b-direct',
        roles: ['DIRECT_FOUNDATION'],
        immutableRevision: R('2'),
        modelContentSha256: H('2'),
        outputSetSha256: H('b'),
        dimensionResults: dimensionResults([10, 10, 10, 10, 5], 'b'),
      },
      {
        candidateId: 'sana-0.6b-split',
        roles: ['MOBILE_REUSE'],
        immutableRevision: R('3'),
        modelContentSha256: H('3'),
        outputSetSha256: H('c'),
        dimensionResults: dimensionResults([20, 15, 20, 15, 5], 'c'),
      },
      {
        candidateId: 'qwen-image-edit-reference',
        roles: ['QUALITY_REFERENCE'],
        immutableRevision: R('4'),
        modelContentSha256: H('4'),
        outputSetSha256: H('d'),
        dimensionResults: dimensionResults([0, 0, 0, 0, 0], 'd'),
      },
    ],
  };
}

function candidate(raw, id) {
  return raw.candidateResults.find(value => value.candidateId === id);
}

function expectCode(fn, code) {
  assert.throws(fn, error => error?.code === code, `expected ${code}`);
}

test('four-role bakeoff chooses the strongest quality vector before efficiency is considered', () => {
  const normalized = normalizeHsmeFoundationQualityBakeoffV1(bakeoff());
  assert.equal(normalized.qualityPolicy, 'QUALITY_FLOOR_BEFORE_EFFICIENCY');

  const preferred = proveHsmeFoundationQualityPreferredSetV1(normalized);
  assert.deepEqual(preferred.qualityEligibleCandidateIds, ['flux2-klein-4b-direct', 'sana-0.6b-split']);
  assert.deepEqual(preferred.preferredCandidateIds, ['flux2-klein-4b-direct']);
  assert.deepEqual(preferred.dimensionPriority, dimensions);
});

test('smaller resource footprint cannot select a lower-quality candidate', () => {
  const decision = reuseDecision('sana-0.6b-split');
  assert.ok(
    decision.candidates.find(value => value.candidateId === 'sana-0.6b-split').runtime.backboneBytes
      < decision.candidates.find(value => value.candidateId === 'flux2-klein-4b-direct').runtime.backboneBytes,
  );
  expectCode(
    () => proveHsmeFoundationQualityFirstReuseSelectionV1(decision, bakeoff()),
    'hsme_foundation_quality_preferred_selection_required',
  );
});

test('quality-preferred reuse candidate can advance after the existing resource/license/training gate also passes', () => {
  const evidence = proveHsmeFoundationQualityFirstReuseSelectionV1(
    reuseDecision('flux2-klein-4b-direct'),
    bakeoff(),
  );
  assert.equal(evidence.selectedCandidateId, 'flux2-klein-4b-direct');
  assert.deepEqual(evidence.preferredCandidateIds, ['flux2-klein-4b-direct']);
  assert.equal(evidence.comparedSelectionCandidateCount, 2);
});

test('efficiency may choose between candidates only after an exact quality tie', () => {
  const raw = bakeoff();
  candidate(raw, 'sana-0.6b-split').dimensionResults = dimensionResults([10, 10, 10, 10, 5], 'e');

  const preferred = proveHsmeFoundationQualityPreferredSetV1(raw);
  assert.deepEqual(preferred.preferredCandidateIds, ['flux2-klein-4b-direct', 'sana-0.6b-split']);

  const evidence = proveHsmeFoundationQualityFirstReuseSelectionV1(
    reuseDecision('sana-0.6b-split'),
    raw,
  );
  assert.equal(evidence.selectedCandidateId, 'sana-0.6b-split');
});

test('hard preservation failure cannot be hidden by better later dimensions', () => {
  const raw = bakeoff();
  candidate(raw, 'flux2-klein-4b-direct').dimensionResults = dimensionResults([60, 0, 0, 0, 0], 'e');
  candidate(raw, 'sana-0.6b-split').dimensionResults = dimensionResults([20, 15, 20, 15, 5], 'f');

  const preferred = proveHsmeFoundationQualityPreferredSetV1(raw);
  assert.deepEqual(preferred.qualityEligibleCandidateIds, ['sana-0.6b-split']);
  assert.deepEqual(preferred.preferredCandidateIds, ['sana-0.6b-split']);
});

test('better reuse candidate cannot be removed from the bakeoff selection set after observation', () => {
  const raw = bakeoff();
  raw.selectionCandidateIds = ['sana-0.6b-split', 'tiny-sd-control'];
  expectCode(
    () => normalizeHsmeFoundationQualityBakeoffV1(raw),
    'hsme_foundation_quality_selection_role_invalid',
  );

  const hidden = bakeoff();
  hidden.selectionCandidateIds = ['sana-0.6b-split', 'sana-0.6b-split'];
  expectCode(
    () => normalizeHsmeFoundationQualityBakeoffV1(hidden),
    'hsme_foundation_quality_identifier_set_duplicate',
  );
});

test('reuse decision and quality bakeoff must compare exactly the same non-control reuse candidates', () => {
  const raw = bakeoff();
  raw.selectionCandidateIds = ['flux2-klein-4b-direct', 'sana-0.6b-split'];
  raw.candidateResults.push({
    candidateId: 'extra-direct-candidate',
    roles: ['DIRECT_FOUNDATION'],
    immutableRevision: R('5'),
    modelContentSha256: H('5'),
    outputSetSha256: H('5'),
    dimensionResults: dimensionResults([5, 5, 5, 5, 5], '5'),
  });
  // Extra non-selected reference data is allowed by the bakeoff itself.
  normalizeHsmeFoundationQualityBakeoffV1(raw);

  const decision = reuseDecision('flux2-klein-4b-direct');
  const changed = bakeoff();
  changed.selectionCandidateIds = ['flux2-klein-4b-direct', 'sana-0.6b-split'];
  decision.candidates.push({
    candidateId: 'another-reuse-candidate',
    strategy: 'DIRECT_FOUNDATION',
    targetTier: 'MOBILE_DEFAULT',
    evidenceState: 'UNRESOLVED',
    source: source('owner/another', '5', '5'),
    licenseConclusion: 'REVIEW_REQUIRED',
    licenseEvidenceSha256: 'UNKNOWN',
    quality: { status: 'UNKNOWN', evidenceSha256: 'UNKNOWN' },
    runtime: unresolvedRuntime(),
    training: zeroTraining('UNKNOWN', 'UNKNOWN'),
    rejectionReasons: [],
  });
  expectCode(
    () => proveHsmeFoundationQualityFirstReuseSelectionV1(decision, changed),
    'hsme_foundation_quality_selection_set_mismatch',
  );
});

test('quality reference is pinned per dimension and must have zero measured loss', () => {
  const raw = bakeoff();
  candidate(raw, 'qwen-image-edit-reference').dimensionResults[0].lossMicrounits = 1;
  expectCode(
    () => normalizeHsmeFoundationQualityBakeoffV1(raw),
    'hsme_foundation_quality_reference_loss_nonzero',
  );
});

test('all canonical hard preservation dimensions are mandatory', () => {
  const raw = bakeoff();
  const identityIndex = raw.dimensionPolicies.findIndex(policy => policy.dimensionId === 'identity-preservation');
  raw.dimensionPolicies[identityIndex] = {
    dimensionId: 'material-realism',
    referenceCandidateId: 'qwen-image-edit-reference',
    maxLossMicrounits: 50,
    reviewMode: 'BLINDED_HUMAN',
  };
  for (const result of raw.candidateResults) {
    const current = result.dimensionResults[identityIndex];
    result.dimensionResults[identityIndex] = {
      dimensionId: 'material-realism',
      lossMicrounits: current.lossMicrounits,
      evidenceSha256: current.evidenceSha256,
    };
  }
  expectCode(
    () => normalizeHsmeFoundationQualityBakeoffV1(raw),
    'hsme_foundation_quality_mandatory_dimension_missing',
  );
});

test('aggregate quality score override is structurally forbidden', () => {
  const raw = bakeoff();
  raw.aggregateScore = 999_999;
  expectCode(
    () => normalizeHsmeFoundationQualityBakeoffV1(raw),
    'hsme_foundation_quality_field_unknown',
  );
});

test('quality evidence must bind exact immutable reuse model content', () => {
  const raw = bakeoff();
  candidate(raw, 'flux2-klein-4b-direct').modelContentSha256 = H('0');
  expectCode(
    () => proveHsmeFoundationQualityFirstReuseSelectionV1(
      reuseDecision('flux2-klein-4b-direct'),
      raw,
    ),
    'hsme_foundation_quality_content_mismatch',
  );
});

test('candidate ordering is canonical but predeclared quality-dimension priority changes the digest', async () => {
  const left = bakeoff();
  const reorderedCandidates = bakeoff();
  reorderedCandidates.candidateResults.reverse();
  assert.equal(
    await hsmeFoundationQualityBakeoffV1Digest(left, hashPort),
    await hsmeFoundationQualityBakeoffV1Digest(reorderedCandidates, hashPort),
  );

  const reorderedDimensions = bakeoff();
  [reorderedDimensions.dimensionPolicies[0], reorderedDimensions.dimensionPolicies[1]] = [
    reorderedDimensions.dimensionPolicies[1],
    reorderedDimensions.dimensionPolicies[0],
  ];
  for (const result of reorderedDimensions.candidateResults) {
    [result.dimensionResults[0], result.dimensionResults[1]] = [
      result.dimensionResults[1],
      result.dimensionResults[0],
    ];
  }
  assert.notEqual(
    await hsmeFoundationQualityBakeoffV1Digest(left, hashPort),
    await hsmeFoundationQualityBakeoffV1Digest(reorderedDimensions, hashPort),
  );
});
