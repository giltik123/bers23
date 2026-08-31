import assert from 'node:assert/strict';
import test from 'node:test';
import { GARMENT_MESH_WARP_OPERATION } from '../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import { verifyGarmentMeshWarpWorkingArtifact } from '../server/core/providers/garmentMeshWarpWorkflowVerifier.ts';

const exact = GARMENT_MESH_WARP_TOOL_DEFINITION.parameters.exact;
const sourceArtifactId = 'signed-project-lineage';
const input = Object.freeze({
  sourceArtifactId,
  garmentId: '11111111-1111-4111-8111-111111111111',
  viewId: '22222222-2222-4222-8222-222222222222',
  representationId: '33333333-3333-4333-8333-333333333333',
  anchorSetId: '44444444-4444-4444-8444-444444444444',
  projectImageStorageId: '55555555-5555-4555-8555-555555555555',
  projectImageSha256: 'a'.repeat(64),
  viewSha256: 'b'.repeat(64),
  representationSha256: 'c'.repeat(64),
  anchorPayloadSha256: 'd'.repeat(64),
  destinationMeshSha256: 'e'.repeat(64),
  ...exact,
});
const operation = Object.freeze({
  id: 'garment-mesh-warp',
  type: GARMENT_MESH_WARP_OPERATION,
  executionRoute: 'ON_DEVICE' as const,
  requiredArtifacts: Object.freeze([sourceArtifactId]),
  input,
});
const metadata = Object.freeze({
  artifactRole: 'WORKING',
  localExecutionAdmission: 'ADMITTED',
  admissionClass: 'DETERMINISTIC_BYTE_EXACT',
  verificationScope: 'BYTE_EXACT_CORE_RECOMPUTE',
  persistenceAuthority: 'FASHION_INTERMEDIATE_ONLY',
  executorKind: 'DETERMINISTIC_TOOL',
  toolId: 'garment-mesh-warp',
  toolVersion: '1',
  runtime: 'BROWSER_JS',
  accelerator: 'cpu',
  candidateSha256: 'f'.repeat(64),
  verifiedPixelSha256: '0'.repeat(64),
  garmentId: input.garmentId,
  viewId: input.viewId,
  representationId: input.representationId,
  anchorSetId: input.anchorSetId,
  projectImageStorageId: input.projectImageStorageId,
  projectImageSha256: input.projectImageSha256,
  viewSha256: input.viewSha256,
  representationSha256: input.representationSha256,
  anchorPayloadSha256: input.anchorPayloadSha256,
  destinationMeshSha256: input.destinationMeshSha256,
  basisViewWidth: 32,
  basisViewHeight: 48,
  outputWidth: 64,
  outputHeight: 96,
  ...exact,
  integrityMetrics: Object.freeze({ verificationOutcome: 'PASS', pixelComparison: 'BYTE_EXACT' }),
  parentArtifactIds: Object.freeze([sourceArtifactId]),
});
const artifact = Object.freeze({
  id: 'verified-working-layer',
  kind: 'image',
  producerStepId: operation.id,
  scope: Object.freeze({ tenantId: 't', userId: 'u', projectId: 'p' }),
  value: Object.freeze({ width: 64, height: 96, data: new Uint8ClampedArray(64 * 96 * 4) }),
  metadata,
});

test('garment warp verifier admits only byte-exact WORKING Fashion intermediate semantics', async () => {
  const result = verifyGarmentMeshWarpWorkingArtifact(operation as any, [artifact] as any);
  assert.equal(result.valid, true);
  assert.ok(result.checks.includes('GARMENT_MESH_WARP_FASHION_INTERMEDIATE_ONLY'));
  assert.equal(result.errors.length, 0);
});

test('garment warp verifier rejects Project-FINAL laundering, authority drift and open operation schemas', async () => {
  const cases = [
    ['composite-role', { metadata: { ...metadata, artifactRole: 'COMPOSITE' } }, operation],
    ['project-final-authority', { metadata: { ...metadata, persistenceAuthority: 'PROJECT_FINAL' } }, operation],
    ['uppercase-hash', { metadata: { ...metadata, projectImageSha256: input.projectImageSha256.toUpperCase() } }, operation],
    ['mesh-drift', { metadata: { ...metadata, destinationMeshSha256: '1'.repeat(64) } }, operation],
    ['missing-parent', { metadata: { ...metadata, parentArtifactIds: [] } }, operation],
    ['wrong-geometry', { value: { width: 65, height: 96, data: new Uint8ClampedArray(65 * 96 * 4) } }, operation],
    ['extra-client-field', {}, { ...operation, input: { ...input, clientMesh: [] } }],
    ['provider-route', {}, { ...operation, executionRoute: 'PROVIDER', providerId: 'fal' }],
  ] as const;
  for (const [name, artifactPatch, operationPatch] of cases) {
    const candidate = Object.freeze({ ...artifact, ...artifactPatch, metadata: Object.freeze({ ...metadata, ...((artifactPatch as any).metadata ?? {}) }) });
    const result = verifyGarmentMeshWarpWorkingArtifact(operationPatch as any, [candidate] as any);
    assert.equal(result.valid, false, name);
  }
});
