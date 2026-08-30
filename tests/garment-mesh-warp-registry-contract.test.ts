import assert from 'node:assert/strict';
import test from 'node:test';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_PRODUCTION_ADMISSION,
  GARMENT_MESH_WARP_STEP_ID,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import {
  GARMENT_MESH_WARP_TOOL_DEFINITION,
  requireDeterministicToolByCapability,
  requireDeterministicToolByExecutor,
} from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';

test('garment mesh warp registry keeps Project lineage and managed Garment authorities distinct', () => {
  const definition = GARMENT_MESH_WARP_TOOL_DEFINITION;
  assert.equal(definition.capability, GARMENT_MESH_WARP_CAPABILITY);
  assert.deepEqual(definition.operation, { id: GARMENT_MESH_WARP_STEP_ID, type: GARMENT_MESH_WARP_OPERATION, version: GARMENT_MESH_WARP_TOOL_VERSION });
  assert.deepEqual(definition.executor, { kind: 'DETERMINISTIC_TOOL', toolId: GARMENT_MESH_WARP_TOOL_ID, version: GARMENT_MESH_WARP_TOOL_VERSION });
  assert.deepEqual(definition.inputs, [{ name: 'projectSource', kind: 'image', roles: ['ORIGINAL', 'COMPOSITE'], sha256: 'REQUIRED', geometry: 'SOURCE' }]);
  assert.deepEqual(definition.managedInputs, [
    { name: 'basisView', authority: 'MANAGED_GARMENT', kind: 'GARMENT_VIEW', sha256: 'REQUIRED', use: 'PIXEL_SOURCE', contentType: 'image/png', encoding: 'PNG_RGBA8_LOSSLESS' },
    { name: 'representation', authority: 'MANAGED_GARMENT', kind: 'GARMENT_REPRESENTATION', sha256: 'REQUIRED', use: 'GEOMETRY_AUTHORITY', contentType: 'application/vnd.bers.garment-parametric+json', tier: 'PARAMETRIC', format: 'BERS_PARAMETRIC_V1' },
  ]);
  assert.deepEqual(definition.output, { kind: 'image', role: 'WORKING', count: 1, mimeTypes: ['image/png'], geometry: 'PROJECT_SOURCE_DIMENSIONS' });
  assert.deepEqual(definition.lineage, { parentInputs: ['projectSource'], managedParents: ['basisView', 'representation'], finalRole: 'WORKING', producerOperation: GARMENT_MESH_WARP_OPERATION });
});

test('garment mesh warp registry binds exact managed identities and deterministic pixel law without granting production authority', () => {
  const definition = requireDeterministicToolByCapability(GARMENT_MESH_WARP_CAPABILITY);
  assert.equal(requireDeterministicToolByExecutor(definition.executor), definition);
  assert.deepEqual(definition.parameters.managedIdBindings, [
    { parameter: 'garmentId', input: 'basisView', field: 'garmentId' },
    { parameter: 'viewId', input: 'basisView', field: 'viewId' },
    { parameter: 'representationId', input: 'representation', field: 'representationId' },
    { parameter: 'viewId', input: 'representation', field: 'basisViewId' },
  ]);
  assert.equal(definition.parameters.exact.deterministicTool, `${GARMENT_MESH_WARP_TOOL_ID}@${GARMENT_MESH_WARP_TOOL_VERSION}`);
  assert.equal(definition.parameters.exact.fixedPointBits, 16);
  assert.equal(definition.parameters.exact.rasterization, 'DECLARED_TRIANGLE_ORDER_FIRST_OWNER');
  assert.equal(definition.parameters.exact.interpolation, 'BILINEAR_NORMALIZED_Q16_MESH');
  assert.equal(definition.parameters.exact.uncoveredPixels, 'TRANSPARENT_BLACK');
  assert.deepEqual(definition.parameters.relationships, ['REPRESENTATION_BASIS_VIEW_EQUALS_PIXEL_SOURCE_VIEW']);
  assert.equal(definition.pixelContract.overlapOwnership, 'DECLARED_TRIANGLE_ORDER_FIRST_OWNER');
  assert.equal(definition.pixelContract.uncoveredPixels, 'TRANSPARENT_BLACK');
  assert.equal(GARMENT_MESH_WARP_PRODUCTION_ADMISSION, 'NOT_ADMITTED');
});
