import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_PRODUCTION_ADMISSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const tryonPath = 'src/lib/tryon/tryonEngine.js';

test('F4b.4 admission is explicit, Fashion-intermediate-only and does not wire generative Try-On', async () => {
  assert.equal(GARMENT_MESH_WARP_PRODUCTION_ADMISSION, 'ADMITTED');
  assert.equal(GARMENT_MESH_WARP_TOOL_DEFINITION.output.role, 'WORKING');
  assert.equal(GARMENT_MESH_WARP_TOOL_DEFINITION.lineage.finalRole, 'WORKING');
  assert.deepEqual(productionLocalExecutorsByCapability[GARMENT_MESH_WARP_CAPABILITY], [GARMENT_MESH_WARP_TOOL_DEFINITION.executor]);

  const tryon = await readFile(tryonPath, 'utf8');
  assert.match(tryon, /TRYON_EXECUTION_NOT_WIRED/);
  assert.doesNotMatch(tryon, /garment-mesh-warp|GARMENT_MESH_WARP/);
});
