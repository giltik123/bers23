import assert from 'node:assert/strict';
import test from 'node:test';
import { SelectionApplicationService, assessMask, chooseAnalysis } from '../src/application/selection';
import { CoreAuthorizedSegmentation } from '../src/application/selection/CoreAuthorizedSegmentation';
import { displayToOriginal } from '../src/platform/creative/pipeline/ControlledLocalEdit';
import type { InteractiveSegmentationPort, SelectionCandidate } from '../src/application/selection';

const view = { displayWidth: 400, displayHeight: 300, originalWidth: 1000, originalHeight: 500, zoom: 2, panX: 10, panY: -5 };
const candidate = (value = 255): SelectionCandidate => ({ alpha: new Uint8Array(512 * 256).fill(value), width: 512, height: 256, coordinateSpace: 'ANALYSIS', score: .9 });
function fixture(segment: InteractiveSegmentationPort['segment'] = async () => ({ target: 'LOCAL', modelId: 'mobile-sam', modelVersion: '1', latencyMs: 5, candidates: [candidate()] })) {
  const persisted: any[] = [];
  const port: InteractiveSegmentationPort = { segment, cancel() {} };
  const service = new SelectionApplicationService(port, {
    async persist(mask, metadata) {
      const artifact = { id: 'canonical-mask', kind: 'mask', value: mask, producerOperationId: 'selection-confirm', scope: { tenantId: 't', projectId: 'p', userId: 'u' }, state: 'AVAILABLE' as const, role: 'MASK' as const, metadata };
      persisted.push(artifact);
      return artifact;
    },
  });
  return { service, persisted };
}

test('reuses the canonical DPR/letterbox/zoom/pan transform', () => assert.deepEqual(displayToOriginal({ x: 210, y: 145 }, view), { x: 500, y: 250 }));
test('analysis transform is explicit and memory policy reduces large images', () => { const t = chooseAnalysis(6000, 4000, 1536, 40_000_000); assert.ok(t.analysisWidth < 1536); assert.equal(t.originalWidth, 6000); assert.equal(t.offsetX, 0); });
test('smart points are ORIGINAL, candidates use score, and Done persists one canonical alpha mask', async () => {
  let seen: any;
  const { service, persisted } = fixture(async i => { seen = i; return { target: 'LOCAL', modelId: 'm', modelVersion: '1', latencyMs: 3, candidates: [candidate(100), { ...candidate(220), score: .95 }] }; });
  service.start({ imageArtifactId: 'image', width: 1000, height: 500 });
  await service.smartPoint({ displayPoint: { x: 210, y: 145 }, view, privacyMode: 'LOCAL_ONLY', analysisMaxEdge: 512 });
  assert.deepEqual(seen.points[0], { x: 500, y: 250, label: 'POSITIVE', coordinateSpace: 'ORIGINAL' });
  service.setMode('BRUSH_SUBTRACT'); service.brush({ points: [{ x: 210, y: 145 }], radius: 20, hardness: .5, view });
  assert.equal(service.snapshot().canUndo, true); service.undo(); service.redo();
  const artifact = await service.done();
  assert.equal(artifact.role, 'MASK'); assert.equal((artifact.value as any).coordinateSpace, 'ORIGINAL'); assert.equal((artifact.value as any).alpha.length, 500000); assert.equal(persisted.length, 1);
});
test('Cancel discards transient history without persistence', () => { const { service, persisted } = fixture(); service.start({ imageArtifactId: 'i', width: 10, height: 10 }); service.setMode('BRUSH_ADD'); service.brush({ points: [{ x: 2, y: 2 }], radius: 2, hardness: 1, view: { displayWidth: 10, displayHeight: 10, originalWidth: 10, originalHeight: 10 } }); service.cancel(); assert.equal(persisted.length, 0); assert.throws(() => service.snapshot(), /No active/); });
test('late A cannot replace B', async () => { let resolveA!: (v: any) => void; const { service } = fixture(i => i.requestId.endsWith(':2') ? new Promise(r => resolveA = r) : Promise.resolve({ target: 'LOCAL', modelId: 'm', modelVersion: '1', latencyMs: 1, candidates: [{ ...candidate(80), width: 256, height: 128, alpha: new Uint8Array(256 * 128).fill(80) }] })); service.start({ imageArtifactId: 'i', width: 1000, height: 500 }); const a = service.smartPoint({ displayPoint: { x: 10, y: 10 }, view: { ...view, zoom: 1, panX: 0, panY: 0 }, privacyMode: 'NORMAL', analysisMaxEdge: 256 }); const b = service.smartPoint({ displayPoint: { x: 20, y: 20 }, view: { ...view, zoom: 1, panX: 0, panY: 0 }, privacyMode: 'NORMAL', analysisMaxEdge: 256 }); await b; resolveA({ target: 'LOCAL', modelId: 'm', modelVersion: '1', latencyMs: 9, candidates: [{ ...candidate(200), width: 256, height: 128, alpha: new Uint8Array(256 * 128).fill(200) }] }); await a; assert.equal(service.snapshot().alpha[0], 80); });
test('local unavailable preserves manual brush fallback and privacy is passed through', async () => { let privacy = ''; const { service } = fixture(async i => { privacy = i.privacyMode; throw new Error('WASM unavailable'); }); service.start({ imageArtifactId: 'i', width: 20, height: 20 }); const result = await service.smartPoint({ displayPoint: { x: 4, y: 4 }, view: { displayWidth: 20, displayHeight: 20, originalWidth: 20, originalHeight: 20 }, privacyMode: 'LOCAL_ONLY' }); assert.equal(privacy, 'LOCAL_ONLY'); assert.equal(result.state, 'LOCAL_UNAVAILABLE'); service.setMode('BRUSH_ADD'); assert.doesNotThrow(() => service.brush({ points: [{ x: 4, y: 4 }], radius: 3, hardness: .5, view: { displayWidth: 20, displayHeight: 20, originalWidth: 20, originalHeight: 20 } })); });
test('quality flags empty, tiny and suspicious full masks', () => { assert.equal(assessMask(new Uint8Array(100), 10, 10, 1).warning, 'EMPTY'); const tiny = new Uint8Array(20000); tiny[0] = 255; assert.equal(assessMask(tiny, 200, 100, 1).warning, 'TINY'); assert.equal(assessMask(new Uint8Array(100).fill(255), 10, 10, 1).warning, 'SUSPICIOUSLY_FULL'); });

test('Core-authorized segmentation binds ticket, local runtime, quarantine upload and canonical result', async () => {
  const analysis = { originalWidth: 4, originalHeight: 4, analysisWidth: 2, analysisHeight: 2, scaleX: .5, scaleY: .5, offsetX: 0, offsetY: 0 };
  const points = [{ x: 1, y: 1, label: 'POSITIVE' as const, coordinateSpace: 'ORIGINAL' as const }];
  let uploaded: Uint8Array | undefined; let submitted: any; let localCalls = 0;
  const local: InteractiveSegmentationPort = {
    cancel() {},
    async segment() { localCalls++; return { target: 'LOCAL', modelId: 'mobilesam-vit-t', modelVersion: '1.0.2', runtime: 'WASM', accelerator: 'wasm', memoryBytes: 4096, latencyMs: 7, candidates: [{ alpha: new Uint8Array([255, 0, 0, 255]), width: 2, height: 2, coordinateSpace: 'ANALYSIS', score: .95 }] }; },
  };
  const core = {
    async prepareSegmentation() {
      return { executionId: 'execution-1', ticket: { ticketId: 'ticket-1', version: '1' as const, issuer: 'CORE' as const, requestId: 'execution-1', workflowId: 'execution-1', stepId: 'interactive-segmentation', operation: { id: 'interactive-segmentation', version: '1', type: 'segment', capability: 'local:mobilesam:segment:v1', parameters: { selectionRequestId: 'request-1', analysis, points } }, scope: { tenantId: 't', projectId: 'p', userId: 'u' }, inputs: [{ artifactId: 'image-1', kind: 'image', role: 'ORIGINAL' as const }], expectedOutputs: [{ kind: 'mask', role: 'MASK' as const, count: 1, mimeTypes: ['application/octet-stream'], width: 4, height: 4 }], allowedModels: [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }], policy: 'LOCAL_ONLY' as const, idempotencyKey: 'idem', nonce: 'nonce', issuedAt: 1, expiresAt: 9999999999999, cost: { paidCloudCredits: 0 as const, providerCalls: 0 as const } } };
    },
    async uploadMask(input: any) { uploaded = new Uint8Array(input.alpha); return { uploadId: 'upload-1', kind: 'mask', role: 'MASK' as const, sha256: 'a'.repeat(64), sizeBytes: input.alpha.length, mimeType: 'application/octet-stream', width: input.width, height: input.height }; },
    async submit(input: any) { submitted = input.result; return { executionId: 'execution-1', status: 'SUCCESS', artifactId: 'canonical-mask-1', verification: { valid: true } }; },
  };
  const adapter = new CoreAuthorizedSegmentation('p', local, core);
  const result = await adapter.segment({ requestId: 'request-1', imageArtifactId: 'image-1', analysis, points, privacyMode: 'LOCAL_ONLY' });
  assert.equal(localCalls, 1); assert.equal(result.canonicalArtifactId, 'canonical-mask-1'); assert.equal(uploaded?.length, 16); assert.equal(submitted.runtime, 'WASM'); assert.equal(submitted.accelerator, 'wasm'); assert.equal(submitted.outputs[0].uploadId, 'upload-1'); assert.deepEqual(submitted.model, { modelId: 'mobilesam-vit-t', version: '1.0.2' });
});

test('unchanged admitted mask reuses Core artifact while manual refinement invalidates it', async () => {
  let persisted = 0; let admitted = 0;
  const port: InteractiveSegmentationPort = { cancel() {}, async segment(input) { return { target: 'LOCAL', modelId: 'm', modelVersion: '1', latencyMs: 1, canonicalArtifactId: 'core-mask', candidates: [{ alpha: new Uint8Array(input.analysis.analysisWidth * input.analysis.analysisHeight).fill(255), width: input.analysis.analysisWidth, height: input.analysis.analysisHeight, coordinateSpace: 'ANALYSIS', score: .9 }] }; } };
  const artifacts: any = {
    async persist(mask: any, metadata: any) { persisted++; return { id: 'persisted-mask', kind: 'mask', role: 'MASK', state: 'AVAILABLE', producerOperationId: 'selection-confirm', scope: { tenantId: 't', projectId: 'p', userId: 'u' }, value: mask, metadata }; },
    admitted(artifactId: string, mask: any, metadata: any) { admitted++; return { id: artifactId, kind: 'mask', role: 'MASK', state: 'AVAILABLE', producerOperationId: 'interactive-segmentation', scope: { tenantId: 't', projectId: 'p', userId: 'u' }, value: mask, metadata }; },
  };
  const service = new SelectionApplicationService(port, artifacts);
  const smallView = { displayWidth: 8, displayHeight: 8, originalWidth: 8, originalHeight: 8 };
  service.start({ imageArtifactId: 'image', width: 8, height: 8 }); await service.smartPoint({ displayPoint: { x: 2, y: 2 }, view: smallView, privacyMode: 'LOCAL_ONLY' });
  assert.equal((await service.done()).id, 'core-mask'); assert.equal(admitted, 1); assert.equal(persisted, 0);
  service.start({ imageArtifactId: 'image', width: 8, height: 8 }); await service.smartPoint({ displayPoint: { x: 2, y: 2 }, view: smallView, privacyMode: 'LOCAL_ONLY' }); service.setMode('BRUSH_SUBTRACT'); service.brush({ points: [{ x: 2, y: 2 }], radius: 1, hardness: 1, view: smallView });
  assert.equal((await service.done()).id, 'persisted-mask'); assert.equal(persisted, 1);
});
