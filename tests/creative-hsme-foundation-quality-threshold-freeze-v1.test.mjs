import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeHsmeFoundationFixturePlanV1 } from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkFixturePlanV1.ts';
import {
  normalizeHsmeFoundationBenchmarkCampaignV1,
  hsmeFoundationBenchmarkCandidateMayRunV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';
import { normalizeHsmeFoundationBenchmarkCandidateTrustV1 } from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCandidateTrustV1.ts';

const rubric = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-quality-rubric.v1.json',
  'utf8',
));
const fixtureRaw = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json',
  'utf8',
));
const campaignRaw = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  'utf8',
));
const trustRaw = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json',
  'utf8',
));

function lexical(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort(lexical).map(key => [key, canonicalValue(value[key])]));
  }
  return value;
}
function domainHash(domain, value) {
  return createHash('sha256')
    .update(domain + '\0' + JSON.stringify(canonicalValue(value)))
    .digest('hex');
}

test('quality rubric freezes one common lower-is-better loss scale before candidate outputs', () => {
  assert.equal(rubric.schemaVersion, 'BERS_HSME_FOUNDATION_QUALITY_RUBRIC_V1');
  assert.deepEqual(rubric.lossScaleMicrounits, {
    min: 0,
    max: 1_000_000,
    direction: 'LOWER_IS_BETTER',
    anchor: 'LOSS_RELATIVE_TO_SLICE_REFERENCE',
  });
  assert.equal(rubric.thresholdPolicy.state, 'FROZEN_BEFORE_OUTPUTS');
  assert.equal(rubric.thresholdPolicy.candidateOutputsObserved, false);
  assert.equal(rubric.thresholdPolicy.postObservationMutationAllowed, false);
  assert.equal(rubric.thresholdPolicy.compensationAcrossDimensionsAllowed, false);
  assert.equal(rubric.dimensions.length, 11);
});

test('every dimension scale and rubric digest matches its exact canonical content', () => {
  for (const dimension of rubric.dimensions) {
    assert.equal(
      dimension.scalePolicySha256,
      domainHash('bers:hsme:quality-scale:v1', dimension.scalePolicy),
      dimension.dimensionId + ' scale digest',
    );
    assert.equal(
      dimension.rubricSha256,
      domainHash('bers:hsme:quality-rubric:v1', dimension.rubric),
      dimension.dimensionId + ' rubric digest',
    );
    assert.equal(dimension.scalePolicy.min, 0);
    assert.equal(dimension.scalePolicy.max, 1_000_000);
    assert.equal(dimension.scalePolicy.direction, 'LOWER_IS_BETTER');
    assert.ok(Number.isSafeInteger(dimension.globalMaxLossMicrounits));
    assert.ok(dimension.globalMaxLossMicrounits >= 20_000);
    assert.ok(dimension.globalMaxLossMicrounits <= 50_000);
  }
});

test('fixture plan binds all 11 dimension digests and numeric ceilings but remains asset-evidence pending', () => {
  const plan = normalizeHsmeFoundationFixturePlanV1(fixtureRaw);
  const byId = new Map(rubric.dimensions.map(value => [value.dimensionId, value]));
  assert.equal(plan.state, 'EVIDENCE_PENDING');
  assert.equal(plan.assets.length, 0);
  assert.equal(plan.candidateOutputsObserved, false);
  assert.equal(plan.dimensions.length, 11);
  for (const dimension of plan.dimensions) {
    const frozen = byId.get(dimension.dimensionId);
    assert.ok(frozen);
    assert.equal(dimension.scalePolicySha256, frozen.scalePolicySha256);
    assert.equal(dimension.rubricSha256, frozen.rubricSha256);
    assert.equal(dimension.thresholdState, 'PINNED');
    assert.equal(dimension.maxLossMicrounits, frozen.globalMaxLossMicrounits);
  }
});

test('campaign contains exactly 13 numeric pre-observation hard thresholds', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(campaignRaw);
  const byId = new Map(rubric.dimensions.map(value => [value.dimensionId, value]));
  const thresholds = campaign.slices.flatMap(slice =>
    slice.dimensions.map(dimension => ({
      sliceId: slice.sliceId,
      dimensionId: dimension.dimensionId,
      maxLossMicrounits: dimension.maxLossMicrounits,
      referenceCandidateId: dimension.referenceCandidateId,
    })),
  );
  assert.equal(thresholds.length, 13);
  assert.ok(thresholds.every(value => Number.isSafeInteger(value.maxLossMicrounits)));
  for (const threshold of thresholds) {
    assert.ok(threshold.maxLossMicrounits <= byId.get(threshold.dimensionId).globalMaxLossMicrounits);
  }
  assert.deepEqual(
    campaign.slices.find(value => value.sliceId === 'text-to-image-v1').qualityReferenceCandidateIds,
    ['qwen-image-t2i-reference-v1'],
  );
  assert.deepEqual(
    campaign.slices.find(value => value.sliceId === 'image-editing-v1').qualityReferenceCandidateIds,
    ['qwen-image-edit-2511-reference-v1'],
  );
});

test('strict preservation dimensions cannot be compensated by broader 5 percent quality ceilings', () => {
  const byId = new Map(rubric.dimensions.map(value => [value.dimensionId, value.globalMaxLossMicrounits]));
  assert.equal(byId.get('non-target-preservation'), 20_000);
  for (const id of [
    'identity-preservation',
    'garment-logo-pattern-preservation',
    'anatomy-artifact-rate',
    'text-fidelity',
    'multi-reference-consistency',
  ]) assert.equal(byId.get(id), 25_000);
  for (const id of [
    'semantic-adherence',
    'photorealism',
    'material-realism',
    'edit-compliance',
    'composition-count-spatial-correctness',
  ]) assert.equal(byId.get(id), 50_000);
});

test('threshold freeze does not make any candidate runnable before fixture/model/rights evidence', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(campaignRaw);
  const trust = normalizeHsmeFoundationBenchmarkCandidateTrustV1(trustRaw);
  assert.equal(campaign.status, 'EVIDENCE_PENDING');
  assert.equal(campaign.fixturePack.state, 'PIN_REQUIRED');
  assert.equal(trust.state, 'EVIDENCE_PENDING');
  assert.equal(trust.campaignDigest, 'UNKNOWN');
  for (const candidate of campaign.candidates) {
    assert.equal(hsmeFoundationBenchmarkCandidateMayRunV1(campaign, candidate.candidateId), false);
    assert.equal(candidate.modelContentSha256, 'UNKNOWN');
    assert.equal(candidate.executionProfileSha256, 'UNKNOWN');
    assert.equal(candidate.rightsState, 'REVIEW_REQUIRED');
  }
});

test('candidate outputs, efficiency, selection, production and training authority remain absent', () => {
  const campaign = normalizeHsmeFoundationBenchmarkCampaignV1(campaignRaw);
  const trust = normalizeHsmeFoundationBenchmarkCandidateTrustV1(trustRaw);
  assert.equal(fixtureRaw.candidateOutputsObserved, false);
  assert.equal(campaign.efficiencyUsedInQualitySelection, false);
  assert.equal(campaign.productionAuthorityGranted, false);
  assert.equal(campaign.trainingOrDistillationAllowed, false);
  assert.equal(trust.winnerSelectionAllowed, false);
  assert.equal(trust.efficiencyUsedInQualitySelection, false);
  assert.equal(trust.productionAuthorityGranted, false);
  assert.equal(trust.durableModelFleetPromotionAllowed, false);
  assert.equal(trust.trainingOrDistillationAllowed, false);
});
