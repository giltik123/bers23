import assert from 'node:assert/strict';
import test from 'node:test';
import type { Artifact, WorkflowOperation } from '../src/platform/creative/workflow-engine/types.ts';
import { RESIZE_MAX_OUTPUT_PIXELS } from '../src/platform/creative/deterministic/Resize.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const operation: WorkflowOperation = Object.freeze({
  id: 'resize',
  type: 'RESIZE',
  executionRoute: 'ON_DEVICE',
  requiredArtifacts: Object.freeze(['source']),
  produces: Object.freeze(['image']),
  input: Object.freeze({
    sourceArtifactId: 'source', width: 3, height: 2,
    deterministicTool: 'resize@1',
    coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_CENTERS',
    interpolation: 'BILINEAR_FIXED_16_16_PIXEL_CENTER',
    fixedPointBits: 16,
    rounding: 'ROUND_HALF_UP',
    borderPolicy: 'CLAMP_TO_EDGE',
    alphaPolicy: 'PREMULTIPLIED_ALPHA_WITH_STRAIGHT_RGB_WHEN_WEIGHTED_ALPHA_ZERO',
    maxOutputPixels: RESIZE_MAX_OUTPUT_PIXELS,
  }),
});

function artifact(metadataPatch: Readonly<Record<string, unknown>> = {}, valuePatch: Readonly<Record<string, unknown>> = {}): Artifact {
  const width = typeof valuePatch.width === 'number' ? valuePatch.width : 3;
  const height = typeof valuePatch.height === 'number' ? valuePatch.height : 2;
  const data = valuePatch.data instanceof Uint8ClampedArray ? valuePatch.data : new Uint8ClampedArray(width * height * 4);
  return Object.freeze({
    id: 'core-verified-resize', kind: 'image', value: Object.freeze({ width, height, data }), producerStepId: 'resize', scope,
    metadata: Object.freeze({
      artifactRole: 'COMPOSITE', localExecutionAdmission: 'ADMITTED', admissionClass: 'DETERMINISTIC_BYTE_EXACT', verificationScope: 'BYTE_EXACT_CORE_RECOMPUTE',
      executorKind: 'DETERMINISTIC_TOOL', toolId: 'resize', toolVersion: '1', runtime: 'BROWSER_JS', accelerator: 'cpu',
      candidateSha256: 'a'.repeat(64), verifiedPixelSha256: 'b'.repeat(64),
      sourceWidth: 2, sourceHeight: 2, resizeTarget: Object.freeze({ width: 3, height: 2 }),
      coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_CENTERS', interpolation: 'BILINEAR_FIXED_16_16_PIXEL_CENTER', fixedPointBits: 16,
      rounding: 'ROUND_HALF_UP', borderPolicy: 'CLAMP_TO_EDGE', alphaPolicy: 'PREMULTIPLIED_ALPHA_WITH_STRAIGHT_RGB_WHEN_WEIGHTED_ALPHA_ZERO', maxOutputPixels: RESIZE_MAX_OUTPUT_PIXELS,
      integrityMetrics: Object.freeze({ verificationOutcome: 'PASS', pixelComparison: 'BYTE_EXACT' }), parentArtifactIds: Object.freeze(['source']),
      ...metadataPatch,
    }),
  });
}

test('Resize verifier accepts only exact byte-verified resize@1 semantics, source lineage and target geometry', async () => {
  const result = await productionWorkflowVerifier.verify(operation, [artifact()]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.checks, [
    'PRODUCTION_OPERATION_SUPPORTED', 'OUTPUT_KIND_IMAGE', 'DETERMINISTIC_TOOL_CONTRACT_VALID', 'DETERMINISTIC_PIXELS_VERIFIED', 'LOCAL_IMAGE_LINEAGE_VALID', 'DETERMINISTIC_OUTPUT_GEOMETRY_VALID',
  ]);
});

test('Resize verifier rejects executor, proof scope or any fixed-point pixel-law substitution', async () => {
  for (const patch of [
    { toolId: 'crop' }, { toolVersion: '2' }, { executorKind: 'MODEL' }, { runtime: 'WASM' }, { accelerator: 'webgpu' },
    { verificationScope: 'CONTRACT_AND_LINEAGE_ONLY' }, { candidateSha256: 'bad' }, { verifiedPixelSha256: 'bad' },
    { coordinateSpace: 'DISPLAY_PIXELS' }, { interpolation: 'BILINEAR_FLOAT' }, { fixedPointBits: 15 }, { rounding: 'ROUND_TO_EVEN' },
    { borderPolicy: 'REFLECT' }, { alphaPolicy: 'STRAIGHT_ALPHA' }, { maxOutputPixels: RESIZE_MAX_OUTPUT_PIXELS + 1 },
    { integrityMetrics: Object.freeze({ verificationOutcome: 'PASS' }) },
  ]) {
    const result = await productionWorkflowVerifier.verify(operation, [artifact(patch)]);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, ['DETERMINISTIC_TOOL_VERIFICATION_SEMANTICS_INVALID']);
  }
});

test('Resize verifier rejects stale source lineage and target/source geometry substitution', async () => {
  const stale = await productionWorkflowVerifier.verify(operation, [artifact({ parentArtifactIds: Object.freeze(['other']) })]);
  assert.equal(stale.valid, false);
  assert.deepEqual(stale.errors, ['LOCAL_IMAGE_LINEAGE_INVALID']);

  for (const candidate of [
    artifact({ resizeTarget: Object.freeze({ width: 2, height: 2 }) }),
    artifact({ sourceWidth: 0 }),
    artifact({ sourceHeight: 16385 }),
    artifact({}, { width: 2, height: 2, data: new Uint8ClampedArray(16) }),
  ]) {
    const result = await productionWorkflowVerifier.verify(operation, [candidate]);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, ['DETERMINISTIC_OUTPUT_GEOMETRY_INVALID']);
  }
});

test('Resize verifier rejects provider routing and planner parameter substitution', async () => {
  for (const candidateOperation of [
    Object.freeze({ ...operation, executionRoute: 'PROVIDER' as const, providerId: 'fal' }),
    Object.freeze({ ...operation, providerId: 'fal' }),
    Object.freeze({ ...operation, input: Object.freeze({ ...operation.input, deterministicTool: 'resize@2' }) }),
    Object.freeze({ ...operation, input: Object.freeze({ ...operation.input, width: 4 }) }),
    Object.freeze({ ...operation, input: Object.freeze({ ...operation.input, fixedPointBits: 15 }) }),
  ]) {
    const result = await productionWorkflowVerifier.verify(candidateOperation, [artifact()]);
    assert.equal(result.valid, false);
  }
});