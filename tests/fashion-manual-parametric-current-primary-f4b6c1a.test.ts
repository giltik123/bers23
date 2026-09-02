import assert from 'node:assert/strict';
import test from 'node:test';
import { FashionTryOnReadinessService } from '../server/core/fashion/FashionTryOnReadinessService.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const currentPrimaryViewId = '33333333-3333-4333-8333-333333333333';
const stalePrimaryViewId = '44444444-4444-4444-8444-444444444444';
const currentRepresentationId = '55555555-5555-4555-8555-555555555555';
const staleRepresentationId = '66666666-6666-4666-8666-666666666666';
const anchorSetId = '77777777-7777-4777-8777-777777777777';
const storageId = '88888888-8888-4888-8888-888888888888';
const sourceArtifactId = 'signed-current-source';
const auth = Object.freeze({ tenantId: 'tenant-current-primary', userId: 'user-current-primary' });
const source = Object.freeze({
  artifactId: sourceArtifactId,
  projectId,
  storageId,
  role: 'COMPOSITE',
  lifecycle: 'FINAL',
  width: 640,
  height: 960,
  sha256: 'a'.repeat(64),
});

function representation(id: string, basisViewId: string, admittedAt: string) {
  return Object.freeze({
    id,
    garmentId,
    tier: 'PARAMETRIC',
    format: 'BERS_PARAMETRIC_V1',
    contentType: 'application/vnd.bers.garment-parametric+json',
    contentSha256: id === currentRepresentationId ? 'b'.repeat(64) : 'c'.repeat(64),
    byteSize: 100,
    storageBackend: 'POSTGRES_BYTEA_V1',
    basisViewId,
    generatorId: 'bers.manual-parametric-contour',
    generatorVersion: '1',
    validatorId: 'bers.parametric-topology-validator',
    validatorVersion: '1',
    admissionState: 'ADMITTED',
    admittedAt,
    revokedAt: null,
    sources: Object.freeze([{ position: 0, viewId: basisViewId, contentSha256: 'd'.repeat(64) }]),
  });
}

function service(representations: readonly any[]) {
  const deriveCalls: any[] = [];
  const pool = {
    query: async (sql: string) => {
      if (sql.includes('FROM canonical_projects')) return { rows: [{ current_image_storage_id: storageId }] };
      if (sql.includes('FROM canonical_garments')) return { rows: [{ primary_view_id: currentPrimaryViewId }] };
      if (sql.includes('FROM canonical_project_body_anchor_sets')) {
        return { rows: [{ anchor_set_id: anchorSetId, acquisition_sequence: '7' }] };
      }
      throw new Error(`unexpected readiness query: ${sql}`);
    },
  };
  return {
    deriveCalls,
    readiness: new FashionTryOnReadinessService({
      pool: pool as any,
      artifacts: { resolveStoredImageEvidence: async () => source as any },
      wardrobe: {
        get: async () => Object.freeze({ id: garmentId, status: 'ACTIVE', category: 'tshirts' }) as any,
      },
      representations: { list: async () => representations as any },
      bodyAnchors: {
        deriveDestinationMesh: async (...args: any[]) => {
          deriveCalls.push(args);
          return Object.freeze({ schemaVersion: 1, vertices: [], triangles: [] }) as any;
        },
      },
    }),
  };
}

const command = Object.freeze({ projectId, sourceArtifactId, garmentId });

test('F4b.6c.1a readiness filters historical basis before newest representation ordering', async () => {
  const staleNewer = representation(staleRepresentationId, stalePrimaryViewId, '2026-09-02T00:00:02.000Z');
  const currentOlder = representation(currentRepresentationId, currentPrimaryViewId, '2026-09-02T00:00:01.000Z');
  const candidate = service([staleNewer, currentOlder]);

  const resolved = await candidate.readiness.resolve(command, auth as any);
  assert.equal(resolved.status, 'READY');
  if (resolved.status !== 'READY') return;
  assert.equal(resolved.representationId, currentRepresentationId);
  assert.equal(candidate.deriveCalls.length, 1);
  assert.equal(candidate.deriveCalls[0][4], currentRepresentationId);
});

test('F4b.6c.1a readiness fails closed when every admitted PARAMETRIC row is historical-basis evidence', async () => {
  const stale = representation(staleRepresentationId, stalePrimaryViewId, '2026-09-02T00:00:02.000Z');
  const candidate = service([stale]);

  const resolved = await candidate.readiness.resolve(command, auth as any);
  assert.equal(resolved.status, 'REPRESENTATION_REQUIRED');
  assert.equal(candidate.deriveCalls.length, 0);
});
