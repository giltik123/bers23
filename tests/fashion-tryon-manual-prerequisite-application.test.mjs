import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CanonicalTryOnManualContourReloadError,
  createCanonicalTryOnManualPrerequisiteApplication,
} from '../src/application/fashion/createCanonicalTryOnManualPrerequisiteApplication.js';

const GARMENT = 'aaaaaaaa-1111-4111-8111-111111111111';
const PROJECT = 'bbbbbbbb-2222-4222-8222-222222222222';
const VIEW = 'cccccccc-3333-4333-8333-333333333333';

function image(revision = 7, overrides = {}) {
  return {
    id: GARMENT,
    name: 'Jacket',
    revision,
    status: 'ACTIVE',
    primaryViewId: VIEW,
    representationTier: 'BASIC',
    views: [{
      id: VIEW,
      deliveryUrl: '/api/core/garments/delivery/capability-token',
      deliveryExpiresAt: '2026-09-04T05:00:00.000Z',
      contentSha256: 'a'.repeat(64),
      storageProvenance: 'POSTGRES_BYTEA_V1',
    }],
    ...overrides,
  };
}
function metadata(revision = 7, overrides = {}) {
  return { garmentId: GARMENT, name: 'Jacket', revision, status: 'ACTIVE', category: 'jackets', ...overrides };
}
function fixture({ images = [image()], metadataRows = [metadata()], garmentError = null, wardrobeError = null } = {}) {
  const calls = [];
  let imageIndex = 0;
  let metadataIndex = 0;
  const app = createCanonicalTryOnManualPrerequisiteApplication({
    garments: { get: async (id) => {
      calls.push(['garments.get', id]);
      if (garmentError) throw garmentError;
      return images[Math.min(imageIndex++, images.length - 1)];
    } },
    wardrobe: { get: async (id) => {
      calls.push(['wardrobe.get', id]);
      if (wardrobeError) throw wardrobeError;
      return metadataRows[Math.min(metadataIndex++, metadataRows.length - 1)];
    } },
    fashion: {
      admitManualParametricRepresentation: async (id, payload) => {
        calls.push(['contour', id, payload]);
        return { representationId: 'must-not-escape', representationContentSha256: 'f'.repeat(64) };
      },
      acquireManualBodyAnchors: async (projectId, payload) => {
        calls.push(['anchors', projectId, payload]);
        return { anchorSetId: 'must-not-escape', payloadSha256: 'e'.repeat(64), destinationMesh: {} };
      },
    },
  });
  return { app, calls };
}

test('primary Garment source projection drops view/storage/hash authority', async () => {
  const { app, calls } = fixture();
  const value = await app.loadGarmentSource(GARMENT.toUpperCase());
  assert.deepEqual(value, {
    garmentId: GARMENT,
    expectedRevision: 7,
    category: 'jackets',
    imageUrl: '/api/core/garments/delivery/capability-token',
    imageExpiresAt: '2026-09-04T05:00:00.000Z',
  });
  assert.deepEqual(calls, [['garments.get', GARMENT], ['wardrobe.get', GARMENT]]);
  const serialized = JSON.stringify(value);
  for (const forbidden of ['primaryViewId','viewId','contentSha256','storageProvenance','representationId','anchorSetId']) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test('contour save uses accepted intent shaper, discards admission evidence and reloads fresh coherent source', async () => {
  const { app, calls } = fixture({ images: [image(8)], metadataRows: [metadata(8)] });
  const result = await app.saveContour({
    garmentId: GARMENT,
    expectedRevision: 7,
    points: [[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]],
  });
  const admission = calls.find((call) => call[0] === 'contour');
  assert.equal(admission[1], GARMENT);
  assert.deepEqual(admission[2], {
    expectedRevision: 7,
    contour: {
      schemaVersion: 1,
      coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
      contour: [[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]],
    },
  });
  assert.equal(result.expectedRevision, 8);
  assert.equal(JSON.stringify(result).includes('representationId'), false);
  assert.equal(calls.filter((call) => call[0] === 'garments.get').length, 1);
  assert.equal(calls.filter((call) => call[0] === 'wardrobe.get').length, 1);
});

test('successful contour admission plus failed reload is explicit non-retryable reload-pending outcome', async () => {
  const cause = new Error('reload unavailable');
  const { app, calls } = fixture({ garmentError: cause });
  await assert.rejects(
    () => app.saveContour({
      garmentId: GARMENT,
      expectedRevision: 7,
      points: [[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]],
    }),
    (error) => {
      assert.ok(error instanceof CanonicalTryOnManualContourReloadError);
      assert.equal(error.code, 'TRYON_MANUAL_CONTOUR_SAVED_RELOAD_PENDING');
      assert.equal(error.garmentId, GARMENT);
      assert.equal(error.expectedRevision, 7);
      assert.equal(error.retryable, false);
      assert.equal(error.requiresReload, true);
      assert.equal(error.cause, cause);
      return true;
    },
  );
  assert.equal(calls.filter((call) => call[0] === 'contour').length, 1);
  assert.equal(calls.filter((call) => call[0] === 'garments.get').length, 1);
});

test('body-anchor save sends only stable Project source and explicit points, then drops Core evidence', async () => {
  const { app, calls } = fixture();
  const result = await app.saveBodyAnchors({
    projectId: PROJECT.toUpperCase(),
    sourceArtifactId: ' source-artifact ',
    anchors: {
      leftShoulder: [0.3, 0.2], rightShoulder: [0.7, 0.2],
      leftHip: [0.4, 0.7], rightHip: [0.6, 0.7],
    },
  });
  assert.deepEqual(result, { status: 'SAVED' });
  const call = calls.find((entry) => entry[0] === 'anchors');
  assert.equal(call[1], PROJECT);
  assert.deepEqual(call[2], {
    sourceArtifactId: 'source-artifact',
    payload: {
      schemaVersion: 1,
      coordinateSpace: 'PROJECT_IMAGE_NORMALIZED',
      anchors: {
        leftShoulder: [0.3, 0.2], rightShoulder: [0.7, 0.2],
        leftHip: [0.4, 0.7], rightHip: [0.6, 0.7],
      },
    },
  });
  assert.equal(JSON.stringify(result).includes('anchorSetId'), false);
  assert.equal(JSON.stringify(result).includes('payloadSha256'), false);
});

test('source projection fails closed on split revision, inactive garment, ambiguous primary view, foreign delivery and noncanonical expiry/category', async () => {
  await assert.rejects(() => fixture({ metadataRows: [metadata(8)] }).app.loadGarmentSource(GARMENT), /coherent revision/);
  await assert.rejects(() => fixture({ images: [image(7, { status: 'ARCHIVED' })], metadataRows: [metadata(7, { status: 'ARCHIVED' })] }).app.loadGarmentSource(GARMENT), /active managed Garment/);
  await assert.rejects(() => fixture({ images: [image(7, { views: [image().views[0], { ...image().views[0] }] })] }).app.loadGarmentSource(GARMENT), /ambiguous or unavailable/);
  await assert.rejects(() => fixture({ images: [image(7, { views: [{ ...image().views[0], deliveryUrl: 'https://evil.example/view.png' }] })] }).app.loadGarmentSource(GARMENT), /delivery is outside/);
  await assert.rejects(() => fixture({ images: [image(7, { views: [{ ...image().views[0], deliveryExpiresAt: '2026-09-04 05:00:00Z' }] })] }).app.loadGarmentSource(GARMENT), /expiry is invalid/);
  await assert.rejects(() => fixture({ metadataRows: [metadata(7, { category: 'invented' })] }).app.loadGarmentSource(GARMENT), /canonical taxonomy/);
});

test('manual save schemas reject authority-shaped extras before Core calls', async () => {
  const { app, calls } = fixture();
  await assert.rejects(() => app.saveContour({ garmentId: GARMENT, expectedRevision: 7, points: [[0,0],[1,0],[0,1]], representationId: 'forbidden' }), /unknown or missing fields/);
  await assert.rejects(() => app.saveBodyAnchors({ projectId: PROJECT, sourceArtifactId: 'source', anchors: { leftShoulder:[0,0],rightShoulder:[1,0],leftHip:[0,1],rightHip:[1,1] }, anchorSetId: 'forbidden' }), /unknown or missing fields/);
  assert.equal(calls.length, 0);
});
