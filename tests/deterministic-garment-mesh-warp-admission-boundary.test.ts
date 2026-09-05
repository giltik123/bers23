import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_PRODUCTION_ADMISSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../src/platform/creative/deterministic/GarmentMeshWarpRegistryDefinition.js';
import { productionGarmentMeshWarpExecutorsByCapability } from '../server/core/localExecution/productionGarmentMeshWarpExecutorPolicy.ts';
import {
  GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE,
  admitProductionGarmentMeshWarpCapability,
  selectProductionGarmentMeshWarpRoute,
  selectProductionGarmentMeshWarpTarget,
} from '../server/core/providers/productionGarmentMeshWarpExecutionPolicy.ts';

const tryonPath = 'src/lib/tryon/tryonEngine.js';
const aggregatePolicyPath = 'server/core/localExecution/productionLocalExecutorPolicy.ts';
const aggregateRegistryPath = 'src/platform/creative/deterministic/DeterministicToolRegistry.ts';
const aggregateCapabilityPath = 'server/core/providers/productionExecutionCapabilities.ts';
const aggregateRoutePath = 'server/core/providers/productionExecutionRoute.ts';
const aggregateTargetPath = 'server/core/providers/productionTargetSelection.ts';
const executionPolicyLeafPath = 'server/core/providers/productionGarmentMeshWarpExecutionPolicy.ts';
const F4B4_ADMISSION_ROOTS = Object.freeze([
  'tests/local-execution-managed-input-platform.test.ts',
  'tests/garment-mesh-warp-managed-input-limits.test.ts',
  'tests/garment-mesh-warp-registry-contract.test.ts',
  'tests/garment-mesh-warp-planner-contract.test.ts',
  'tests/garment-mesh-warp-ticket-contract.test.ts',
  'tests/artifact-authority-stored-image-evidence.test.ts',
  'tests/garment-mesh-warp-input-delivery.test.ts',
  'tests/garment-mesh-warp-execution-service.test.ts',
  'tests/garment-mesh-warp-workflow-verifier.test.ts',
  'tests/garment-mesh-warp-browser-executor.test.ts',
  'tests/garment-mesh-warp-http-adapter.test.ts',
  'tests/deterministic-garment-mesh-warp-admission-boundary.test.ts',
]);

test('F4b.4 admission is explicit, Fashion-intermediate-only and does not wire generative Try-On', async () => {
  assert.equal(GARMENT_MESH_WARP_PRODUCTION_ADMISSION, 'ADMITTED');
  assert.equal(GARMENT_MESH_WARP_TOOL_DEFINITION.output.role, 'WORKING');
  assert.equal(GARMENT_MESH_WARP_TOOL_DEFINITION.lineage.finalRole, 'WORKING');
  assert.deepEqual(productionGarmentMeshWarpExecutorsByCapability[GARMENT_MESH_WARP_CAPABILITY], [GARMENT_MESH_WARP_TOOL_DEFINITION.executor]);
  assert.equal(GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE.route, 'ON_DEVICE');
  assert.equal(GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE.target, 'LOCAL');
  assert.equal(GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE.capabilityId, GARMENT_MESH_WARP_CAPABILITY);

  const aggregatePolicy = await readFile(aggregatePolicyPath, 'utf8');
  assert.match(aggregatePolicy, /import \{ productionGarmentMeshWarpExecutorsByCapability \} from '\.\/productionGarmentMeshWarpExecutorPolicy\.ts';/);
  assert.match(aggregatePolicy, /\.\.\.productionGarmentMeshWarpExecutorsByCapability,/);
  assert.doesNotMatch(aggregatePolicy, /GarmentMeshWarpIdentity\.js/);
  assert.doesNotMatch(aggregatePolicy, /const garmentMeshWarpTool =/);

  const capabilityAggregate = await readFile(aggregateCapabilityPath, 'utf8');
  assert.match(capabilityAggregate, /import \{ GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE \} from '\.\/productionGarmentMeshWarpExecutionPolicy\.ts';/);
  assert.match(capabilityAggregate, /GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE,/);
  assert.doesNotMatch(capabilityAggregate, /GarmentMeshWarpIdentity\.js/);

  const routeAggregate = await readFile(aggregateRoutePath, 'utf8');
  assert.match(routeAggregate, /import \{ GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE \} from '\.\/productionGarmentMeshWarpExecutionPolicy\.ts';/);
  assert.match(routeAggregate, /GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE\.operationType/);
  assert.doesNotMatch(routeAggregate, /GarmentMeshWarpIdentity\.js/);

  const targetAggregate = await readFile(aggregateTargetPath, 'utf8');
  assert.match(targetAggregate, /import \{ GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE \} from '\.\/productionGarmentMeshWarpExecutionPolicy\.ts';/);
  assert.match(targetAggregate, /GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE\.operationType/);
  assert.doesNotMatch(targetAggregate, /GarmentMeshWarpIdentity\.js/);

  const tryon = await readFile(tryonPath, 'utf8');
  assert.match(tryon, /TRYON_EXECUTION_NOT_WIRED/);
  assert.doesNotMatch(tryon, /garment-mesh-warp|GARMENT_MESH_WARP/);
});

test('F4b.4 production execution leaf fails closed outside the exact LOCAL_ONLY tuple', () => {
  const request = Object.freeze({ metadata: Object.freeze({ operationIntent: GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE.operationIntent }) });
  const operation = Object.freeze({ type: GARMENT_MESH_WARP_PRODUCTION_EXECUTION_RULE.operationType });
  assert.equal(selectProductionGarmentMeshWarpRoute(operation as any), 'ON_DEVICE');
  assert.equal(selectProductionGarmentMeshWarpTarget(operation as any), 'LOCAL');
  assert.deepEqual(
    admitProductionGarmentMeshWarpCapability({ request, operation, route: 'ON_DEVICE', target: 'LOCAL' } as any),
    { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: GARMENT_MESH_WARP_CAPABILITY },
  );
  assert.equal(admitProductionGarmentMeshWarpCapability({ request, operation, route: 'PROVIDER', target: 'LOCAL' } as any).allowed, false);
  assert.equal(admitProductionGarmentMeshWarpCapability({ request, operation: { ...operation, providerId: 'fal' }, route: 'ON_DEVICE', target: 'LOCAL' } as any).allowed, false);
  assert.equal(admitProductionGarmentMeshWarpCapability({ request: { metadata: { operationIntent: 'RESIZE' } }, operation, route: 'ON_DEVICE', target: 'LOCAL' } as any).allowed, false);
  assert.equal(selectProductionGarmentMeshWarpTarget({ type: 'RESIZE' } as any), 'BLOCKED');
  assert.throws(() => selectProductionGarmentMeshWarpRoute({ type: 'RESIZE' } as any), /Unsupported GarmentMeshWarp production execution route/);
});

test('F4b.4 admission runtime graph stays on narrow GarmentMeshWarp leaves instead of aggregate registries', async () => {
  const graph = await collectRelativeRuntimeGraph(F4B4_ADMISSION_ROOTS);
  for (const aggregatePath of [aggregateRegistryPath, aggregatePolicyPath, aggregateCapabilityPath, aggregateRoutePath, aggregateTargetPath]) {
    assert.equal(graph.includes(aggregatePath), false, `F4b.4 runtime graph reached ${aggregatePath}`);
  }
  assert.equal(graph.includes('src/platform/creative/deterministic/GarmentMeshWarpRegistryDefinition.js'), true);
  assert.equal(graph.includes('server/core/localExecution/productionGarmentMeshWarpExecutorPolicy.ts'), true);
  assert.equal(graph.includes(executionPolicyLeafPath), true);
});

async function collectRelativeRuntimeGraph(roots: readonly string[]): Promise<string[]> {
  const seen = new Set<string>();
  const queue = [...roots];
  while (queue.length) {
    const repoPath = queue.shift()!;
    if (seen.has(repoPath)) continue;
    seen.add(repoPath);
    const source = await readFile(repoPath, 'utf8');
    for (const specifier of runtimeRelativeImports(source)) {
      const resolved = await resolveRelativeImport(repoPath, specifier);
      assert.ok(resolved, `Could not resolve runtime import ${specifier} from ${repoPath}`);
      if (!seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen].sort();
}

function runtimeRelativeImports(source: string): string[] {
  const imports: string[] = [];
  const statementPattern = /^\s*import[\s\S]*?;\s*$/gm;
  for (const match of source.matchAll(statementPattern)) {
    const statement = match[0];
    if (/^\s*import\s+type\b/.test(statement)) continue;
    const from = statement.match(/\bfrom\s+['"]([^'"]+)['"]/);
    const sideEffect = statement.match(/^\s*import\s+['"]([^'"]+)['"]/);
    const specifier = from?.[1] ?? sideEffect?.[1];
    if (specifier?.startsWith('.')) imports.push(specifier);
  }
  return imports;
}

async function resolveRelativeImport(fromRepoPath: string, specifier: string): Promise<string | undefined> {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRepoPath), specifier));
  const hasExtension = /\.[cm]?[jt]sx?$/.test(base);
  const candidates = hasExtension
    ? [base]
    : [base, `${base}.ts`, `${base}.js`, `${base}.mjs`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.js`];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next exact source candidate.
    }
  }
  return undefined;
}
