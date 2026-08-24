import assert from 'node:assert/strict';
import test from 'node:test';
import { LocalExecutionAdmissionRegistry } from './LocalExecutionAdmission.ts';
import { LocalExecutionModelUnavailableError, LocalExecutionTicketAuthority } from './LocalExecutionTicketAuthority.ts';
import { MOBILE_SAM_LOCAL_CAPABILITY, mobileSamProductionReleaseState, productionLocalModelsByCapability } from './productionLocalModelPolicy.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });

test('signed MobileSAM CANDIDATE is not executable Core authority', () => {
  assert.equal(mobileSamProductionReleaseState.releaseStatus, 'CANDIDATE');
  assert.equal(mobileSamProductionReleaseState.executable, false);
  assert.deepEqual(productionLocalModelsByCapability[MOBILE_SAM_LOCAL_CAPABILITY], []);

  const authority = new LocalExecutionTicketAuthority(new LocalExecutionAdmissionRegistry(), {
    now: () => 1_000,
    id: () => 'must-not-be-issued',
    nonce: () => 'must-not-be-issued',
    ttlMs: 30_000,
    modelsByCapability: productionLocalModelsByCapability,
  });

  assert.throws(() => authority.issue({
    requestId: 'request-1',
    workflowId: 'workflow-1',
    stepId: 'segment-step',
    operation: { id: 'segment-step', version: '1', type: 'segment', capability: MOBILE_SAM_LOCAL_CAPABILITY },
    scope,
    inputs: [{ artifactId: 'original-1', kind: 'image', role: 'ORIGINAL', sha256: 'a'.repeat(64) }],
    expectedOutputs: [{ kind: 'mask', role: 'MASK', count: 1, mimeTypes: ['application/octet-stream'] }],
    policy: 'LOCAL_ONLY',
    idempotencyKey: 'candidate-proof',
  }), error => {
    assert.ok(error instanceof LocalExecutionModelUnavailableError);
    assert.equal(error.status, 422);
    assert.equal(error.code, 'local_model_unavailable');
    return true;
  });
});
