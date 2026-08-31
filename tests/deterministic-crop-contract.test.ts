import assert from 'node:assert/strict';
import test from 'node:test';
import './deterministic-crop-workflow-verifier.test.ts';
import { CROP_CAPABILITY, CROP_TOOL_ID, CROP_TOOL_VERSION, cropRgba8, normalizeCropRect } from '../src/platform/creative/deterministic/Crop.ts';
import { RESIZE_CAPABILITY } from '../src/platform/creative/deterministic/Resize.ts';
import { ORTHOGONAL_TRANSFORM_CAPABILITY } from '../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { GARMENT_MESH_WARP_CAPABILITY } from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { CROP_TOOL_DEFINITION, DETERMINISTIC_TOOL_REGISTRY, GARMENT_MESH_WARP_TOOL_DEFINITION, ORTHOGONAL_TRANSFORM_TOOL_DEFINITION, RESIZE_TOOL_DEFINITION, requireDeterministicToolByCapability, requireDeterministicToolByExecutor } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const source = new Uint8ClampedArray([
  1, 2, 3, 0,     11, 12, 13, 1,    21, 22, 23, 255,  31, 32, 33, 17,
  41, 42, 43, 64,  51, 52, 53, 127,  61, 62, 63, 128,  71, 72, 73, 200,
  81, 82, 83, 254, 91, 92, 93, 255, 101,102,103, 0,   111,112,113, 33,
]);

test('Crop v1 copies the exact half-open RGBA8 sub-rectangle including transparent RGB bytes', () => {
  const rect = normalizeCropRect({ x: 1, y: 1, width: 2, height: 2 }, 4, 3);
  assert.deepEqual(rect, { x: 1, y: 1, width: 2, height: 2 });
  assert.deepEqual([...cropRgba8(source, 4, 3, rect)], [
    51,52,53,127, 61,62,63,128,
    91,92,93,255, 101,102,103,0,
  ]);
});

test('Crop v1 rejects fractional, empty, negative and out-of-bounds rectangles without clamping', () => {
  const invalid = [
    { x: .5, y: 0, width: 1, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 },
    { x: -1, y: 0, width: 1, height: 1 },
    { x: 4, y: 0, width: 1, height: 1 },
    { x: 3, y: 2, width: 2, height: 1 },
    { x: 0, y: 2, width: 1, height: 2 },
  ];
  for (const rect of invalid) assert.throws(() => normalizeCropRect(rect, 4, 3));
  assert.throws(() => cropRgba8(source.subarray(0, source.length - 1), 4, 3, { x: 0, y: 0, width: 1, height: 1 }), /RGBA length/);
});

test('Crop registry contract is immutable data and production executor admission stays explicit', () => {
  assert.equal(DETERMINISTIC_TOOL_REGISTRY.length, 5, 'Background Isolation, Crop, Resize, Orthogonal Transform and Garment Mesh Warp are the reviewed deterministic tools');
  assert.equal(requireDeterministicToolByCapability(CROP_CAPABILITY), CROP_TOOL_DEFINITION);
  assert.equal(requireDeterministicToolByExecutor({ kind: 'DETERMINISTIC_TOOL', toolId: CROP_TOOL_ID, version: CROP_TOOL_VERSION }), CROP_TOOL_DEFINITION);
  assert.equal(requireDeterministicToolByCapability(RESIZE_CAPABILITY), RESIZE_TOOL_DEFINITION, 'adding Resize must not weaken Crop identity or registry lookup');
  assert.equal(requireDeterministicToolByCapability(ORTHOGONAL_TRANSFORM_CAPABILITY), ORTHOGONAL_TRANSFORM_TOOL_DEFINITION, 'adding Orthogonal Transform must not weaken Crop identity or registry lookup');
  assert.equal(requireDeterministicToolByCapability(GARMENT_MESH_WARP_CAPABILITY), GARMENT_MESH_WARP_TOOL_DEFINITION, 'adding Garment Mesh Warp must not weaken Crop identity or registry lookup');
  assert.deepEqual(CROP_TOOL_DEFINITION.operation, { id: 'crop', type: 'CROP', version: '1' });
  assert.deepEqual(CROP_TOOL_DEFINITION.executor, { kind: 'DETERMINISTIC_TOOL', toolId: 'crop', version: '1' });
  assert.deepEqual(CROP_TOOL_DEFINITION.inputs, [{ name: 'source', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' }]);
  assert.deepEqual(CROP_TOOL_DEFINITION.output, { kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: ['image/png'], geometry: 'CROP_RECT' });
  assert.equal(CROP_TOOL_DEFINITION.parameters.exact.coordinateSpace, 'CANONICAL_ORIENTATION_1_PIXEL_INDICES');
  assert.equal(CROP_TOOL_DEFINITION.parameters.exact.rectangleSemantics, 'HALF_OPEN');
  assert.deepEqual(CROP_TOOL_DEFINITION.parameters.relationships, ['X_PLUS_WIDTH_LE_SOURCE_WIDTH', 'Y_PLUS_HEIGHT_LE_SOURCE_HEIGHT']);
  assert.deepEqual(CROP_TOOL_DEFINITION.pixelContract, {
    format: 'RGBA8', colorSpace: 'srgb', orientation: 1,
    rgb: 'COPY_SOURCE_SUBRECT_BYTES', alpha: 'COPY_SOURCE_ALPHA_BYTES',
    interpolation: 'NONE', rounding: 'INTEGER_EXACT', border: 'REJECT_OUT_OF_BOUNDS',
  });
  assert.deepEqual(CROP_TOOL_DEFINITION.lineage, { parentInputs: ['source'], finalRole: 'COMPOSITE', producerOperation: 'CROP' });
  assert.equal(containsFunction(CROP_TOOL_DEFINITION), false);
  assert.equal(isDeepFrozen(CROP_TOOL_DEFINITION), true);
  assert.deepEqual(productionLocalExecutorsByCapability[CROP_CAPABILITY], [CROP_TOOL_DEFINITION.executor]);
  assert.deepEqual(productionLocalExecutorsByCapability[RESIZE_CAPABILITY], [RESIZE_TOOL_DEFINITION.executor]);
  assert.deepEqual(productionLocalExecutorsByCapability[ORTHOGONAL_TRANSFORM_CAPABILITY], [ORTHOGONAL_TRANSFORM_TOOL_DEFINITION.executor]);
  assert.deepEqual(productionLocalExecutorsByCapability[GARMENT_MESH_WARP_CAPABILITY], [GARMENT_MESH_WARP_TOOL_DEFINITION.executor]);
  assert.throws(() => requireDeterministicToolByCapability('local:tool:unknown:v1'), /not registered/);
});

function containsFunction(value: unknown): boolean {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some(containsFunction);
}
function isDeepFrozen(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}
