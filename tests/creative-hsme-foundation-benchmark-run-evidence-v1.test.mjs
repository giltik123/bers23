import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN,
  HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
  hsmeFoundationBenchmarkRunEvidenceV1Digest,
  normalizeHsmeFoundationBenchmarkCandidateRunV1,
  normalizeHsmeFoundationBenchmarkRunEvidenceV1,
  proveHsmeFoundationBenchmarkRunEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkRunEvidenceV1.ts';

const campaign = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  'utf8',
));
const trust = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json',
  'utf8',
));
const fixturePlan = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-fixture-plan.v1.json',
  'utf8',
));
const fixturePack = JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-fixture-pack-evidence.v1.json',
  'utf8',
));

const hashPort = { sha256: async bytes => createHash('sha256').update(bytes).digest('hex') };
const capabilities = ['TEXT_TO_IMAGE', 'IMAGE_EDITING'];
const seeds = fixturePack.sources.outputSetContract.requiredSeeds;

function H(value) {
  return createHash('sha256').update(value).digest('hex');
}

function clone(value) {
  return structuredClone(value);
}

function fixtureIds(capability) {
  return fixturePlan.assets
    .filter(value => value.capability === capability)
    .map(value => value.fixtureId)
    .sort();
}

function outputs(candidateId, capability) {
  return fixtureIds(capability).flatMap(fixtureId =>
    seeds.map(seed => ({
      fixtureId,
      seed,
      blindId: 'blind_' + H('blind|' + candidateId + '|' + capability + '|' + fixtureId + '|' + seed).slice(0, 24),
      imageSha256: H('image|' + candidateId + '|' + capability + '|' + fixtureId + '|' + seed),
    }))
  ).sort((a, b) =>
    a.fixtureId.localeCompare(b.fixtureId)
    || a.seed - b.seed
    || a.blindId.localeCompare(b.blindId)
  );
}

function outputSetDigest(records) {
  return createHash('sha256')
    .update(HSME_FOUNDATION_BENCHMARK_OUTPUT_SET_DIGEST_DOMAIN + JSON.stringify(records))
    .digest('hex');
}

function run(candidate, capability, status) {
  const base = {
    candidateId: candidate.candidateId,
    capability,
    status,
    immutableRevision: candidate.immutableRevision,
    modelContentSha256: candidate.modelContentSha256,
    executionProfileSha256: candidate.executionProfileSha256,
    rightsEvidenceSha256: candidate.rightsEvidenceSha256,
    runtimeInventorySha256: 'UNKNOWN',
    outputSetSha256: 'UNKNOWN',
    reviewPackageSha256: 'UNKNOWN',
    failureEvidenceSha256: 'UNKNOWN',
    outputs: [],
  };
  if (status === 'COMPLETE') {
    base.outputs = outputs(candidate.candidateId, capability);
    base.runtimeInventorySha256 = H('runtime|' + candidate.candidateId + '|' + capability);
    base.outputSetSha256 = outputSetDigest(base.outputs);
    base.reviewPackageSha256 = H('review|' + candidate.candidateId + '|' + capability);
  }
  return base;
}

function evidence({ sanaComplete = false } = {}) {
  const runs = [];
  for (const candidate of campaign.candidates) {
    for (const capability of capabilities) {
      const supported = candidate.capabilities.includes(capability);
      const status = !supported
        ? 'NOT_APPLICABLE'
        : candidate.candidateId === 'sana-sprint-0.6b-split-v1' && capability === 'TEXT_TO_IMAGE' && !sanaComplete
          ? 'BLOCKED_PARITY_PENDING'
          : 'COMPLETE';
      runs.push(run(candidate, capability, status));
    }
  }
  return {
    schemaVersion: HSME_FOUNDATION_BENCHMARK_RUN_EVIDENCE_V1_SCHEMA,
    campaignId: campaign.campaignId,
    campaignDigest: trust.campaignDigest,
    fixtureSetSha256: campaign.fixturePack.fixtureSetSha256,
    outputSetContractSha256: campaign.fixturePack.outputSetContractSha256,
    requiredSeeds: [...seeds],
    candidateOutputsObserved: true,
    runs,
    productionAuthorityGranted: false,
    providerAuthorityGranted: false,
    billingAuthorityGranted: false,
    projectArtifactMutationAllowed: false,
    aeeExecutionAuthorityGranted: false,
    durableModelFleetPromotionAllowed: false,
    trainingOrDistillationAllowed: false,
    winnerSelectionAllowed: false,
  };
}

function candidateRun(raw, candidateId, capability) {
  return raw.runs.find(value => value.candidateId === candidateId && value.capability === capability);
}

async function prove(raw) {
  return proveHsmeFoundationBenchmarkRunEvidenceV1(
    campaign,
    trust,
    fixturePlan,
    fixturePack,
    raw,
    hashPort,
  );
}

async function expectCodeAsync(fn, code) {
  await assert.rejects(fn, error => error?.code === code, 'expected ' + code);
}

test('frozen campaign can record all non-SANA evidence while SANA remains parity-blocked', async () => {
  const raw = evidence();
  const normalized = normalizeHsmeFoundationBenchmarkRunEvidenceV1(raw);
  assert.equal(normalized.runs.length, 12);
  assert.equal(normalized.candidateOutputsObserved, true);

  const proof = await prove(raw);
  assert.equal(proof.state, 'PARTIAL_BLOCKED');
  assert.equal(proof.completeRunCount, 7);
  assert.equal(proof.blockedRunCount, 1);
  assert.equal(proof.notApplicableRunCount, 4);
  assert.equal(proof.failedRunCount, 0);
  assert.equal(proof.observedOutputCount, 7 * 12 + 3 * 2);
  assert.equal(proof.productionAuthorityGranted, false);
  assert.equal(proof.winnerSelectionAllowed, false);
});

test('SANA may become complete only by supplying the exact frozen T2I output set', async () => {
  const raw = evidence({ sanaComplete: true });
  const proof = await prove(raw);
  assert.equal(proof.state, 'FULL_COMPLETE');
  assert.equal(proof.completeRunCount, 8);
  assert.equal(proof.blockedRunCount, 0);
  assert.equal(proof.notApplicableRunCount, 4);
  assert.equal(proof.failedRunCount, 0);
});

test('COMPLETE run cannot omit a frozen fixture/seed output', async () => {
  const raw = evidence();
  const target = candidateRun(raw, 'flux2-klein-base-4b-v1', 'TEXT_TO_IMAGE');
  target.outputs.pop();
  target.outputSetSha256 = outputSetDigest(target.outputs);
  await expectCodeAsync(() => prove(raw), 'hsme_foundation_run_output_set_incomplete');
});

test('COMPLETE run cannot add an unplanned output', async () => {
  const raw = evidence();
  const target = candidateRun(raw, 'flux2-klein-base-4b-v1', 'IMAGE_EDITING');
  target.outputs.push({
    fixtureId: 'invented-after-observation',
    seed: seeds[0],
    blindId: 'blind_' + H('invented').slice(0, 24),
    imageSha256: H('invented-image'),
  });
  target.outputs.sort((a, b) => a.fixtureId.localeCompare(b.fixtureId) || a.seed - b.seed);
  target.outputSetSha256 = outputSetDigest(target.outputs);
  await expectCodeAsync(() => prove(raw), 'hsme_foundation_run_output_set_incomplete');
});

test('unsupported candidate/capability pair cannot be promoted from NOT_APPLICABLE', async () => {
  const raw = evidence();
  const target = candidateRun(raw, 'qwen-image-t2i-reference-v1', 'IMAGE_EDITING');
  Object.assign(target, run(
    campaign.candidates.find(value => value.candidateId === target.candidateId),
    'IMAGE_EDITING',
    'COMPLETE',
  ));
  await expectCodeAsync(() => prove(raw), 'hsme_foundation_run_unsupported_status_invalid');
});

test('BLOCKED_PARITY_PENDING is reserved only for SANA T2I', async () => {
  const raw = evidence();
  const target = candidateRun(raw, 'tiny-sd-control-v1', 'TEXT_TO_IMAGE');
  Object.assign(target, run(
    campaign.candidates.find(value => value.candidateId === target.candidateId),
    'TEXT_TO_IMAGE',
    'BLOCKED_PARITY_PENDING',
  ));
  await expectCodeAsync(() => prove(raw), 'hsme_foundation_run_parity_block_scope_invalid');
});

test('blind ids are globally unique and candidate-opaque', async () => {
  const raw = evidence();
  const a = candidateRun(raw, 'flux2-klein-4b-distilled-v1', 'TEXT_TO_IMAGE').outputs[0];
  const b = candidateRun(raw, 'flux2-klein-base-4b-v1', 'TEXT_TO_IMAGE').outputs[0];
  b.blindId = a.blindId;
  const runB = candidateRun(raw, 'flux2-klein-base-4b-v1', 'TEXT_TO_IMAGE');
  runB.outputSetSha256 = outputSetDigest(runB.outputs);
  await expectCodeAsync(() => prove(raw), 'hsme_foundation_run_blind_id_duplicate');
});

test('candidate model/profile/rights identity cannot drift from frozen campaign', async () => {
  const raw = evidence();
  candidateRun(raw, 'flux2-klein-4b-distilled-v1', 'TEXT_TO_IMAGE').executionProfileSha256 = H('changed-profile');
  await expectCodeAsync(() => prove(raw), 'hsme_foundation_run_candidate_identity_mismatch');
});

test('FAILED run remains failure evidence and is never converted into a quality score', async () => {
  const raw = evidence();
  const target = candidateRun(raw, 'flux2-klein-base-4b-v1', 'TEXT_TO_IMAGE');
  target.status = 'FAILED';
  target.outputs = target.outputs.slice(0, 1);
  target.outputSetSha256 = outputSetDigest(target.outputs);
  target.reviewPackageSha256 = 'UNKNOWN';
  target.failureEvidenceSha256 = H('failure');
  const proof = await prove(raw);
  assert.equal(proof.state, 'FAILED');
  assert.equal(proof.failedRunCount, 1);
});

test('raw run evidence structurally forbids quality score, efficiency and winner fields', () => {
  for (const [field, value] of [
    ['aggregateScore', 1],
    ['latencyMs', 1],
    ['workingMemoryBytes', 1],
    ['selectedCandidateId', 'flux2-klein-base-4b-v1'],
  ]) {
    const raw = evidence();
    raw[field] = value;
    assert.throws(
      () => normalizeHsmeFoundationBenchmarkRunEvidenceV1(raw),
      error => error?.code === 'hsme_foundation_run_field_unknown',
    );
  }

  const nested = evidence();
  candidateRun(nested, 'flux2-klein-base-4b-v1', 'TEXT_TO_IMAGE').qualityScore = 123;
  assert.throws(
    () => normalizeHsmeFoundationBenchmarkRunEvidenceV1(nested),
    error => error?.code === 'hsme_foundation_run_field_unknown',
  );
});

test('candidateOutputsObserved exactly tracks whether output bytes were actually recorded', async () => {
  const raw = evidence();
  raw.candidateOutputsObserved = false;
  await expectCodeAsync(() => prove(raw), 'hsme_foundation_run_observation_flag_mismatch');
});

test('canonical ordering makes run evidence digest independent of input row order', async () => {
  const left = evidence();
  const right = evidence();
  right.runs.reverse();
  assert.equal(
    await hsmeFoundationBenchmarkRunEvidenceV1Digest(left, hashPort),
    await hsmeFoundationBenchmarkRunEvidenceV1Digest(right, hashPort),
  );
});

test('single-candidate dispatch can validate a fragment without fabricating the other 11 rows', () => {
  const raw = evidence();
  const fragment = candidateRun(raw, 'flux2-klein-4b-distilled-v1', 'TEXT_TO_IMAGE');
  const normalized = normalizeHsmeFoundationBenchmarkCandidateRunV1(fragment);
  assert.equal(normalized.candidateId, fragment.candidateId);
  assert.equal(normalized.capability, 'TEXT_TO_IMAGE');
  assert.equal(normalized.status, 'COMPLETE');
  assert.equal(normalized.outputs.length, 12);
  assert.throws(
    () => normalizeHsmeFoundationBenchmarkCandidateRunV1({ ...fragment, latencyMs: 1 }),
    error => error?.code === 'hsme_foundation_run_field_unknown',
  );
});
