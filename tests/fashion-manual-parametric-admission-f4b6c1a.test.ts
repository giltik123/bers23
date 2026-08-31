import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { ManualParametricGarmentAdmissionService } from '../server/core/fashion/ManualParametricGarmentAdmissionService.ts';
import {
  MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID,
  MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION,
  produceManualParametricRepresentation,
} from '../server/core/fashion/manualParametricContour.ts';
import {
  PARAMETRIC_VALIDATOR_ID,
  PARAMETRIC_VALIDATOR_VERSION,
} from '../server/core/fashion/postgresGarmentRepresentationStore.ts';

const scope = Object.freeze({ tenantId: 'tenant-manual-parametric', userId: 'user-manual-parametric' });
const garmentId = '11111111-1111-4111-8111-111111111111';
const primaryViewId = '22222222-2222-4222-8222-222222222222';
const representationId = '33333333-3333-4333-8333-333333333333';
const primaryViewSha256 = 'a'.repeat(64);
const contour = Object.freeze({
  schemaVersion: 1,
  coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
  contour: Object.freeze([
    Object.freeze([0.1, 0.1]),
    Object.freeze([0.9, 0.1]),
    Object.freeze([0.9, 0.9]),
    Object.freeze([0.5, 0.5]),
    Object.freeze([0.1, 0.9]),
  ]),
});
const payload = produceManualParametricRepresentation(contour);
const canonicalBytes = new TextEncoder().encode(JSON.stringify(payload));
const contentSha256 = sha256(canonicalBytes);

function garment(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    id: garmentId,
    name: 'Jacket',
    representationTier: 'BASIC',
    status: 'ACTIVE',
    revision: 7,
    primaryViewId,
    views: Object.freeze([Object.freeze({
      id: primaryViewId,
      ordinal: 0,
      kind: 'FRONT',
      sourceContentType: 'image/png',
      width: 800,
      height: 1000,
      encoding: 'PNG_RGBA8_LOSSLESS',
      contentType: 'image/png',
      contentSha256: primaryViewSha256,
      storageBackend: 'POSTGRES_BYTEA_V1',
      createdAt: '2026-08-31T00:00:00.000Z',
    })]),
    createdAt: '2026-08-31T00:00:00.000Z',
    updatedAt: '2026-08-31T00:00:00.000Z',
    ...overrides,
  });
}

function representation(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    id: representationId,
    garmentId,
    tier: 'PARAMETRIC',
    format: 'BERS_PARAMETRIC_V1',
    contentType: 'application/vnd.bers.garment-parametric+json',
    contentSha256,
    byteSize: canonicalBytes.byteLength,
    storageBackend: 'POSTGRES_BYTEA_V1',
    basisViewId: primaryViewId,
    generatorId: MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID,
    generatorVersion: MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION,
    validatorId: PARAMETRIC_VALIDATOR_ID,
    validatorVersion: PARAMETRIC_VALIDATOR_VERSION,
    admissionState: 'ADMITTED',
    admittedAt: '2026-08-31T00:00:00.000Z',
    revokedAt: null,
    sources: Object.freeze([Object.freeze({ position: 0, viewId: primaryViewId, contentSha256: primaryViewSha256 })]),
    ...overrides,
  });
}

function service(input: Readonly<{
  garment?: any;
  listed?: readonly any[];
  loadedBytes?: Uint8Array;
  admittedRepresentation?: any;
}> = {}) {
  const calls = { list: 0, load: 0, admit: [] as any[] };
  const currentGarment = input.garment ?? garment();
  const listed = input.listed ?? Object.freeze([]);
  const admittedRepresentation = input.admittedRepresentation ?? representation();
  return {
    calls,
    authority: new ManualParametricGarmentAdmissionService({
      garments: {
        get: async () => currentGarment,
      },
      representations: {
        list: async () => { calls.list += 1; return listed as any; },
        loadPayload: async () => {
          calls.load += 1;
          return Object.freeze({
            bytes: Uint8Array.from(input.loadedBytes ?? canonicalBytes),
            contentType: 'application/vnd.bers.garment-parametric+json' as const,
            contentSha256,
          });
        },
        admit: async (...args: any[]) => {
          calls.admit.push(args);
          return Object.freeze({
            garmentRevision: 8,
            representationTier: 'PARAMETRIC' as const,
            representation: admittedRepresentation,
          });
        },
      },
    }),
  };
}

test('F4b.6c.1a admits only server-produced geometry bound to the current primary view', async () => {
  const { authority, calls } = service();
  const result = await authority.admit(scope, { garmentId, expectedRevision: 7, contour });
  assert.equal(result.replayed, false);
  assert.equal(result.garmentRevision, 8);
  assert.equal(result.representation.id, representationId);
  assert.equal(calls.admit.length, 1);
  const [calledScope, calledGarmentId, calledRevision, calledInput] = calls.admit[0];
  assert.deepEqual(calledScope, scope);
  assert.equal(calledGarmentId, garmentId);
  assert.equal(calledRevision, 7);
  assert.deepEqual(calledInput.sourceViewIds, [primaryViewId]);
  assert.equal(calledInput.generatorId, MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID);
  assert.equal(calledInput.generatorVersion, MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION);
  assert.equal(calledInput.tier, 'PARAMETRIC');
  assert.deepEqual(calledInput.payload, payload);
});

test('F4b.6c.1a exact byte/provenance/current-primary replay is idempotent even after revision advanced', async () => {
  const exact = representation();
  const { authority, calls } = service({ garment: garment({ revision: 8, representationTier: 'PARAMETRIC' }), listed: [exact] });
  const result = await authority.admit(scope, { garmentId, expectedRevision: 7, contour });
  assert.equal(result.replayed, true);
  assert.equal(result.garmentRevision, 8);
  assert.equal(result.representation, exact);
  assert.equal(calls.load, 1);
  assert.equal(calls.admit.length, 0);
});

test('F4b.6c.1a hash match with different bytes fails closed instead of replaying', async () => {
  const { authority, calls } = service({ listed: [representation()], loadedBytes: Uint8Array.of(1, 2, 3, 4) });
  await assert.rejects(
    authority.admit(scope, { garmentId, expectedRevision: 7, contour }),
    (error: any) => error?.code === 'manual_parametric_content_hash_collision',
  );
  assert.equal(calls.admit.length, 0);
});

test('F4b.6c.1a exact bytes with different producer or source provenance cannot be laundered into manual replay', async () => {
  for (const candidate of [
    representation({ generatorId: 'other.generator' }),
    representation({ basisViewId: '44444444-4444-4444-8444-444444444444' }),
    representation({ sources: Object.freeze([Object.freeze({ position: 0, viewId: primaryViewId, contentSha256: 'b'.repeat(64) })]) }),
  ]) {
    const { authority, calls } = service({ listed: [candidate] });
    await assert.rejects(
      authority.admit(scope, { garmentId, expectedRevision: 7, contour }),
      (error: any) => error?.code === 'manual_parametric_existing_provenance_conflict',
    );
    assert.equal(calls.admit.length, 0);
  }
});

test('F4b.6c.1a stale revision without exact replay cannot mutate representation authority', async () => {
  const { authority, calls } = service({ garment: garment({ revision: 8 }) });
  await assert.rejects(
    authority.admit(scope, { garmentId, expectedRevision: 7, contour }),
    (error: any) => error?.code === 'garment_revision_conflict',
  );
  assert.equal(calls.admit.length, 0);
});

test('F4b.6c.1a archived garments and missing current primary views fail before representation mutation', async () => {
  const archived = service({ garment: garment({ status: 'ARCHIVED' }) });
  await assert.rejects(
    archived.authority.admit(scope, { garmentId, expectedRevision: 7, contour }),
    (error: any) => error?.code === 'manual_parametric_garment_not_active',
  );
  assert.equal(archived.calls.list, 0);
  assert.equal(archived.calls.admit.length, 0);

  const missingView = service({ garment: garment({ views: Object.freeze([]) }) });
  await assert.rejects(
    missingView.authority.admit(scope, { garmentId, expectedRevision: 7, contour }),
    (error: any) => error?.code === 'manual_parametric_primary_view_unavailable',
  );
  assert.equal(missingView.calls.admit.length, 0);
});

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
