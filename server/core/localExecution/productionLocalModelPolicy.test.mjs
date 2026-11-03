import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalExecutionAdmissionRegistry } from './LocalExecutionAdmission.ts';
import { LocalExecutionModelUnavailableError, LocalExecutionTicketAuthority } from './LocalExecutionTicketAuthority.ts';
import { MOBILE_SAM_LOCAL_CAPABILITY, mobileSamProductionReleaseState, productionLocalModelsByCapability } from './productionLocalModelPolicy.ts';
import manifest from '../../../src/platform/creative/local-ai/models/interactive-segmentation.manifest.json' with { type: 'json' };

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });

const issueRequest = (idempotencyKey) => ({
  requestId: 'request-1',
  workflowId: 'workflow-1',
  stepId: 'segment-step',
  operation: { id: 'segment-step', version: '1', type: 'segment', capability: MOBILE_SAM_LOCAL_CAPABILITY },
  scope,
  inputs: [{ artifactId: 'original-1', kind: 'image', role: 'ORIGINAL', sha256: 'a'.repeat(64) }],
  expectedOutputs: [{ kind: 'mask', role: 'MASK', count: 1, mimeTypes: ['application/octet-stream'] }],
  policy: 'LOCAL_ONLY',
  idempotencyKey,
});

test('signed MobileSAM PRODUCTION_APPROVED release is executable Core authority', async () => {
  assert.equal(mobileSamProductionReleaseState.releaseStatus, 'PRODUCTION_APPROVED');
  assert.equal(mobileSamProductionReleaseState.executable, true);
  assert.deepEqual(productionLocalModelsByCapability[MOBILE_SAM_LOCAL_CAPABILITY], [
    { modelId: manifest.modelId, version: manifest.version },
  ]);

  const authority = new LocalExecutionTicketAuthority(new LocalExecutionAdmissionRegistry(), {
    now: () => 1_000,
    id: () => 'ticket-1',
    nonce: () => 'nonce-1',
    ttlMs: 30_000,
    modelsByCapability: productionLocalModelsByCapability,
  });

  const ticket = await authority.issue(issueRequest('approved-proof'));
  assert.equal(ticket.issuer, 'CORE');
  assert.equal(ticket.policy, 'LOCAL_ONLY');
  assert.deepEqual(ticket.allowedModels, [{ modelId: manifest.modelId, version: manifest.version }]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
});

test('capabilities without an approved local model still fail closed with 422 local_model_unavailable', () => {
  const authority = new LocalExecutionTicketAuthority(new LocalExecutionAdmissionRegistry(), {
    now: () => 1_000,
    id: () => 'must-not-be-issued',
    nonce: () => 'must-not-be-issued',
    ttlMs: 30_000,
    modelsByCapability: productionLocalModelsByCapability,
  });

  assert.throws(() => authority.issue({
    ...issueRequest('unknown-capability'),
    operation: { id: 'segment-step', version: '1', type: 'segment', capability: 'local:unknown:segment:v9' },
  }), error => {
    assert.ok(error instanceof LocalExecutionModelUnavailableError);
    assert.equal(error.status, 422);
    assert.equal(error.code, 'local_model_unavailable');
    return true;
  });
});
