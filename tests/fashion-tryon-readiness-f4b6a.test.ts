import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FashionTryOnReadinessService,
  type FashionTryOnReadinessDependencies,
} from '../server/core/fashion/FashionTryOnReadinessService.ts';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const GARMENT_ID = '22222222-2222-4222-8222-222222222222';
const REPRESENTATION_ID = '33333333-3333-4333-8333-333333333333';
const ANCHOR_SET_ID = '44444444-4444-4444-8444-444444444444';
const SOURCE_ARTIFACT_ID = 'signed-current-project-image';
const SOURCE_STORAGE_ID = '55555555-5555-4555-8555-555555555555';
const PRIMARY_VIEW_ID = '66666666-6666-4666-8666-666666666666';
const SOURCE_SHA = 'a'.repeat(64);
const AUTH = Object.freeze({ tenantId: 'tenant-a', userId: 'user-a' });
const COMMAND = Object.freeze({ projectId: PROJECT_ID, sourceArtifactId: SOURCE_ARTIFACT_ID, garmentId: GARMENT_ID });

function representation(overrides: Record<string, unknown> = {}) {
  return Object.freeze({
    id: REPRESENTATION_ID,
    garmentId: GARMENT_ID,
    tier: 'PARAMETRIC',
    format: 'BERS_PARAMETRIC_V1',
    contentType: 'application/vnd.bers.garment-parametric+json',
    contentSha256: 'b'.repeat(64),
    byteSize: 123,
    storageBackend: 'POSTGRES_BYTEA_V1',
    basisViewId: PRIMARY_VIEW_ID,
    generatorId: 'test.generator',
    generatorVersion: '1',
    validatorId: 'bers.parametric-topology-validator',
    validatorVersion: '1',
    admissionState: 'ADMITTED',
    admittedAt: '2026-08-31T20:00:00.000Z',
    revokedAt: null,
    sources: Object.freeze([]),
    ...overrides,
  });
}

function createHarness(overrides: Readonly<{
  currentStorageId?: string | null;
  currentPrimaryViewId?: string | null;
  category?: string;
  garmentStatus?: 'ACTIVE' | 'ARCHIVED';
  representations?: readonly any[];
  anchors?: readonly Readonly<{ anchor_set_id: string; acquisition_sequence: string; created_at_text?: string }>[];
  deriveError?: unknown;
}> = {}) {
  let deriveCalls = 0;
  const queries: Readonly<{ sql: string; params: readonly unknown[] }>[] = [] as any;
  const source = Object.freeze({
    artifactId: SOURCE_ARTIFACT_ID,
    projectId: PROJECT_ID,
    storageId: SOURCE_STORAGE_ID,
    role: 'ORIGINAL' as const,
    lifecycle: 'IMMUTABLE' as const,
    width: 256,
    height: 384,
    sha256: SOURCE_SHA,
  });
  const anchorRows = overrides.anchors ?? [Object.freeze({ anchor_set_id: ANCHOR_SET_ID, acquisition_sequence: '1' })];
  const pool = {
    async query(sql: string, params: readonly unknown[]) {
      (queries as any).push(Object.freeze({ sql, params: [...params] }));
      if (sql.includes('FROM canonical_projects')) {
        const value = overrides.currentStorageId === undefined ? SOURCE_STORAGE_ID : overrides.currentStorageId;
        return { rows: value ? [{ current_image_storage_id: value }] : [] };
      }
      if (sql.includes('FROM canonical_garments')) {
        const value = overrides.currentPrimaryViewId === undefined ? PRIMARY_VIEW_ID : overrides.currentPrimaryViewId;
        return { rows: value ? [{ primary_view_id: value }] : [] };
      }
      if (sql.includes('FROM canonical_project_body_anchor_sets')) return { rows: anchorRows };
      throw new Error(`Unexpected SQL in readiness test: ${sql}`);
    },
  };
  const deps: FashionTryOnReadinessDependencies = {
    pool: pool as any,
    artifacts: {
      async resolveStoredImageEvidence() { return source; },
    },
    wardrobe: {
      async get() {
        return Object.freeze({
          garmentId: GARMENT_ID,
          name: 'Jacket',
          category: (overrides.category ?? 'jackets') as any,
          categoryGroup: 'tops',
          season: 'all_season',
          material: '',
          tags: Object.freeze([]),
          favorite: false,
          status: overrides.garmentStatus ?? 'ACTIVE',
          revision: 1,
          updatedAt: '2026-08-31T20:00:00.000Z',
        });
      },
    },
    representations: {
      async list() { return overrides.representations ?? [representation() as any]; },
    },
    bodyAnchors: {
      async deriveDestinationMesh(_scope, projectId, anchorSetId, garmentId, representationId) {
        deriveCalls += 1;
        assert.equal(projectId, PROJECT_ID);
        assert.equal(anchorSetId, ANCHOR_SET_ID);
        assert.equal(garmentId, GARMENT_ID);
        assert.equal(representationId, REPRESENTATION_ID);
        if (overrides.deriveError) throw overrides.deriveError;
        return Object.freeze({
          pointsQ16: Object.freeze([[0, 0], [65536, 0], [0, 65536]]),
          triangles: Object.freeze([[0, 1, 2]]),
          outputWidth: 256,
          outputHeight: 384,
          sha256: 'c'.repeat(64),
          provenance: Object.freeze({ anchorSetId: ANCHOR_SET_ID }),
        }) as any;
      },
    },
  };
  return {
    service: new FashionTryOnReadinessService(deps),
    source,
    queries,
    deriveCalls: () => deriveCalls,
  };
}

test('F4b.6 readiness resolves server-owned representation and sequence-selected anchor evidence but public check does not expose their IDs', async () => {
  const harness = createHarness();
  const resolution = await harness.service.resolve(COMMAND, AUTH as any);
  assert.equal(resolution.status, 'READY');
  if (resolution.status !== 'READY') throw new Error('expected READY');
  assert.equal(resolution.representationId, REPRESENTATION_ID);
  assert.equal(resolution.anchorSetId, ANCHOR_SET_ID);
  assert.equal(resolution.source.storageId, SOURCE_STORAGE_ID);
  assert.equal(harness.deriveCalls(), 1);

  const publicReadiness = await harness.service.check(COMMAND, AUTH as any);
  assert.equal(publicReadiness.status, 'READY');
  assert.equal(publicReadiness.categoryGroup, 'tops');
  assert.equal(Object.hasOwn(publicReadiness, 'representationId'), false);
  assert.equal(Object.hasOwn(publicReadiness, 'anchorSetId'), false);
  assert.equal(Object.hasOwn(publicReadiness, 'source'), false);

  const garmentQuery = (harness.queries as any[]).find(value => value.sql.includes('FROM canonical_garments'));
  assert.deepEqual(garmentQuery.params, [GARMENT_ID, 'tenant-a', 'user-a']);
  assert.match(garmentQuery.sql, /primary_view_id/);

  const anchorQuery = (harness.queries as any[]).find(value => value.sql.includes('canonical_project_body_anchor_sets'));
  assert.deepEqual(anchorQuery.params, [PROJECT_ID, 'tenant-a', 'user-a', SOURCE_STORAGE_ID, SOURCE_SHA, 256, 384]);
  assert.match(anchorQuery.sql, /acquisition_sequence::text AS acquisition_sequence/);
  assert.match(anchorQuery.sql, /ORDER BY canonical_project_body_anchor_sets\.acquisition_sequence DESC, anchor_set_id/);
  assert.doesNotMatch(anchorQuery.sql, /ORDER BY acquisition_sequence DESC/);
  assert.doesNotMatch(anchorQuery.sql, /created_at/);
});

test('F4b.6 readiness rejects a signed historical source before selecting execution evidence', async () => {
  const harness = createHarness({ currentStorageId: '77777777-7777-4777-8777-777777777777' });
  const result = await harness.service.resolve(COMMAND, AUTH as any);
  assert.equal(result.status, 'STALE_SOURCE');
  assert.equal(harness.deriveCalls(), 0);
});

test('F4b.6 readiness fails closed when no admitted PARAMETRIC representation exists', async () => {
  const harness = createHarness({ representations: [representation({ admissionState: 'REVOKED', revokedAt: '2026-08-31T20:02:00.000Z' })] });
  const result = await harness.service.resolve(COMMAND, AUTH as any);
  assert.equal(result.status, 'REPRESENTATION_REQUIRED');
  assert.equal(harness.deriveCalls(), 0);
});

test('F4b.6 readiness requires PARAMETRIC evidence bound to the current Garment primary view', async () => {
  const harness = createHarness({
    representations: [representation({ basisViewId: '77777777-7777-4777-8777-777777777777' })],
  });
  const result = await harness.service.resolve(COMMAND, AUTH as any);
  assert.equal(result.status, 'REPRESENTATION_REQUIRED');
  assert.equal(harness.deriveCalls(), 0);
});

test('F4b.6 readiness fails closed when current Garment primary authority is unavailable', async () => {
  const harness = createHarness({ currentPrimaryViewId: null });
  const result = await harness.service.resolve(COMMAND, AUTH as any);
  assert.equal(result.status, 'GARMENT_UNAVAILABLE');
  assert.equal(harness.deriveCalls(), 0);
});

test('F4b.6 readiness refuses representation selection when newest admission time is ambiguous', async () => {
  const harness = createHarness({
    representations: [
      representation(),
      representation({ id: '88888888-8888-4888-8888-888888888888' }),
    ],
  });
  const result = await harness.service.resolve(COMMAND, AUTH as any);
  assert.equal(result.status, 'REPRESENTATION_AMBIGUOUS');
  assert.equal(harness.deriveCalls(), 0);
});

test('F4b.6 readiness does not pretend unsupported accessory geometry is executable', async () => {
  const harness = createHarness({ category: 'bags' });
  const result = await harness.service.resolve(COMMAND, AUTH as any);
  assert.equal(result.status, 'GARMENT_UNSUPPORTED');
  assert.equal(result.categoryGroup, 'accessories');
  assert.equal(harness.deriveCalls(), 0);
});

test('F4b.6 readiness uses DB-owned acquisition sequence instead of timestamp for current-source body anchors', async () => {
  const harness = createHarness({
    anchors: [
      { anchor_set_id: ANCHOR_SET_ID, acquisition_sequence: '42', created_at_text: '2026-08-31 20:01:00+00' },
      { anchor_set_id: '99999999-9999-4999-8999-999999999999', acquisition_sequence: '41', created_at_text: '2026-08-31 20:01:00+00' },
    ],
  });
  const result = await harness.service.resolve(COMMAND, AUTH as any);
  assert.equal(result.status, 'READY');
  if (result.status !== 'READY') throw new Error('expected sequence-selected READY');
  assert.equal(result.anchorSetId, ANCHOR_SET_ID);
  assert.equal(harness.deriveCalls(), 1);
});

test('F4b.6 readiness reports missing anchors and fails closed on impossible duplicate newest acquisition sequence', async () => {
  const missing = createHarness({ anchors: [] });
  assert.equal((await missing.service.check(COMMAND, AUTH as any)).status, 'BODY_ANCHORS_REQUIRED');
  assert.equal(missing.deriveCalls(), 0);

  const ambiguous = createHarness({
    anchors: [
      { anchor_set_id: ANCHOR_SET_ID, acquisition_sequence: '42' },
      { anchor_set_id: '99999999-9999-4999-8999-999999999999', acquisition_sequence: '42' },
    ],
  });
  assert.equal((await ambiguous.service.check(COMMAND, AUTH as any)).status, 'BODY_ANCHORS_AMBIGUOUS');
  assert.equal(ambiguous.deriveCalls(), 0);
});

test('F4b.6 readiness never falls back to an older acquisition when newest body-anchor evidence fails revalidation', async () => {
  const harness = createHarness({
    anchors: [
      { anchor_set_id: ANCHOR_SET_ID, acquisition_sequence: '42' },
      { anchor_set_id: '99999999-9999-4999-8999-999999999999', acquisition_sequence: '41' },
    ],
    deriveError: Object.assign(new Error('tampered newest acquisition'), { code: 'body_anchor_integrity_mismatch' }),
  });
  const result = await harness.service.resolve(COMMAND, AUTH as any);
  assert.equal(result.status, 'EVIDENCE_INVALID');
  assert.equal(harness.deriveCalls(), 1);
});

test('F4b.6 readiness reuses body-anchor authority and maps evidence races fail-closed', async () => {
  const stale = createHarness({ deriveError: Object.assign(new Error('stale'), { code: 'body_anchor_project_evidence_stale' }) });
  assert.equal((await stale.service.resolve(COMMAND, AUTH as any)).status, 'STALE_SOURCE');

  const representationLost = createHarness({ deriveError: Object.assign(new Error('rep'), { code: 'body_anchor_garment_representation_stale' }) });
  assert.equal((await representationLost.service.resolve(COMMAND, AUTH as any)).status, 'REPRESENTATION_REQUIRED');

  const invalid = createHarness({ deriveError: Object.assign(new Error('tampered'), { code: 'body_anchor_integrity_mismatch' }) });
  assert.equal((await invalid.service.resolve(COMMAND, AUTH as any)).status, 'EVIDENCE_INVALID');
});

test('F4b.6 readiness request identity is closed and bounded', async () => {
  const harness = createHarness();
  await assert.rejects(
    () => harness.service.check({ ...COMMAND, garmentId: 'not-a-uuid' }, AUTH as any),
    (error: any) => error?.status === 400 && error?.code === 'invalid_fashion_tryon_readiness_request',
  );
  await assert.rejects(
    () => harness.service.check({ ...COMMAND, sourceArtifactId: 'bad\nsource' }, AUTH as any),
    (error: any) => error?.status === 400 && error?.code === 'invalid_fashion_tryon_readiness_request',
  );
});
