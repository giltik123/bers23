import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const helper = fs.readFileSync(new URL('../src/application/fashion/canonicalTryOnManualAcquisition.js', import.meta.url), 'utf8');
const contour = fs.readFileSync(new URL('../server/core/fashion/manualParametricContour.ts', import.meta.url), 'utf8');
const contourHttp = fs.readFileSync(new URL('../server/core/http/manualParametricGarmentAdmissionHttpAdapter.ts', import.meta.url), 'utf8');
const anchors = fs.readFileSync(new URL('../server/core/fashion/bodyAnchorGeometry.ts', import.meta.url), 'utf8');
const anchorsHttp = fs.readFileSync(new URL('../server/core/http/manualProjectBodyAnchorHttpAdapter.ts', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/api/coreClient.js', import.meta.url), 'utf8');

test('browser helper stays aligned with accepted manual PARAMETRIC transport/schema constants', () => {
  assert.match(contour, /MANUAL_PARAMETRIC_CONTOUR_MAX_POINTS = 256/);
  assert.match(contour, /COORDINATE_SPACE = 'PRIMARY_VIEW_NORMALIZED'/);
  assert.match(contourHttp, /BODY_KEYS = Object\.freeze\(\['contour', 'expectedRevision'\]/);
  assert.match(helper, /MANUAL_PARAMETRIC_MAX_POINTS = 256/);
  assert.match(helper, /MANUAL_PARAMETRIC_COORDINATE_SPACE = 'PRIMARY_VIEW_NORMALIZED'/);
  assert.match(helper, /expectedRevision,[\s\S]*contour:/);
  assert.match(client, /admitManualParametricRepresentation:/);
});

test('browser helper stays aligned with accepted body-anchor names, frames and transport', () => {
  for (const name of ['leftShoulder','rightShoulder','leftWaist','rightWaist','leftHip','rightHip','leftAnkle','rightAnkle','leftToe','rightToe']) {
    assert.ok(anchors.includes(`'${name}'`), `server must retain ${name}`);
    assert.ok(helper.includes(`'${name}'`), `browser helper must retain ${name}`);
  }
  for (const frame of [
    "['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip']",
    "['leftWaist', 'rightWaist', 'leftAnkle', 'rightAnkle']",
    "['leftShoulder', 'rightShoulder', 'leftAnkle', 'rightAnkle']",
    "['leftAnkle', 'rightAnkle', 'leftToe', 'rightToe']",
  ]) {
    assert.ok(anchors.includes(frame));
    assert.ok(helper.includes(frame));
  }
  assert.match(anchors, /BODY_ANCHOR_COORDINATE_SPACE = 'PROJECT_IMAGE_NORMALIZED'/);
  assert.match(anchorsHttp, /BODY_KEYS = Object\.freeze\(\['payload', 'sourceArtifactId'\]/);
  assert.match(helper, /BODY_ANCHOR_COORDINATE_SPACE = 'PROJECT_IMAGE_NORMALIZED'/);
  assert.match(client, /acquireManualBodyAnchors:/);
});

test('helper intentionally does not duplicate authoritative polygon or destination geometry', () => {
  assert.match(contour, /assertSimplePolygon/);
  assert.match(contour, /triangulateCanonicalPolygon/);
  assert.match(anchors, /deriveDestinationGarmentMesh/);
  assert.doesNotMatch(
    helper,
    /assertSimplePolygon|triangulateCanonicalPolygon|deriveDestinationGarmentMesh|GARMENT_MESH_WARP_FIXED_POINT_ONE|quantizeNormalizedGarmentMeshPoints|meshSha256/,
  );
});

test('manual acquisition browser intent cannot carry server evidence authority', () => {
  for (const forbidden of [
    'representationId', 'representationContentSha256', 'anchorSetId', 'payloadSha256',
    'projectImageStorageId', 'projectImageSha256', 'destinationMesh', 'storageId',
    'producerId', 'validatorId', 'admissionState', 'ticketId', 'executionId',
    'fetch(', 'coreClient.entities', 'FASHN', 'billing', 'credits',
  ]) {
    assert.equal(helper.includes(forbidden), false, `manual acquisition helper must not contain ${forbidden}`);
  }
});

test('mapped error codes are all backed by existing Core geometry source', () => {
  const mapped = [...helper.matchAll(/^\s{4}([a-z0-9_]+): '/gm)].map((match) => match[1]);
  const source = `${contour}\n${anchors}`;
  assert.ok(mapped.length > 0);
  for (const code of mapped) assert.ok(source.includes(`'${code}'`), `mapped code ${code} must exist in Core source`);
});
