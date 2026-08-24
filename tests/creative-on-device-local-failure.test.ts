import assert from 'node:assert/strict';
import test from 'node:test';
import { CoreAuthorizedSegmentation } from '../src/application/selection/CoreAuthorizedSegmentation';
import type { InteractiveSegmentationPort } from '../src/application/selection';
import type { ModelManifest } from '../src/platform/creative/local-ai';

const INPUT_HASH = 'f'.repeat(64);
const analysis = Object.freeze({ originalWidth: 4, originalHeight: 4, analysisWidth: 2, analysisHeight: 2, scaleX: .5, scaleY: .5, offsetX: 0, offsetY: 0 });
const points = Object.freeze([{ x: 1, y: 1, label: 'POSITIVE' as const, coordinateSpace: 'ORIGINAL' as const }]);
const model: ModelManifest = Object.freeze({
  modelId: 'mobilesam-vit-t', version: '1.0.2', family: 'segmentation', capabilities: ['INTERACTIVE_SEGMENTATION'], modelFormat: 'ONNX', runtime: 'WASM',
  sizeBytes: 1, requiredRam: 1, requiredVram: 0, supportedPlatforms: ['BROWSER'], supportedAccelerators: ['WASM'], estimatedLatency: 1,
  qualityScore: 1, energyScore: 1, privacyLevel: 'PRIVATE', license: 'Apache-2.0', publisher: 'bers', downloadUri: 'local://mobilesam',
  sha256: 'a'.repeat(64), signature: 'test-signature', status: 'READY', stabilityScore: 1,
});
const ticket = Object.freeze({
  ticketId: 'ticket-1', version: '1' as const, issuer: 'CORE' as const, requestId: 'execution-1', workflowId: 'execution-1', stepId: 'interactive-segmentation',
  operation: Object.freeze({ id: 'interactive-segmentation', version: '1', type: 'segment', capability: 'local:mobilesam:segment:v1', parameters: Object.freeze({ selectionRequestId: 'request-1', analysis, points }) }),
  scope: Object.freeze({ tenantId: 't', projectId: 'p', userId: 'u' }),
  inputs: Object.freeze([{ artifactId: 'image-1', kind: 'image', role: 'ORIGINAL' as const, sha256: INPUT_HASH }]),
  expectedOutputs: Object.freeze([{ kind: 'mask', role: 'MASK' as const, count: 1, mimeTypes: Object.freeze(['application/octet-stream']), width: 4, height: 4 }]),
  allowedModels: Object.freeze([{ modelId: model.modelId, version: model.version }]), policy: 'LOCAL_ONLY' as const, idempotencyKey: 'idem', nonce: 'nonce', issuedAt: 1, expiresAt: 9_999_999_999_999,
  cost: Object.freeze({ paidCloudCredits: 0 as const, providerCalls: 0 as const }),
});

test('an admitted LOCAL runtime failure stops without upload, submit, provider or cloud fallback', async () => {
  const calls = { prepare: 0, admission: 0, integrity: 0, local: 0, upload: 0, submit: 0 };
  const local: InteractiveSegmentationPort = {
    cancel() {},
    async segment() { calls.local += 1; throw new Error('local WASM runtime failed'); },
  };
  const core = {
    async prepareSegmentation() { calls.prepare += 1; return { executionId: 'execution-1', ticket }; },
    async uploadMask() { calls.upload += 1; throw new Error('upload must not run after local failure'); },
    async submit() { calls.submit += 1; throw new Error('submit must not run after local failure'); },
  };
  const deviceAdmission = {
    async admit(admittedModel: ModelManifest) {
      calls.admission += 1;
      return {
        allowed: true as const,
        model: admittedModel,
        device: { tier: 'MEDIUM' },
        runtimes: { WASM: true, WEBGPU: 'UNKNOWN' },
        suitability: { modelId: admittedModel.modelId, eligible: true, score: 1, factors: {}, reasons: [] },
        resource: { allowed: true, reasons: [], suggestedTarget: 'LOCAL' },
      } as any;
    },
  };
  const integrity = { async sha256() { calls.integrity += 1; return INPUT_HASH; } };
  const adapter = new CoreAuthorizedSegmentation('p', local, core as any, deviceAdmission, model, integrity);

  await assert.rejects(
    () => adapter.segment({ requestId: 'request-1', imageArtifactId: 'image-1', analysis, points, privacyMode: 'LOCAL_ONLY' }),
    /local WASM runtime failed/,
  );
  assert.deepEqual(calls, { prepare: 1, admission: 1, integrity: 1, local: 1, upload: 0, submit: 0 });
  assert.equal('providerSelector' in core, false);
  assert.equal('cloud' in core, false);
});
