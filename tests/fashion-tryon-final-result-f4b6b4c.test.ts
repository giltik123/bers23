import assert from 'node:assert/strict';
import test from 'node:test';
import { FASHION_TRYON_READINESS_STATUSES } from '../server/core/fashion/FashionTryOnReadinessService.ts';
import { FashionTryOnFinalResultService } from '../server/core/fashion/FashionTryOnFinalResultService.ts';
import { fashionTryOnPhaseRequestIds } from '../server/core/fashion/FashionTryOnOrchestrationContract.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const sourceArtifactId = 'signed-current-project-source';
const clientRequestId = 'tryon-final-result-1';
const auth = Object.freeze({ tenantId: 'tenant-result', userId: 'user-result' });
const intent = Object.freeze({ projectId, sourceArtifactId, garmentId, clientRequestId });
const phaseIds = fashionTryOnPhaseRequestIds(clientRequestId);
const ready = Object.freeze({
  status: 'READY' as const,
  projectId,
  sourceArtifactId,
  garmentId,
  categoryGroup: 'tops' as const,
});

function harness(input: Readonly<{
  readinessSequence?: readonly any[];
  recovered?: any;
  recoveryError?: unknown;
}> = {}) {
  const calls = { readiness: [] as any[], recovery: [] as any[] };
  let readinessIndex = 0;
  const readinessSequence = input.readinessSequence ?? [ready];
  const service = new FashionTryOnFinalResultService({
    readiness: {
      async check(command: any, principal: any) {
        calls.readiness.push({ command, principal });
        const value = readinessSequence[Math.min(readinessIndex, readinessSequence.length - 1)] ?? ready;
        readinessIndex += 1;
        return value;
      },
    },
    finalRecovery: {
      async recoverForIntent(command: any, principal: any) {
        calls.recovery.push({ command, principal });
        if (input.recoveryError) throw input.recoveryError;
        return input.recovered ?? Object.freeze({
          status: 'SUCCESS' as const,
          executionId: 'internal-texture-execution',
          artifactId: 'signed-final-candidate',
        });
      },
    },
  } as any);
  return { service, calls };
}

test('F4b.6b.4c derives exact texture phase and exposes only signed FINAL candidate after two current-readiness checks', async () => {
  const h = harness({ readinessSequence: [ready, ready] });
  const result = await h.service.result(intent, auth as any);
  assert.deepEqual(result, {
    status: 'FINAL_READY',
    projectId,
    sourceArtifactId,
    garmentId,
    artifactId: 'signed-final-candidate',
  });
  assert.equal(h.calls.readiness.length, 2);
  assert.deepEqual(h.calls.readiness[0], {
    command: { projectId, sourceArtifactId, garmentId },
    principal: auth,
  });
  assert.deepEqual(h.calls.readiness[1], h.calls.readiness[0]);
  assert.deepEqual(h.calls.recovery, [{
    command: {
      projectId,
      clientRequestId: phaseIds.textureComposite,
      sourceArtifactId,
      garmentId,
    },
    principal: auth,
  }]);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('internal-texture-execution'), false);
  assert.equal('ticketId' in result, false);
  assert.equal('executionId' in result, false);
  assert.equal('storageId' in result, false);
});

test('F4b.6b.4c suppresses a recovered FINAL if Project or evidence becomes stale before exposure', async () => {
  const stale = Object.freeze({ status: 'STALE_SOURCE' as const, projectId, sourceArtifactId, garmentId });
  const h = harness({ readinessSequence: [ready, stale] });
  const result = await h.service.result(intent, auth as any);
  assert.deepEqual(result, { status: 'PREREQUISITE', readiness: stale });
  assert.equal(h.calls.recovery.length, 1);
  assert.equal(h.calls.readiness.length, 2);
  assert.equal(JSON.stringify(result).includes('signed-final-candidate'), false);
});

test('F4b.6b.4c maps non-success durable texture states without internal execution identity or unnecessary second readiness', async () => {
  const cases = [
    [{ status: 'NOT_PREPARED' }, 'TEXTURE_NOT_PREPARED'],
    [{ status: 'PENDING', executionId: 'pending-internal-execution' }, 'TEXTURE_PENDING'],
    [{ status: 'FAILED', executionId: 'failed-internal-execution' }, 'TEXTURE_FAILED'],
  ] as const;
  for (const [recovered, expectedStatus] of cases) {
    const h = harness({ recovered });
    const result = await h.service.result(intent, auth as any);
    assert.deepEqual(result, { status: expectedStatus, projectId, sourceArtifactId, garmentId });
    assert.equal(JSON.stringify(result).includes('internal-execution'), false);
    assert.equal(h.calls.readiness.length, 1);
  }
});

test('F4b.6b.4c every current readiness prerequisite suppresses FINAL recovery', async () => {
  for (const status of FASHION_TRYON_READINESS_STATUSES.filter(value => value !== 'READY')) {
    const prerequisite = Object.freeze({ status, projectId, sourceArtifactId, garmentId });
    const h = harness({ readinessSequence: [prerequisite] });
    const result = await h.service.result(intent, auth as any);
    assert.deepEqual(result, { status: 'PREREQUISITE', readiness: prerequisite });
    assert.equal(h.calls.recovery.length, 0, `${status} must suppress committed FINAL recovery`);
    assert.equal(h.calls.readiness.length, 1);
  }
});

test('F4b.6b.4c rejects browser evidence, execution, storage, FINAL and producer authority before readiness', async () => {
  const forbiddenInputs = [
    { representationId: '33333333-3333-4333-8333-333333333333' },
    { anchorSetId: '44444444-4444-4444-8444-444444444444' },
    { garmentWarpLayerId: '55555555-5555-4555-8555-555555555555' },
    { garmentWarpLayerSha256: 'a'.repeat(64) },
    { ticketId: 'client-ticket' },
    { executionId: 'client-execution' },
    { storageId: '66666666-6666-4666-8666-666666666666' },
    { artifactId: 'client-final' },
    { finalId: 'client-final' },
    { producerParameters: { featherRadius: 8 } },
  ];
  for (const extra of forbiddenInputs) {
    const h = harness();
    await assert.rejects(
      () => h.service.result({ ...intent, ...extra }, auth as any),
      (error: any) => error?.status === 400 && error?.code === 'forbidden_client_authority',
    );
    assert.equal(h.calls.readiness.length, 0);
    assert.equal(h.calls.recovery.length, 0);
  }
});

test('F4b.6b.4c propagates stable-intent recovery mismatch fail-closed and never substitutes a historical candidate', async () => {
  const mismatch = Object.assign(new Error('durable ticket belongs to another stable intent'), {
    status: 409,
    code: 'garment_texture_final_recovery_intent_mismatch',
  });
  const h = harness({ recoveryError: mismatch });
  await assert.rejects(
    () => h.service.result(intent, auth as any),
    (error: any) => error?.status === 409 && error?.code === 'garment_texture_final_recovery_intent_mismatch',
  );
  assert.equal(h.calls.recovery.length, 1);
  assert.equal(h.calls.readiness.length, 1);
});
