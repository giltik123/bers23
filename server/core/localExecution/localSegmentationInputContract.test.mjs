import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LocalSegmentationContractError,
  normalizeLocalSegmentationSelection,
  validateLocalSegmentationGeometry,
} from './localSegmentationInputContract.ts';

const analysis = Object.freeze({
  originalWidth: 4,
  originalHeight: 3,
  analysisWidth: 4,
  analysisHeight: 3,
  scaleX: 1,
  scaleY: 1,
  offsetX: 0,
  offsetY: 0,
});
const points = Object.freeze([
  Object.freeze({ x: 0, y: 0, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' }),
  Object.freeze({ x: 3, y: 2, label: 'NEGATIVE', coordinateSpace: 'ORIGINAL' }),
]);

test('shared local segmentation contract normalizes one exact immutable selection for standalone and composite callers', () => {
  const normalized = normalizeLocalSegmentationSelection(analysis, points);
  assert.deepEqual(normalized.analysis, analysis);
  assert.deepEqual(normalized.points, points);
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.analysis), true);
  assert.equal(Object.isFrozen(normalized.points), true);
  validateLocalSegmentationGeometry(normalized.analysis, normalized.points, 4, 3);
});

test('shared local segmentation contract accepts only rounding-safe scale drift', () => {
  const roundedUniformScale = Object.freeze({
    originalWidth: 333,
    originalHeight: 1000,
    analysisWidth: 85,
    analysisHeight: 256,
    scaleX: 0.256,
    scaleY: 0.256,
    offsetX: 0,
    offsetY: 0,
  });
  validateLocalSegmentationGeometry(
    roundedUniformScale,
    [{ x: 332, y: 999, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' }],
    333,
    1000,
  );

  assert.throws(
    () => validateLocalSegmentationGeometry({ ...analysis, analysisWidth: 2, scaleX: 1 }, points, 4, 3),
    error => error instanceof LocalSegmentationContractError && error.reason === 'ANALYSIS_INVALID',
  );
});

test('shared local segmentation contract fails closed on malformed and out-of-bounds selections', () => {
  assert.throws(
    () => normalizeLocalSegmentationSelection(analysis, []),
    error => error instanceof LocalSegmentationContractError && error.reason === 'POINTS_INVALID',
  );
  assert.throws(
    () => normalizeLocalSegmentationSelection({ ...analysis, scaleX: Number.NaN }, points),
    error => error instanceof LocalSegmentationContractError && error.reason === 'ANALYSIS_INVALID',
  );
  assert.throws(
    () => validateLocalSegmentationGeometry(analysis, points, 5, 3),
    error => error instanceof LocalSegmentationContractError && error.reason === 'SOURCE_MISMATCH',
  );
  assert.throws(
    () => validateLocalSegmentationGeometry(analysis, [{ x: 4, y: 1, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' }], 4, 3),
    error => error instanceof LocalSegmentationContractError && error.reason === 'POINT_OUT_OF_BOUNDS',
  );
});
