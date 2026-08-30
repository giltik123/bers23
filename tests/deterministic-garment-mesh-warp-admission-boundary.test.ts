import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const paths = Object.freeze({
  identity: 'src/platform/creative/deterministic/GarmentMeshWarpIdentity.js',
  registry: 'src/platform/creative/deterministic/DeterministicToolRegistry.ts',
  executorPolicy: 'server/core/localExecution/productionLocalExecutorPolicy.ts',
  capabilities: 'server/core/providers/productionExecutionCapabilities.ts',
  route: 'server/core/providers/productionExecutionRoute.ts',
  targetSelection: 'server/core/providers/productionTargetSelection.ts',
  tryon: 'src/lib/tryon/tryonEngine.js',
});

async function source(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

test('F4b.1 garment mesh warp remains a shared kernel, not an admitted production executor', async () => {
  const [identity, registry, executorPolicy, capabilities, route, targetSelection, tryon] = await Promise.all([
    source(paths.identity), source(paths.registry), source(paths.executorPolicy), source(paths.capabilities),
    source(paths.route), source(paths.targetSelection), source(paths.tryon),
  ]);

  assert.match(identity, /GARMENT_MESH_WARP_PRODUCTION_ADMISSION = 'NOT_ADMITTED'/);
  for (const [name, text] of [
    ['deterministic registry', registry],
    ['production local executor policy', executorPolicy],
    ['production execution capabilities', capabilities],
    ['production execution route', route],
    ['production target selection', targetSelection],
  ] as const) {
    assert.doesNotMatch(text, /garment-mesh-warp|GARMENT_MESH_WARP/, `${name} must not admit the F4b.1 kernel`);
  }

  assert.match(tryon, /TRYON_EXECUTION_NOT_WIRED/);
  assert.doesNotMatch(tryon, /garment-mesh-warp|GARMENT_MESH_WARP/);
});
