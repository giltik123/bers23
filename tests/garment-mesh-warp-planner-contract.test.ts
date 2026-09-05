import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CanonicalDecisionService,
  CanonicalPlanningService,
  type CreativeArtifact,
  type CreativeRequest,
} from '../src/platform/creative/canonical/index.ts';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS,
  GARMENT_MESH_WARP_MAX_RASTER_WORK,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_SCHEMA,
  GARMENT_MESH_WARP_STEP_ID,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../src/platform/creative/deterministic/GarmentMeshWarpRegistryDefinition.js';
import { productionGarmentMeshWarpExecutorsByCapability } from '../server/core/localExecution/productionGarmentMeshWarpExecutorPolicy.ts';
import { productionExecutionCapabilities } from '../server/core/providers/productionExecutionCapabilities.ts';
import { productionExecutionRoute } from '../server/core/providers/productionExecutionRoute.ts';
import { productionTargetSelection } from '../server/core/providers/productionTargetSelection.ts';

const scope = Object.freeze({ tenantId: 'tenant-planner-warp', userId: 'user-planner-warp', projectId: 'project-planner-warp' });
const source: CreativeArtifact = Object.freeze({
  id: 'signed-project-source',
  kind: 'image',
  value: Object.freeze({ width: 320, height: 480, data: new Uint8ClampedArray(320 * 480 * 4) }),
  producerOperationId: 'seed',
  scope,
  state: 'AVAILABLE',
  role: 'COMPOSITE',
  image: Object.freeze({ width: 320, height: 480, format: 'RGBA8', orientation: 1, colorSpace: 'srgb', alpha: true }),
  metadata: Object.freeze({ sha256: '0'.repeat(64) }),
});
const binding = Object.freeze({
  garmentId: 'a1111111-1111-4111-8111-111111111111',
  viewId: 'b2222222-2222-4222-8222-222222222222',
  representationId: 'c3333333-3333-4333-8333-333333333333',
  anchorSetId: 'd4444444-4444-4444-8444-444444444444',
  projectImageStorageId: 'e5555555-5555-4555-8555-555555555555',
  projectImageSha256: 'e'.repeat(64),
  viewSha256: 'a'.repeat(64),
  representationSha256: 'b'.repeat(64),
  anchorPayloadSha256: 'c'.repeat(64),
  destinationMeshSha256: 'd'.repeat(64),
});

function request(id: string, garmentMeshWarpBinding: unknown = binding, sourceArtifactId: string = source.id): CreativeRequest {
  return Object.freeze({
    id,
    intent: 'fit the admitted garment geometry to the current project body anchors',
    scope,
    inputArtifacts: Object.freeze([source]),
    budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
    metadata: Object.freeze({
      operationIntent: GARMENT_MESH_WARP_OPERATION,
      sourceArtifactId,
      garmentMeshWarpBinding,
      planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0, forbiddenTargets: Object.freeze(['CLOUD']) }),
    }),
  });
}

async function plan(input: CreativeRequest) {
  const decision = await new CanonicalDecisionService().decide(input);
  return new CanonicalPlanningService().plan(input, decision);
}

test('canonical planner emits one zero-cloud garment warp operation from a closed server binding', async () => {
  const result = await plan(request('planner-warp-valid'));
  assert.equal(result.status, 'READY');
  assert.deepEqual(result.confirmationReasons, []);
  assert.equal(result.operations.length, 1);
  const operation = result.operations[0];
  assert.equal(operation.id, GARMENT_MESH_WARP_STEP_ID);
  assert.equal(operation.type, GARMENT_MESH_WARP_OPERATION);
  assert.deepEqual(operation.requiredArtifacts, [source.id]);
  assert.deepEqual(operation.produces, ['image']);
  assert.deepEqual(operation.outputArtifacts, ['garment-mesh-warp:working']);
  assert.deepEqual(operation.input, {
    sourceArtifactId: source.id,
    ...binding,
    deterministicTool: `${GARMENT_MESH_WARP_TOOL_ID}@${GARMENT_MESH_WARP_TOOL_VERSION}`,
    meshSchema: GARMENT_MESH_WARP_SCHEMA,
    sourceCoordinateSpace: 'PRIMARY_VIEW_NORMALIZED_Q16',
    destinationCoordinateSpace: 'PROJECT_IMAGE_NORMALIZED_Q16',
    fixedPointBits: 16,
    rasterization: 'DECLARED_TRIANGLE_ORDER_FIRST_OWNER',
    interpolation: 'BILINEAR_NORMALIZED_Q16_MESH',
    rounding: 'ROUND_HALF_UP',
    alphaPolicy: 'PREMULTIPLIED_ALPHA_WITH_STRAIGHT_RGB_WHEN_WEIGHTED_ALPHA_ZERO',
    uncoveredPixels: 'TRANSPARENT_BLACK',
    maxOutputPixels: GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS,
    maxRasterWork: GARMENT_MESH_WARP_MAX_RASTER_WORK,
  });
  assert.equal(result.provenance.reasons.includes('GARMENT_MESH_WARP_LOCAL_DETERMINISTIC_V1'), true);
});

test('production policy admits only the exact garment warp LOCAL_ONLY tuple and registered executor', async () => {
  const input = request('planner-warp-production-policy');
  const result = await plan(input);
  assert.equal(result.status, 'READY');
  const operation = result.operations[0];
  assert.equal(productionExecutionRoute.select(operation, input), 'ON_DEVICE');
  assert.equal(productionTargetSelection.select(operation, input), 'LOCAL');
  assert.deepEqual(
    productionExecutionCapabilities.admit({ request: input, operation: { ...operation, executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' }),
    { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: GARMENT_MESH_WARP_CAPABILITY },
  );
  assert.deepEqual(productionGarmentMeshWarpExecutorsByCapability[GARMENT_MESH_WARP_CAPABILITY], [GARMENT_MESH_WARP_TOOL_DEFINITION.executor]);

  const forgedRequest: CreativeRequest = Object.freeze({
    ...input,
    metadata: Object.freeze({ ...input.metadata, operationIntent: 'RESIZE' }),
  });
  assert.equal(
    productionExecutionCapabilities.admit({ request: forgedRequest, operation: { ...operation, executionRoute: 'ON_DEVICE' }, route: 'ON_DEVICE', target: 'LOCAL' }).allowed,
    false,
  );
});

test('canonical planner fails closed on non-canonical, open-ended or mismatched garment warp evidence', async () => {
  const cases: readonly [string, unknown, string][] = [
    ['uppercase-hash', { ...binding, viewSha256: binding.viewSha256.toUpperCase() }, source.id],
    ['uppercase-uuid', { ...binding, garmentId: binding.garmentId.toUpperCase() }, source.id],
    ['open-schema', { ...binding, extra: 'client-claim' }, source.id],
    ['missing-field', Object.fromEntries(Object.entries(binding).filter(([key]) => key !== 'destinationMeshSha256')), source.id],
    ['wrong-source', binding, 'not-the-canonical-source'],
  ];
  for (const [name, candidate, sourceArtifactId] of cases) {
    const result = await plan(request(`planner-warp-${name}`, candidate, sourceArtifactId));
    assert.equal(result.status, 'BLOCKED', name);
    assert.deepEqual(result.operations, [], name);
    if (name === 'wrong-source') assert.ok(result.confirmationReasons.includes('CANONICAL_SOURCE_IMAGE_REQUIRED'), name);
    else assert.ok(result.confirmationReasons.includes('INVALID_GARMENT_MESH_WARP_BINDING'), name);
  }
});
