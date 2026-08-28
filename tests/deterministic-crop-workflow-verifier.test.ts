import assert from 'node:assert/strict';
import test from 'node:test';
import type { Artifact, WorkflowOperation } from '../src/platform/creative/workflow-engine/types.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const operation: WorkflowOperation = Object.freeze({
  id: 'crop',
  type: 'CROP',
  executionRoute: 'ON_DEVICE',
  requiredArtifacts: Object.freeze(['source']),
  produces: Object.freeze(['image']),
  input: Object.freeze({
    sourceArtifactId: 'source', x: 1, y: 2, width: 2, height: 1,
    deterministicTool: 'crop@1',
    coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_INDICES',
    rectangleSemantics: 'HALF_OPEN',
  }),
});

function artifact(metadataPatch: Readonly<Record<string, unknown>> = {}, valuePatch: Readonly<Record<string, unknown>> = {}): Artifact {
  const width = typeof valuePatch.width === 'number' ? valuePatch.width : 2;
  const height = typeof valuePatch.height === 'number' ? valuePatch.height : 1;
  const data = valuePatch.data instanceof Uint8ClampedArray ? valuePatch.data : new Uint8ClampedArray(width * height * 4);
  return Object.freeze({
    id: 'core-verified-crop',
    kind: 'image',
    value: Object.freeze({ width, height, data }),
    producerStepId: 'crop',
    scope,
    metadata: Object.freeze({
      artifactRole: 'COMPOSITE',
      localExecutionAdmission: 'ADMITTED',
      admissionClass: 'DETERMINISTIC_BYTE_EXACT',
      verificationScope: 'BYTE_EXACT_CORE_RECOMPUTE',
      executorKind: 'DETERMINISTIC_TOOL',
      toolId: 'crop',
      toolVersion: '1',
      runtime: 'BROWSER_JS',
      accelerator: 'cpu',
      candidateSha256: 'a'.repeat(64),
      verifiedPixelSha256: 'b'.repeat(64),
      cropRect: Object.freeze({ x: 1, y: 2, width: 2, height: 1 }),
      coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_INDICES',
      rectangleSemantics: 'HALF_OPEN',
      interpolation: 'NONE',
      borderPolicy: 'REJECT_OUT_OF_BOUNDS',
      integrityMetrics: Object.freeze({ verificationOutcome: 'PASS', pixelComparison: 'BYTE_EXACT' }),
      parentArtifactIds: Object.freeze(['source']),
      ...metadataPatch,
    }),
  });
}

test('Crop verifier accepts only the exact byte-verified crop@1 contract and source lineage', async () => {
  const result = await productionWorkflowVerifier.verify(operation, [artifact()]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.checks, [
    'PRODUCTION_OPERATION_SUPPORTED',
    'OUTPUT_KIND_IMAGE',
    'DETERMINISTIC_TOOL_CONTRACT_VALID',
    'DETERMINISTIC_PIXELS_VERIFIED',
    'LOCAL_IMAGE_LINEAGE_VALID',
    'DETERMINISTIC_OUTPUT_GEOMETRY_VALID',
  ]);
});

test('Crop verifier rejects tool, runtime, proof-scope and deterministic-policy substitution', async () => {
  for (const patch of [
    { toolId: 'background-isolation' },
    { toolVersion: '2' },
    { executorKind: 'MODEL' },
    { runtime: 'WASM' },
    { accelerator: 'webgpu' },
    { verificationScope: 'CONTRACT_AND_LINEAGE_ONLY' },
    { candidateSha256: 'not-a-sha' },
    { verifiedPixelSha256: 'not-a-sha' },
    { coordinateSpace: 'DISPLAY_PIXELS' },
    { rectangleSemantics: 'CLOSED' },
    { interpolation: 'BILINEAR' },
    { borderPolicy: 'CLAMP' },
    { integrityMetrics: Object.freeze({ verificationOutcome: 'PASS' }) },
  ]) {
    const result = await productionWorkflowVerifier.verify(operation, [artifact(patch)]);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, ['DETERMINISTIC_TOOL_VERIFICATION_SEMANTICS_INVALID']);
  }
});

test('Crop verifier rejects stale lineage and output geometry that differs from the planner operation', async () => {
  const stale = await productionWorkflowVerifier.verify(operation, [artifact({ parentArtifactIds: Object.freeze(['other']) })]);
  assert.equal(stale.valid, false);
  assert.deepEqual(stale.errors, ['LOCAL_IMAGE_LINEAGE_INVALID']);

  const wrongRect = await productionWorkflowVerifier.verify(operation, [artifact({ cropRect: Object.freeze({ x: 1, y: 2, width: 1, height: 1 }) })]);
  assert.equal(wrongRect.valid, false);
  assert.deepEqual(wrongRect.errors, ['DETERMINISTIC_OUTPUT_GEOMETRY_INVALID']);

  const wrongCanvas = await productionWorkflowVerifier.verify(operation, [artifact({}, { width: 1, height: 1, data: new Uint8ClampedArray(4) })]);
  assert.equal(wrongCanvas.valid, false);
  assert.deepEqual(wrongCanvas.errors, ['DETERMINISTIC_OUTPUT_GEOMETRY_INVALID']);
});

test('Crop verifier rejects provider-routed, provider-bound and altered planner contract', async () => {
  for (const candidate of [
    Object.freeze({ ...operation, executionRoute: 'PROVIDER' as const, providerId: 'fal' }),
    Object.freeze({ ...operation, providerId: 'fal' }),
    Object.freeze({ ...operation, input: Object.freeze({ ...operation.input, deterministicTool: 'crop@2' }) }),
    Object.freeze({ ...operation, input: Object.freeze({ ...operation.input, width: 3 }) }),
  ]) {
    const result = await productionWorkflowVerifier.verify(candidate, [artifact()]);
    assert.equal(result.valid, false);
  }
});
