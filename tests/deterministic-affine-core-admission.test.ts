import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AFFINE_TRANSFORM_CAPABILITY,
  AFFINE_TRANSFORM_OPERATION,
  AFFINE_TRANSFORM_STEP_ID,
  AFFINE_TRANSFORM_TOOL_VERSION,
  IDENTITY_AFFINE_INVERSE_Q16,
} from '../src/platform/creative/deterministic/AffineTransform.ts';
import { LocalExecutionAdmissionRegistry } from '../server/core/localExecution/LocalExecutionAdmission.ts';
import {
  LocalExecutionExecutorUnavailableError,
  LocalExecutionModelUnavailableError,
  LocalExecutionTicketAuthority,
} from '../server/core/localExecution/LocalExecutionTicketAuthority.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy.ts';

const scope = Object.freeze({
  tenantId: 'tenant-affine-candidate',
  projectId: 'project-affine-candidate',
  userId: 'user-affine-candidate',
});

const requestBase = Object.freeze({
  requestId: 'affine-candidate-request',
  workflowId: 'affine-candidate-workflow',
  stepId: AFFINE_TRANSFORM_STEP_ID,
  operation: Object.freeze({
    id: AFFINE_TRANSFORM_STEP_ID,
    version: AFFINE_TRANSFORM_TOOL_VERSION,
    type: AFFINE_TRANSFORM_OPERATION,
    capability: AFFINE_TRANSFORM_CAPABILITY,
    parameters: Object.freeze({
      sourceArtifactId: 'source-original',
      inverseMatrixQ16: IDENTITY_AFFINE_INVERSE_Q16,
    }),
  }),
  scope,
  inputs: Object.freeze([Object.freeze({
    artifactId: 'source-original',
    kind: 'image',
    role: 'ORIGINAL' as const,
    sha256: 'a'.repeat(64),
  })]),
  expectedOutputs: Object.freeze([Object.freeze({
    kind: 'image',
    role: 'COMPOSITE' as const,
    count: 1,
    mimeTypes: Object.freeze(['image/png']),
  })]),
  policy: 'LOCAL_ONLY' as const,
  idempotencyKey: 'affine-candidate-request:affine-transform:local-v2',
});

test('Core ticket authority keeps Affine candidate fail-closed for both v2 executors and legacy v1 models', () => {
  const ledger = new LocalExecutionAdmissionRegistry();
  const authority = new LocalExecutionTicketAuthority(ledger, {
    now: () => 1_000,
    id: () => 'affine-candidate-ticket',
    nonce: () => 'affine-candidate-nonce',
    ttlMs: 60_000,
    modelsByCapability: productionLocalModelsByCapability,
    executorsByCapability: productionLocalExecutorsByCapability,
  });

  assert.equal(productionLocalExecutorsByCapability[AFFINE_TRANSFORM_CAPABILITY], undefined);
  assert.equal(productionLocalModelsByCapability[AFFINE_TRANSFORM_CAPABILITY], undefined);

  assert.throws(
    () => authority.issue(Object.freeze({ ...requestBase, ticketVersion: '2' as const })),
    error => error instanceof LocalExecutionExecutorUnavailableError && error.code === 'local_executor_unavailable',
  );
  assert.throws(
    () => authority.issue(requestBase),
    error => error instanceof LocalExecutionModelUnavailableError && error.code === 'local_model_unavailable',
  );

  assert.equal(ledger.getByIdempotencyKeyV2(scope, requestBase.idempotencyKey), undefined);
  assert.equal(ledger.getByIdempotencyKey(scope, requestBase.idempotencyKey), undefined);
});
