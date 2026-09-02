import assert from 'node:assert/strict';
import test from 'node:test';
import { ManualParametricGarmentAdmissionService } from '../server/core/fashion/ManualParametricGarmentAdmissionService.ts';
import { ManagedGarmentLocalExecutionInputAuthority } from '../server/core/localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';

const scope = Object.freeze({ tenantId: 'tenant-manual-parametric', userId: 'user-manual-parametric' });
const garmentId = '11111111-1111-4111-8111-111111111111';
const primaryViewId = '22222222-2222-4222-8222-222222222222';
const historicalViewId = '33333333-3333-4333-8333-333333333333';
const representationId = '44444444-4444-4444-8444-444444444444';
const contour = Object.freeze({
  schemaVersion: 1,
  coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
  contour: Object.freeze([
    Object.freeze([0.1, 0.1]),
    Object.freeze([0.9, 0.1]),
    Object.freeze([0.9, 0.9]),
    Object.freeze([0.1, 0.9]),
  ]),
});

function admissionResult() {
  return Object.freeze({
    garmentRevision: 8,
    representationTier: 'PARAMETRIC' as const,
    replayed: false,
    representation: Object.freeze({
      id: representationId,
      garmentId,
      tier: 'PARAMETRIC' as const,
      format: 'BERS_PARAMETRIC_V1' as const,
      contentType: 'application/vnd.bers.garment-parametric+json' as const,
      contentSha256: 'a'.repeat(64),
      byteSize: 10,
      storageBackend: 'POSTGRES_BYTEA_V1' as const,
      basisViewId: primaryViewId,
      generatorId: 'bers.manual-parametric-contour',
      generatorVersion: '1',
      validatorId: 'bers.parametric-topology-validator',
      validatorVersion: '1',
      admissionState: 'ADMITTED' as const,
      admittedAt: '2026-09-02T00:00:00.000Z',
      revokedAt: null,
      sources: Object.freeze([Object.freeze({ position: 0, viewId: primaryViewId, contentSha256: 'b'.repeat(64) })]),
    }),
  });
}

test('F4b.6c.1a service delegates only closed browser intent to the narrow transactional store primitive', async () => {
  const calls: unknown[][] = [];
  const result = admissionResult();
  const service = new ManualParametricGarmentAdmissionService({
    async admitManualParametricContour(...args: any[]) {
      calls.push(args);
      return result;
    },
  });

  const actual = await service.admit(scope, { garmentId, expectedRevision: 7, contour });
  assert.equal(actual, result);
  assert.deepEqual(calls, [[scope, garmentId, 7, contour]]);
});

test('F4b.6c.1a service rejects browser representation source hash and provenance authority before store mutation', async () => {
  let calls = 0;
  const service = new ManualParametricGarmentAdmissionService({
    async admitManualParametricContour() { calls += 1; return admissionResult(); },
  });

  const forbidden = [
    { sourceViewId: primaryViewId },
    { sourceViewIds: [primaryViewId] },
    { sourceContentSha256: 'a'.repeat(64) },
    { storageId: historicalViewId },
    { representationId },
    { generatorId: 'browser.claim' },
    { generatorVersion: '999' },
    { validatorId: 'browser.validator' },
    { replayed: true },
  ];
  for (const extra of forbidden) {
    await assert.rejects(
      service.admit(scope, { garmentId, expectedRevision: 7, contour, ...extra } as any),
      (error: any) => error?.status === 400 && error?.code === 'manual_parametric_forbidden_authority',
    );
  }
  assert.equal(calls, 0);
});

test('F4b.6c.1a managed execution rejects an admitted historical-basis representation before payload read', async () => {
  let payloadReads = 0;
  const authority = new ManagedGarmentLocalExecutionInputAuthority({
    garments: {
      async get() {
        return Object.freeze({
          id: garmentId,
          status: 'ACTIVE',
          primaryViewId,
          views: Object.freeze([
            Object.freeze({ id: primaryViewId }),
            Object.freeze({ id: historicalViewId }),
          ]),
        }) as any;
      },
      async loadView() { throw new Error('unexpected view read'); },
    },
    representations: {
      async get() {
        return Object.freeze({
          ...admissionResult().representation,
          basisViewId: historicalViewId,
          sources: Object.freeze([Object.freeze({ position: 0, viewId: historicalViewId, contentSha256: 'c'.repeat(64) })]),
        }) as any;
      },
      async loadPayload() {
        payloadReads += 1;
        return Object.freeze({
          bytes: Uint8Array.of(1),
          contentType: 'application/vnd.bers.garment-parametric+json' as const,
          contentSha256: 'a'.repeat(64),
        });
      },
    },
  });

  await assert.rejects(
    authority.bindParametricRepresentation(scope, garmentId, representationId),
    (error: any) => error?.status === 409
      && error?.code === 'managed_garment_input_state_mismatch'
      && /current primary view/i.test(error.message),
  );
  assert.equal(payloadReads, 0);
});
