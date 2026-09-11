import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { normalizeHsmeDenseBaselineDecisionV1 } from '../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

const decision = normalizeHsmeDenseBaselineDecisionV1(JSON.parse(await readFile(
  new URL('../src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-decision.json', import.meta.url),
  'utf8',
)));
const manifest = JSON.parse(await readFile(
  new URL('../src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json', import.meta.url),
  'utf8',
));

test('HSME-2a Tiny-SD control evidence remains bound to the accepted trust-root manifest', () => {
  const control = decision.candidates.find(candidate => candidate.candidateId === 'tiny-sd-control-v1');
  assert.ok(control);
  assert.equal(control.strategy, 'CONTROL_BASELINE');
  assert.equal(control.verdict, 'CONTROL_ONLY');
  assert.equal(control.metrics.fullPipelineBytes, manifest.upstream.snapshot.totalRuntimeBytes);
  assert.equal(control.metrics.textConditionerBytes, manifest.upstream.snapshot.files.find(file => file.path === 'text_encoder/pytorch_model.bin')?.size);
  assert.equal(control.sources[0]?.uri, manifest.upstream.repository);
  assert.equal(control.sources[0]?.revision, manifest.upstream.revision);
  assert.equal(control.sources[0]?.license, manifest.upstream.license);
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.productionApprovalEvidence, null);
});
