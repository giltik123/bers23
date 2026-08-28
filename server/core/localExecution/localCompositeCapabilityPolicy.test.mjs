import assert from 'node:assert/strict';
import test from 'node:test';
import { LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES } from '../../../src/platform/creative/canonical/localComposite.ts';
import { BACKGROUND_ISOLATION_CAPABILITY, BACKGROUND_ISOLATION_TOOL_ID, BACKGROUND_ISOLATION_TOOL_VERSION } from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';
import { LocalExecutionAdmissionRegistry } from './LocalExecutionAdmission.ts';
import { LocalExecutionModelUnavailableError, LocalExecutionTicketAuthority } from './LocalExecutionTicketAuthority.ts';
import { productionLocalExecutorsByCapability } from './productionLocalExecutorPolicy.ts';
import { MOBILE_SAM_LOCAL_CAPABILITY, mobileSamProductionReleaseState, productionLocalModelsByCapability } from './productionLocalModelPolicy.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });

test('C5B composite MobileSAM capability shares the exact production release decision and cannot promote a CANDIDATE', () => {
  assert.equal(mobileSamProductionReleaseState.releaseStatus, 'CANDIDATE');
  assert.equal(mobileSamProductionReleaseState.executable, false);
  assert.strictEqual(
    productionLocalModelsByCapability[LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment],
    productionLocalModelsByCapability[MOBILE_SAM_LOCAL_CAPABILITY],
    'composite and standalone MobileSAM capabilities must share one model-trust binding',
  );
  assert.deepEqual(productionLocalModelsByCapability[LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment], []);

  const authority = new LocalExecutionTicketAuthority(new LocalExecutionAdmissionRegistry(), {
    now: () => 1_000,
    id: () => 'must-not-be-issued',
    nonce: () => 'must-not-be-issued',
    ttlMs: 30_000,
    modelsByCapability: productionLocalModelsByCapability,
    executorsByCapability: productionLocalExecutorsByCapability,
  });
  assert.throws(() => authority.issue({
    requestId: 'composite-request',
    workflowId: 'composite-workflow',
    stepId: 'local-continuation-01-segment',
    operation: { id: 'local-continuation-01-segment', version: '1', type: 'segment', capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.segment },
    scope,
    inputs: [{ artifactId: 'original-1', kind: 'image', role: 'ORIGINAL', sha256: 'a'.repeat(64) }],
    expectedOutputs: [{ kind: 'mask', role: 'MASK', count: 1, mimeTypes: ['application/octet-stream'], width: 2, height: 2 }],
    policy: 'LOCAL_ONLY',
    idempotencyKey: 'composite-segment',
  }), error => {
    assert.ok(error instanceof LocalExecutionModelUnavailableError);
    assert.equal(error.status, 422);
    assert.equal(error.code, 'local_model_unavailable');
    return true;
  });
});

test('C5B Background Isolation capability aliases the accepted deterministic executor and mints only a zero-cloud V2 ticket', async () => {
  assert.strictEqual(
    productionLocalExecutorsByCapability[LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation],
    productionLocalExecutorsByCapability[BACKGROUND_ISOLATION_CAPABILITY],
    'composite and standalone Background Isolation must share one deterministic executor-trust binding',
  );
  assert.deepEqual(productionLocalExecutorsByCapability[LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation], [{
    kind: 'DETERMINISTIC_TOOL', toolId: BACKGROUND_ISOLATION_TOOL_ID, version: BACKGROUND_ISOLATION_TOOL_VERSION,
  }]);

  const authority = new LocalExecutionTicketAuthority(new LocalExecutionAdmissionRegistry(), {
    now: () => 1_000,
    id: () => 'composite-background-ticket',
    nonce: () => 'composite-background-nonce',
    ttlMs: 30_000,
    modelsByCapability: productionLocalModelsByCapability,
    executorsByCapability: productionLocalExecutorsByCapability,
  });
  const ticket = await authority.issue({
    ticketVersion: '2',
    requestId: 'composite-request',
    workflowId: 'composite-workflow',
    stepId: 'local-continuation-02-background-isolation',
    operation: {
      id: 'local-continuation-02-background-isolation', version: '1', type: 'BACKGROUND_ISOLATION',
      capability: LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation,
    },
    scope,
    inputs: [
      { artifactId: 'original-1', kind: 'image', role: 'ORIGINAL', sha256: 'a'.repeat(64) },
      { artifactId: 'mask-1', kind: 'mask', role: 'MASK', sha256: 'b'.repeat(64) },
    ],
    expectedOutputs: [{ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], width: 2, height: 2 }],
    policy: 'LOCAL_ONLY',
    idempotencyKey: 'composite-background-isolation',
  });
  assert.equal(ticket.version, '2');
  assert.equal(ticket.workflowId, 'composite-workflow');
  assert.equal(ticket.stepId, 'local-continuation-02-background-isolation');
  assert.equal(ticket.operation.capability, LOCAL_BACKGROUND_ISOLATION_COMPOSITE_CAPABILITIES.backgroundIsolation);
  assert.deepEqual(ticket.allowedExecutors, [{ kind: 'DETERMINISTIC_TOOL', toolId: BACKGROUND_ISOLATION_TOOL_ID, version: BACKGROUND_ISOLATION_TOOL_VERSION }]);
  assert.deepEqual(ticket.cost, { paidCloudCredits: 0, providerCalls: 0 });
});
