import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BODY_ANCHOR_NAMES,
  buildManualBodyAnchorAcquisitionIntent,
  buildManualParametricAdmissionIntent,
  deterministicTryOnSupportedCategory,
  manualAcquisitionErrorMessage,
  missingRequiredBodyAnchors,
  requiredBodyAnchorsForCategory,
} from '../src/application/fashion/canonicalTryOnManualAcquisition.js';

test('manual PARAMETRIC intent uses only revision and closed normalized contour schema', () => {
  const intent = buildManualParametricAdmissionIntent({
    expectedRevision: 7,
    points: [[0.1, 0.2], [0.8, 0.2], [0.7, 0.9], [0.2, 0.8]],
  });
  assert.deepEqual(intent, {
    expectedRevision: 7,
    contour: {
      schemaVersion: 1,
      coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
      contour: [[0.1, 0.2], [0.8, 0.2], [0.7, 0.9], [0.2, 0.8]],
    },
  });
  assert.ok(Object.isFrozen(intent));
  assert.ok(Object.isFrozen(intent.contour.contour));
});

test('manual contour preflight rejects malformed/out-of-image/duplicate points but leaves full geometry to Core', () => {
  assert.throws(() => buildManualParametricAdmissionIntent({ expectedRevision: 0, points: [[0,0],[1,0],[1,1]] }), /positive safe integer/);
  assert.throws(() => buildManualParametricAdmissionIntent({ expectedRevision: 1, points: [[0,0],[1,0]] }), /3 to 256/);
  assert.throws(() => buildManualParametricAdmissionIntent({ expectedRevision: 1, points: [[0,0],[1.1,0],[1,1]] }), /normalized image/);
  assert.throws(() => buildManualParametricAdmissionIntent({ expectedRevision: 1, points: [[0,0],[1,0],[0,0]] }), /duplicate points/);
});

test('body-anchor intent contains only sourceArtifactId and explicit BERS_BODY_ANCHORS_V1 points', () => {
  const intent = buildManualBodyAnchorAcquisitionIntent({
    sourceArtifactId: ' current-project-artifact ',
    anchors: {
      leftShoulder: [0.2, 0.15], rightShoulder: [0.8, 0.15],
      leftHip: [0.28, 0.75], rightHip: [0.72, 0.75],
    },
  });
  assert.deepEqual(intent, {
    sourceArtifactId: 'current-project-artifact',
    payload: {
      schemaVersion: 1,
      coordinateSpace: 'PROJECT_IMAGE_NORMALIZED',
      anchors: {
        leftShoulder: [0.2, 0.15], rightShoulder: [0.8, 0.15],
        leftHip: [0.28, 0.75], rightHip: [0.72, 0.75],
      },
    },
  });
});

test('body-anchor preflight rejects unknown names, too few points and escaped coordinates', () => {
  const four = {
    leftShoulder: [0.2, 0.15], rightShoulder: [0.8, 0.15],
    leftHip: [0.28, 0.75], rightHip: [0.72, 0.75],
  };
  assert.throws(() => buildManualBodyAnchorAcquisitionIntent({ sourceArtifactId: 'a', anchors: { leftShoulder: [0,0] } }), /4 to 10/);
  assert.throws(() => buildManualBodyAnchorAcquisitionIntent({ sourceArtifactId: 'a', anchors: { ...four, inventedAnchor: [0.5,0.5] } }), /known names/);
  assert.throws(() => buildManualBodyAnchorAcquisitionIntent({ sourceArtifactId: 'a', anchors: { ...four, leftHip: [-0.1,0.5] } }), /normalized image/);
  assert.equal(BODY_ANCHOR_NAMES.length, 10);
});

test('required anchor guidance follows deterministic category frames exactly', () => {
  assert.deepEqual(requiredBodyAnchorsForCategory('shirts'), ['leftShoulder','rightShoulder','leftHip','rightHip']);
  assert.deepEqual(requiredBodyAnchorsForCategory('pants'), ['leftWaist','rightWaist','leftAnkle','rightAnkle']);
  assert.deepEqual(requiredBodyAnchorsForCategory('dresses'), ['leftShoulder','rightShoulder','leftAnkle','rightAnkle']);
  assert.deepEqual(requiredBodyAnchorsForCategory('sneakers'), ['leftAnkle','rightAnkle','leftToe','rightToe']);
  assert.deepEqual(requiredBodyAnchorsForCategory('hats'), []);
  assert.equal(deterministicTryOnSupportedCategory('hats'), false);
  assert.equal(deterministicTryOnSupportedCategory('hoodies'), true);
  assert.deepEqual(missingRequiredBodyAnchors('shirts', { leftShoulder: [0.1,0.1] }), ['rightShoulder','leftHip','rightHip']);
});

test('known Core acquisition errors map to actionable copy and unknown errors remain visible', () => {
  assert.match(manualAcquisitionErrorMessage({ code: 'manual_parametric_self_intersection' }), /crosses itself/);
  assert.match(manualAcquisitionErrorMessage({ code: 'body_anchor_destination_geometry_invalid' }), /invert or collapse/);
  assert.equal(manualAcquisitionErrorMessage({ code: 'future_core_code', message: 'Exact Core explanation' }), 'Exact Core explanation');
  assert.equal(manualAcquisitionErrorMessage({ code: 'future_core_code' }), 'Try-On acquisition failed (future_core_code).');
});
