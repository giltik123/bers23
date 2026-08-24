import assert from 'node:assert/strict';
import test from 'node:test';
import type { Artifact, WorkflowOperation } from '../src/platform/creative/workflow-engine/types.ts';
import { productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const operation: WorkflowOperation = Object.freeze({
  id: 'super-resolution',
  type: 'SUPER_RESOLUTION',
  executionRoute: 'ON_DEVICE',
  requiredArtifacts: Object.freeze(['source']),
  produces: Object.freeze(['image']),
});

function artifact(metadataPatch: Readonly<Record<string, unknown>> = {}, valuePatch: Readonly<Record<string, unknown>> = {}): Artifact {
  const width = typeof valuePatch.width === 'number' ? valuePatch.width : 8;
  const height = typeof valuePatch.height === 'number' ? valuePatch.height : 8;
  const data = valuePatch.data instanceof Uint8ClampedArray ? valuePatch.data : new Uint8ClampedArray(width * height * 4).fill(255);
  return Object.freeze({
    id: 'admitted-upscale',
    kind: 'image',
    value: Object.freeze({ width, height, data }),
    producerStepId: 'super-resolution',
    scope,
    metadata: Object.freeze({
      artifactRole: 'COMPOSITE',
      localExecutionAdmission: 'ADMITTED',
      admissionClass: 'MODEL_CONTRACT',
      verificationScope: 'CONTRACT_AND_LINEAGE_ONLY',
      modelOutputSemantics: 'UNATTESTED_DEVICE_INFERENCE',
      executorKind: 'MODEL',
      modelId: 'realesr-general-x4v3',
      modelVersion: '1.0.0-candidate.1',
      runtime: 'WASM',
      accelerator: 'wasm',
      candidateSha256: 'a'.repeat(64),
      postprocess: 'CLAMP_0_1',
      alphaPolicy: 'OPAQUE_INPUT_ONLY',
      sourceWidth: 2,
      sourceHeight: 2,
      outputScale: 4,
      parentArtifactIds: Object.freeze(['source']),
      ...metadataPatch,
    }),
  });
}

test('C3 verifier accepts only model-contract and lineage proof, never deterministic pixel proof', async () => {
  const result = await productionWorkflowVerifier.verify(operation, [artifact()]);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
  assert.ok(result.checks.includes('LOCAL_MODEL_CONTRACT_ADMITTED'));
  assert.ok(result.checks.includes('LOCAL_MODEL_VERIFICATION_SCOPE_VALID'));
  assert.ok(result.checks.includes('LOCAL_MODEL_OUTPUT_GEOMETRY_VALID'));
  assert.equal(result.checks.includes('DETERMINISTIC_PIXELS_VERIFIED'), false);
});

test('C3 verifier rejects ML output that masquerades as BYTE_EXACT or PASS integrity proof', async () => {
  for (const integrityMetrics of [
    Object.freeze({ verificationOutcome: 'PASS' }),
    Object.freeze({ pixelComparison: 'BYTE_EXACT' }),
    Object.freeze({ verificationOutcome: 'PASS', pixelComparison: 'BYTE_EXACT' }),
  ]) {
    const result = await productionWorkflowVerifier.verify(operation, [artifact({ integrityMetrics })]);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, ['LOCAL_MODEL_IMAGE_INVALID']);
  }
});

test('C3 verifier rejects untrusted runtime claims, stale lineage, wrong x4 geometry and non-opaque output', async () => {
  const cases: readonly Artifact[] = [
    artifact({ runtime: 'BROWSER_JS' }),
    artifact({ parentArtifactIds: Object.freeze(['other-source']) }),
    artifact({ sourceWidth: 3 }),
    artifact({}, { width: 7, height: 8, data: new Uint8ClampedArray(7 * 8 * 4).fill(255) }),
    (() => {
      const data = new Uint8ClampedArray(8 * 8 * 4).fill(255); data[3] = 254;
      return artifact({}, { data });
    })(),
  ];
  for (const candidate of cases) {
    const result = await productionWorkflowVerifier.verify(operation, [candidate]);
    assert.equal(result.valid, false);
  }
});

test('C3 verifier rejects provider-routed or provider-bound super-resolution', async () => {
  const providerRoute = Object.freeze({ ...operation, executionRoute: 'PROVIDER' as const, providerId: 'fal' });
  const result = await productionWorkflowVerifier.verify(providerRoute, [artifact()]);
  assert.equal(result.valid, false);
  assert.deepEqual(result.errors, ['LOCAL_MODEL_VERIFICATION_SEMANTICS_INVALID']);
});
