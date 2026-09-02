import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MANUAL_PARAMETRIC_CONTOUR_MAX_POINTS,
  MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID,
  MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION,
  canonicalManualParametricRepresentationBytes,
  produceManualParametricRepresentation,
} from '../server/core/fashion/manualParametricContour.ts';
import { quantizeNormalizedGarmentMeshPoints } from '../src/platform/creative/deterministic/GarmentMeshWarp.ts';

const input = (contour: readonly (readonly [number, number])[]) => Object.freeze({
  schemaVersion: 1 as const,
  coordinateSpace: 'PRIMARY_VIEW_NORMALIZED' as const,
  contour: Object.freeze(contour.map(point => Object.freeze([...point] as const))),
});

const square = input([
  [0.1, 0.1],
  [0.9, 0.1],
  [0.9, 0.9],
  [0.1, 0.9],
]);

const concave = input([
  [0.1, 0.1],
  [0.9, 0.1],
  [0.9, 0.9],
  [0.5, 0.5],
  [0.1, 0.9],
]);

test('F4b.6c.1 manual PARAMETRIC producer has fixed provenance identity and exact square reference bytes', () => {
  assert.equal(MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID, 'bers.manual-parametric-contour');
  assert.equal(MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION, '1');
  const bytes = canonicalManualParametricRepresentationBytes(square);
  assert.equal(
    new TextDecoder().decode(bytes),
    '{"schemaVersion":1,"coordinateSpace":"PRIMARY_VIEW_NORMALIZED","points":[[0.100006103515625,0.100006103515625],[0.899993896484375,0.100006103515625],[0.899993896484375,0.899993896484375],[0.100006103515625,0.899993896484375]],"triangles":[[3,0,1],[1,2,3]],"outline":[0,1,2,3]}',
  );
});

test('F4b.6c.1 manual PARAMETRIC producer triangulates a concave simple contour with a fixed reference vector', () => {
  const representation = produceManualParametricRepresentation(concave);
  assert.deepEqual(representation.triangles, [
    [1, 2, 3],
    [0, 1, 3],
    [0, 3, 4],
  ]);
  assert.deepEqual(representation.outline, [0, 1, 2, 3, 4]);
  assert.equal(representation.triangles.length, representation.points.length - 2);
});

test('F4b.6c.1 canonicalization removes cyclic-start and winding ambiguity byte-for-byte', () => {
  const base = canonicalManualParametricRepresentationBytes(concave);
  const rotated = canonicalManualParametricRepresentationBytes(input([
    [0.9, 0.9],
    [0.5, 0.5],
    [0.1, 0.9],
    [0.1, 0.1],
    [0.9, 0.1],
  ]));
  const reversed = canonicalManualParametricRepresentationBytes(input([
    [0.1, 0.9],
    [0.5, 0.5],
    [0.9, 0.9],
    [0.9, 0.1],
    [0.1, 0.1],
  ]));
  assert.deepEqual(rotated, base);
  assert.deepEqual(reversed, base);
});

test('F4b.6c.1 output points round-trip exactly through the accepted downstream Q16 mesh domain', () => {
  const representation = produceManualParametricRepresentation(concave);
  assert.deepEqual(quantizeNormalizedGarmentMeshPoints(representation.points), [
    [6554, 6554],
    [58982, 6554],
    [58982, 58982],
    [32768, 32768],
    [6554, 58982],
  ]);
  assert.equal(Object.isFrozen(representation), true);
  assert.equal(Object.isFrozen(representation.points), true);
  assert.equal(Object.isFrozen(representation.triangles), true);
});

test('F4b.6c.1 rejects self-intersection, repeated points and Q16-collapsed geometry rather than inventing topology', () => {
  assert.throws(
    () => produceManualParametricRepresentation(input([[0.1, 0.1], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1]])),
    (error: any) => error?.code === 'manual_parametric_self_intersection',
  );
  assert.throws(
    () => produceManualParametricRepresentation(input([[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.1]])),
    (error: any) => error?.code === 'manual_parametric_duplicate_point',
  );
  assert.throws(
    () => produceManualParametricRepresentation(input([[0.1, 0.1], [0.100000001, 0.100000001], [0.9, 0.1], [0.9, 0.9]])),
    (error: any) => error?.code === 'manual_parametric_duplicate_point',
  );
});

test('F4b.6c.1 rejects collinear vertices, unknown schema fields and hostile contour size', () => {
  assert.throws(
    () => produceManualParametricRepresentation(input([[0.1, 0.1], [0.5, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]])),
    (error: any) => error?.code === 'manual_parametric_collinear_vertex',
  );
  assert.throws(
    () => produceManualParametricRepresentation({ ...square, hiddenAuthority: true }),
    (error: any) => error?.code === 'manual_parametric_invalid_schema',
  );
  const tooMany = Array.from({ length: MANUAL_PARAMETRIC_CONTOUR_MAX_POINTS + 1 }, (_value, index) => {
    const angle = (index / (MANUAL_PARAMETRIC_CONTOUR_MAX_POINTS + 1)) * Math.PI * 2;
    return [0.5 + Math.cos(angle) * 0.4, 0.5 + Math.sin(angle) * 0.4] as const;
  });
  assert.throws(
    () => produceManualParametricRepresentation(input(tooMany)),
    (error: any) => error?.code === 'manual_parametric_invalid_contour',
  );
});
