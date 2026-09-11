import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  HSME_DENSE_BASELINE_DUAL_BUDGET_EVIDENCE_V1_SCHEMA,
  HsmeDenseDualBudgetEvidenceV1Error,
  normalizeHsmeDenseDualBudgetEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeDenseBaselineDualBudgetEvidenceV1.ts';
import { normalizeHsmeDenseBaselineDecisionV1 } from '../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

const dualBudgetUrl = new URL('../src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-dual-budget.json', import.meta.url);
const decisionUrl = new URL('../src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-decision.json', import.meta.url);
const policyUrl = new URL('../BERS_LOCAL_MODEL_EFFICIENCY_POLICY.md', import.meta.url);

const clone = value => JSON.parse(JSON.stringify(value));
const rawDualBudget = JSON.parse(await readFile(dualBudgetUrl, 'utf8'));
const rawDecision = JSON.parse(await readFile(decisionUrl, 'utf8'));
const policy = await readFile(policyUrl, 'utf8');

function expectCode(fn, code) {
  assert.throws(fn, error => error instanceof HsmeDenseDualBudgetEvidenceV1Error && error.code === code);
}

test('HSME-2a dual-budget evidence binds the canonical compact-first and MVM laws', () => {
  const evidence = normalizeHsmeDenseDualBudgetEvidenceV1(clone(rawDualBudget));
  assert.equal(evidence.schemaVersion, HSME_DENSE_BASELINE_DUAL_BUDGET_EVIDENCE_V1_SCHEMA);
  assert.equal(evidence.policyPath, 'BERS_LOCAL_MODEL_EFFICIENCY_POLICY.md');
  assert.equal(evidence.policyMode, 'DUAL_BUDGET_COMPACT_FIRST');
  assert.equal(evidence.mvmLaw, 'MVM_IS_NOT_A_SIZE_WAIVER');
  assert.match(policy, /installed footprint budget/i);
  assert.match(policy, /working-memory budget/i);
  assert.match(policy, /MVM must not be used to skip steps 1–9/i);
  assert.match(policy, /quality \/ installed GB/i);
});

test('dual-budget sidecar covers exactly the same HSME-2a candidate identities', () => {
  const evidence = normalizeHsmeDenseDualBudgetEvidenceV1(clone(rawDualBudget));
  const decision = normalizeHsmeDenseBaselineDecisionV1(clone(rawDecision));
  assert.deepEqual(
    evidence.candidates.map(candidate => candidate.candidateId),
    decision.candidates.map(candidate => candidate.candidateId),
  );
});

test('Tiny-SD and SANA known storage facts remain bound to the baseline decision', () => {
  const evidence = normalizeHsmeDenseDualBudgetEvidenceV1(clone(rawDualBudget));
  const decision = normalizeHsmeDenseBaselineDecisionV1(clone(rawDecision));

  const tinyResource = evidence.candidates.find(candidate => candidate.candidateId === 'tiny-sd-control-v1');
  const tinyDecision = decision.candidates.find(candidate => candidate.candidateId === 'tiny-sd-control-v1');
  assert.equal(tinyResource?.installed.mandatoryInstalledBytes, tinyDecision?.metrics.fullPipelineBytes);
  assert.equal(tinyResource?.workingMemory.peakRamBytes, 'UNKNOWN');
  assert.equal(tinyResource?.efficiencyDisposition, 'R&D_ONLY');

  const sanaResource = evidence.candidates.find(candidate => candidate.candidateId === 'sana-sprint-0.6b-reference');
  const sanaDecision = decision.candidates.find(candidate => candidate.candidateId === 'sana-sprint-0.6b-reference');
  assert.equal(sanaResource?.installed.knownInstalledLowerBoundBytes, sanaDecision?.metrics.textConditionerBytes);
  assert.equal(sanaResource?.efficiencyDisposition, 'REJECT');
});

test('storage success cannot be inferred from low working memory or MVM feasibility', () => {
  const invalid = clone(rawDualBudget);
  const target = invalid.candidates.find(candidate => candidate.candidateId === 'bers-dense-core-v1-training-target');
  target.mvmState = 'MVM_CANDIDATE';
  target.workingMemory.peakRamBytes = 400000000;
  expectCode(() => normalizeHsmeDenseDualBudgetEvidenceV1(invalid), 'hsme_dense_dual_budget_mvm_invalid');

  target.workingMemory.flashBytesMovedPerRun = 700000000;
  const normalized = normalizeHsmeDenseDualBudgetEvidenceV1(invalid);
  const normalizedTarget = normalized.candidates.find(candidate => candidate.candidateId === 'bers-dense-core-v1-training-target');
  assert.equal(normalizedTarget?.efficiencyDisposition, 'R&D_ONLY');
});

test('product candidacy fails closed without measured quality-per-byte and both resource axes', () => {
  const noQuality = clone(rawDualBudget);
  const target = noQuality.candidates.find(candidate => candidate.candidateId === 'bers-dense-core-v1-training-target');
  target.efficiencyDisposition = 'COMPACT_DEFAULT_CANDIDATE';
  target.installed.mandatoryInstalledBytes = 800000000;
  target.workingMemory.peakRamBytes = 1000000000;
  expectCode(() => normalizeHsmeDenseDualBudgetEvidenceV1(noQuality), 'hsme_dense_dual_budget_product_candidate_invalid');

  target.qualityPerInstalledGbStatus = 'MEASURED';
  const measured = normalizeHsmeDenseDualBudgetEvidenceV1(noQuality);
  assert.equal(
    measured.candidates.find(candidate => candidate.candidateId === 'bers-dense-core-v1-training-target')?.efficiencyDisposition,
    'COMPACT_DEFAULT_CANDIDATE',
  );
});

test('installed lower bound cannot exceed a measured mandatory installed footprint', () => {
  const invalid = clone(rawDualBudget);
  const tiny = invalid.candidates.find(candidate => candidate.candidateId === 'tiny-sd-control-v1');
  tiny.installed.knownInstalledLowerBoundBytes = tiny.installed.mandatoryInstalledBytes + 1;
  expectCode(() => normalizeHsmeDenseDualBudgetEvidenceV1(invalid), 'hsme_dense_dual_budget_installed_invalid');
});

test('required metric sets preserve separate storage and working-memory evidence', () => {
  const evidence = normalizeHsmeDenseDualBudgetEvidenceV1(clone(rawDualBudget));
  assert.ok(evidence.requiredInstalledMetrics.includes('mandatory-installed-bytes'));
  assert.ok(evidence.requiredInstalledMetrics.includes('update-or-delta-download-bytes'));
  assert.ok(evidence.requiredWorkingMemoryMetrics.includes('peak-ram-bytes'));
  assert.ok(evidence.requiredWorkingMemoryMetrics.includes('flash-bytes-moved-per-run'));
  assert.ok(evidence.requiredWorkingMemoryMetrics.includes('energy-thermal-and-battery'));
});

test('dual-budget evidence exact schema rejects authority injection and unsafe numbers', () => {
  const widened = clone(rawDualBudget);
  widened.providerSelector = 'cloud';
  expectCode(() => normalizeHsmeDenseDualBudgetEvidenceV1(widened), 'hsme_dense_dual_budget_exact_schema_violation');

  const unsafe = clone(rawDualBudget);
  const tiny = unsafe.candidates.find(candidate => candidate.candidateId === 'tiny-sd-control-v1');
  tiny.installed.mandatoryInstalledBytes = Number.MAX_VALUE;
  expectCode(() => normalizeHsmeDenseDualBudgetEvidenceV1(unsafe), 'hsme_dense_dual_budget_value_invalid');
});
