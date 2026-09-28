import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_SELECTION_MORPHOLOGY_DIMENSION, MAX_SELECTION_MORPHOLOGY_RADIUS, MAX_SELECTION_POLYGON_VERTICES, MAX_SELECTION_SHAPE_NUDGE_PIXELS, MIN_SELECTION_LASSO_SAMPLE_PIXELS, SelectionApplicationService, assessMask, chooseAnalysis, composeSelectionMask, featherSelectionMask, morphSelectionMask, rasterizeSelectionEllipse, rasterizeSelectionPolygon, rasterizeSelectionRectangle } from '../src/application/selection';
import { CoreAuthorizedSegmentation } from '../src/application/selection/CoreAuthorizedSegmentation';
import { displayToOriginal } from '../src/platform/creative/pipeline/ControlledLocalEdit';
import { DeviceAnalyzer } from '../src/platform/creative/local-ai/device/DeviceAnalyzer';
import { MOBILE_SAM_BROWSER_MODEL } from '../src/platform/creative/local-ai/browser/MobileSamCapability';
import type { InteractiveSegmentationPort, SelectionCandidate } from '../src/application/selection';
import type { ModelManifest } from '../src/platform/creative/local-ai';

const view = { displayWidth: 400, displayHeight: 300, originalWidth: 1000, originalHeight: 500, zoom: 2, panX: 10, panY: -5 };
const candidate = (value = 255): SelectionCandidate => ({ alpha: new Uint8Array(512 * 256).fill(value), width: 512, height: 256, coordinateSpace: 'ANALYSIS', score: .9 });
const INPUT_HASH = 'f'.repeat(64);
const approvedModel: ModelManifest = Object.freeze({ ...MOBILE_SAM_BROWSER_MODEL, status: 'READY' as const });
const approvedAdmission = { async admit(model: ModelManifest) { return { allowed: true as const, model, device: { tier: 'MEDIUM' }, runtimes: { WASM: true, WEBGPU: 'UNKNOWN' }, suitability: { modelId: model.modelId, eligible: true, score: 1, factors: {}, reasons: [] }, resource: { allowed: true, reasons: [], suggestedTarget: 'LOCAL' } } as any; } };
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
function localTicket(analysis: any, points: any) {
  return { ticketId: 'ticket-1', version: '1' as const, issuer: 'CORE' as const, requestId: 'execution-1', workflowId: 'execution-1', stepId: 'interactive-segmentation', operation: { id: 'interactive-segmentation', version: '1', type: 'segment', capability: 'local:mobilesam:segment:v1', parameters: { selectionRequestId: 'request-1', analysis, points } }, scope: { tenantId: 't', projectId: 'p', userId: 'u' }, inputs: [{ artifactId: 'image-1', kind: 'image', role: 'ORIGINAL' as const, sha256: INPUT_HASH }], expectedOutputs: [{ kind: 'mask', role: 'MASK' as const, count: 1, mimeTypes: ['application/octet-stream'], width: 4, height: 4 }], allowedModels: [{ modelId: 'mobilesam-vit-t', version: '1.0.2' }], policy: 'LOCAL_ONLY' as const, idempotencyKey: 'idem', nonce: 'nonce', issuedAt: 1, expiresAt: 9999999999999, cost: { paidCloudCredits: 0 as const, providerCalls: 0 as const } };
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

test('>2MP Smart Select stays analysis-bounded but persists exact ORIGINAL-resolution aligned MASK bytes', async () => {
  const width = 2048, height = 1025, pixels = width * height;
  assert.ok(pixels > 2_000_000);
  let seen: any;
  const { service, persisted } = fixture(async input => {
    seen = input;
    const alpha = new Uint8Array(input.analysis.analysisWidth * input.analysis.analysisHeight);
    const cx = Math.floor(input.analysis.analysisWidth / 2);
    const cy = Math.floor(input.analysis.analysisHeight / 2);
    alpha[cy * input.analysis.analysisWidth + cx] = 255;
    return {
      target: 'LOCAL',
      modelId: 'm',
      modelVersion: '1',
      latencyMs: 1,
      candidates: [{ alpha, width: input.analysis.analysisWidth, height: input.analysis.analysisHeight, coordinateSpace: 'ANALYSIS', score: .99 }],
    };
  });
  const largeView = { displayWidth: width, displayHeight: height, originalWidth: width, originalHeight: height, zoom: 1, panX: 0, panY: 0 };
  service.start({ imageArtifactId: 'large-source', width, height });
  const selected = await service.smartPoint({
    displayPoint: { x: width / 2, y: height / 2 },
    view: largeView,
    privacyMode: 'LOCAL_ONLY',
    analysisMaxEdge: 512,
  });
  assert.ok(seen.analysis.analysisWidth <= 512 && seen.analysis.analysisHeight <= 512, 'analysis must remain bounded below ORIGINAL resolution');
  assert.equal(seen.analysis.originalWidth, width);
  assert.equal(seen.analysis.originalHeight, height);
  assert.equal(selected.width, width);
  assert.equal(selected.height, height);
  assert.equal(selected.alpha.length, pixels);
  const analysisCenterX = Math.floor(seen.analysis.analysisWidth / 2);
  const analysisCenterY = Math.floor(seen.analysis.analysisHeight / 2);
  const projectedX = Math.ceil(analysisCenterX * width / seen.analysis.analysisWidth);
  const projectedY = Math.ceil(analysisCenterY * height / seen.analysis.analysisHeight);
  const projectedIndex = projectedY * width + projectedX;
  assert.equal(Math.floor(projectedX * seen.analysis.analysisWidth / width), analysisCenterX);
  assert.equal(Math.floor(projectedY * seen.analysis.analysisHeight / height), analysisCenterY);
  assert.ok(selected.alpha[projectedIndex] > 0, 'analysis candidate must upscale into its exact ORIGINAL projected cell');

  service.setMode('BRUSH_SUBTRACT');
  const refined = service.brush({ points: [{ x: projectedX, y: projectedY }], radius: 3, hardness: 1, view: largeView });
  assert.equal(refined.alpha.length, pixels);
  assert.equal(refined.alpha[projectedIndex], 0, 'manual refinement must address the exact projected ORIGINAL coordinate on >2MP masks');
  assert.ok(service.undo().alpha[projectedIndex] > 0, 'undo must restore the full-resolution Smart Select bytes');
  assert.equal(service.redo().alpha[projectedIndex], 0, 'redo must restore the full-resolution manual refinement');

  const grown = service.grow(1);
  assert.equal(grown.width, width);
  assert.equal(grown.height, height);
  assert.equal(grown.alpha.length, pixels);
  const artifact = await service.done();
  assert.equal(artifact.role, 'MASK');
  assert.equal((artifact.value as any).coordinateSpace, 'ORIGINAL');
  assert.equal((artifact.value as any).width, width);
  assert.equal((artifact.value as any).height, height);
  assert.equal((artifact.value as any).alpha.length, pixels);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].metadata.sourceImageArtifactId, 'large-source');
  assert.equal(persisted[0].metadata.encoding, 'ALPHA_8_LOSSLESS');
});

test('Cancel discards transient history without persistence', () => { const { service, persisted } = fixture(); service.start({ imageArtifactId: 'i', width: 10, height: 10 }); service.setMode('BRUSH_ADD'); service.brush({ points: [{ x: 2, y: 2 }], radius: 2, hardness: 1, view: { displayWidth: 10, displayHeight: 10, originalWidth: 10, originalHeight: 10 } }); service.cancel(); assert.equal(persisted.length, 0); assert.throws(() => service.snapshot(), /No active/); });
test('late A cannot replace B', async () => { let resolveA!: (v: any) => void; const { service } = fixture(i => i.requestId.endsWith(':2') ? new Promise(r => resolveA = r) : Promise.resolve({ target: 'LOCAL', modelId: 'm', modelVersion: '1', latencyMs: 1, candidates: [{ ...candidate(80), width: 256, height: 128, alpha: new Uint8Array(256 * 128).fill(80) }] })); service.start({ imageArtifactId: 'i', width: 1000, height: 500 }); const a = service.smartPoint({ displayPoint: { x: 10, y: 10 }, view: { ...view, zoom: 1, panX: 0, panY: 0 }, privacyMode: 'NORMAL', analysisMaxEdge: 256 }); const b = service.smartPoint({ displayPoint: { x: 20, y: 20 }, view: { ...view, zoom: 1, panX: 0, panY: 0 }, privacyMode: 'NORMAL', analysisMaxEdge: 256 }); await b; resolveA({ target: 'LOCAL', modelId: 'm', modelVersion: '1', latencyMs: 9, candidates: [{ ...candidate(200), width: 256, height: 128, alpha: new Uint8Array(256 * 128).fill(200) }] }); await a; assert.equal(service.snapshot().alpha[0], 80); });
test('local unavailable preserves manual brush fallback and privacy is passed through', async () => { let privacy = ''; const { service } = fixture(async i => { privacy = i.privacyMode; throw new Error('WASM unavailable'); }); service.start({ imageArtifactId: 'i', width: 20, height: 20 }); const result = await service.smartPoint({ displayPoint: { x: 4, y: 4 }, view: { displayWidth: 20, displayHeight: 20, originalWidth: 20, originalHeight: 20 }, privacyMode: 'LOCAL_ONLY' }); assert.equal(privacy, 'LOCAL_ONLY'); assert.equal(result.state, 'LOCAL_UNAVAILABLE'); service.setMode('BRUSH_ADD'); assert.doesNotThrow(() => service.brush({ points: [{ x: 4, y: 4 }], radius: 3, hardness: .5, view: { displayWidth: 20, displayHeight: 20, originalWidth: 20, originalHeight: 20 } })); });
test('manual brush hardness maps exactly into deterministic ALPHA_8 falloff', () => {
  const view = { displayWidth: 5, displayHeight: 5, originalWidth: 5, originalHeight: 5 };

  const soft = fixture().service;
  soft.start({ imageArtifactId: 'soft', width: 5, height: 5 });
  soft.setMode('BRUSH_ADD');
  const softMask = soft.brush({ points: [{ x: 2, y: 2 }], radius: 2, hardness: 0, view }).alpha;
  assert.equal(softMask[2 * 5 + 2], 255);
  assert.equal(softMask[2 * 5 + 1], 128);
  assert.equal(softMask[2 * 5 + 0], 0);

  const hard = fixture().service;
  hard.start({ imageArtifactId: 'hard', width: 5, height: 5 });
  hard.setMode('BRUSH_ADD');
  const hardMask = hard.brush({ points: [{ x: 2, y: 2 }], radius: 2, hardness: 1, view }).alpha;
  assert.equal(hardMask[2 * 5 + 2], 255);
  assert.equal(hardMask[2 * 5 + 1], 255);
  assert.equal(hardMask[2 * 5 + 0], 255);

  assert.throws(() => hard.brush({ points: [{ x: 2, y: 2 }], radius: 2, hardness: -0.01, view }), /Invalid brush stroke/);
  assert.throws(() => hard.brush({ points: [{ x: 2, y: 2 }], radius: 2, hardness: 1.01, view }), /Invalid brush stroke/);
});

test('quality flags empty, tiny and suspicious full masks', () => { assert.equal(assessMask(new Uint8Array(100), 10, 10, 1).warning, 'EMPTY'); const tiny = new Uint8Array(20000); tiny[0] = 255; assert.equal(assessMask(tiny, 200, 100, 1).warning, 'TINY'); assert.equal(assessMask(new Uint8Array(100).fill(255), 10, 10, 1).warning, 'SUSPICIOUSLY_FULL'); });

test('invert is an exact bounded manual refinement and undo redo keep quality synchronized', async () => {
  const source = new Uint8Array([0, 0, 128, 255]);
  const { service } = fixture(async input => ({
    target: 'LOCAL', modelId: 'm', modelVersion: '1', latencyMs: 1,
    candidates: [{ alpha: source, width: input.analysis.analysisWidth, height: input.analysis.analysisHeight, coordinateSpace: 'ANALYSIS', score: .9 }],
  }));
  const smallView = { displayWidth: 2, displayHeight: 2, originalWidth: 2, originalHeight: 2 };
  service.start({ imageArtifactId: 'image', width: 2, height: 2 });
  assert.throws(() => service.invert(), /not ready to invert/);
  await service.smartPoint({ displayPoint: { x: 1, y: 1 }, view: smallView, privacyMode: 'LOCAL_ONLY' });
  assert.equal(service.snapshot().state, 'SELECTED');
  assert.deepEqual([...service.snapshot().alpha], [0, 0, 128, 255]);
  const inverted = service.invert();
  assert.equal(inverted.state, 'REFINING');
  assert.deepEqual([...inverted.alpha], [255, 255, 127, 0]);
  assert.equal(inverted.quality?.coverage, .75);
  const undone = service.undo();
  assert.deepEqual([...undone.alpha], [0, 0, 128, 255]);
  assert.equal(undone.quality?.coverage, .5);
  const redone = service.redo();
  assert.deepEqual([...redone.alpha], [255, 255, 127, 0]);
  assert.equal(redone.quality?.coverage, .75);
});


test('selection grow and shrink use exact ALPHA_8 square morphology with zero-background edges', () => {
  const center = new Uint8Array(25);
  center[12] = 128;
  const grown = morphSelectionMask(center, 5, 5, 1, 'GROW');
  assert.deepEqual([...grown], [
    0,0,0,0,0,
    0,128,128,128,0,
    0,128,128,128,0,
    0,128,128,128,0,
    0,0,0,0,0,
  ]);

  const block = new Uint8Array(25);
  for (let y=1;y<=3;y++) for (let x=1;x<=3;x++) block[y*5+x]=255;
  const shrunk = morphSelectionMask(block, 5, 5, 1, 'SHRINK');
  assert.deepEqual([...shrunk], [
    0,0,0,0,0,
    0,0,0,0,0,
    0,0,255,0,0,
    0,0,0,0,0,
    0,0,0,0,0,
  ]);

  const full = new Uint8Array(25).fill(255);
  const edgeShrunk = morphSelectionMask(full, 5, 5, 1, 'SHRINK');
  assert.deepEqual([...edgeShrunk], [
    0,0,0,0,0,
    0,255,255,255,0,
    0,255,255,255,0,
    0,255,255,255,0,
    0,0,0,0,0,
  ]);
});

test('selection morphology bounds radius dimensions and work before mutation', () => {
  const alpha = new Uint8Array(9).fill(255);
  assert.throws(() => morphSelectionMask(alpha, 3, 3, 1, 'UNKNOWN' as never), /kind is unsupported/);
  assert.throws(() => morphSelectionMask(alpha, 3, 3, 0, 'GROW'), /radius exceeds deterministic bounds/);
  assert.throws(() => morphSelectionMask(alpha, 3, 3, MAX_SELECTION_MORPHOLOGY_RADIUS + 1, 'SHRINK'), /radius exceeds deterministic bounds/);
  assert.throws(() => morphSelectionMask(new Uint8Array(1), MAX_SELECTION_MORPHOLOGY_DIMENSION + 1, 1, 1, 'GROW'), /dimensions exceed deterministic bounds/);
  assert.deepEqual([...alpha], new Array(9).fill(255), 'hostile morphology input must not mutate source bytes');
});


test('selection feather is an exact zero-padded square box blur with one final round-to-nearest', () => {
  const center = new Uint8Array(25);
  center[12] = 255;
  const feathered = featherSelectionMask(center, 5, 5, 1);
  assert.deepEqual([...feathered], [
    0,0,0,0,0,
    0,28,28,28,0,
    0,28,28,28,0,
    0,28,28,28,0,
    0,0,0,0,0,
  ]);

  const full = new Uint8Array(9).fill(255);
  assert.deepEqual([...featherSelectionMask(full, 3, 3, 1)], [
    113,170,113,
    170,255,170,
    113,170,113,
  ]);
});

test('selection feather bounds radius dimensions and preserves input bytes', () => {
  const alpha = new Uint8Array([0, 64, 128, 192, 255, 192, 128, 64, 0]);
  const before = [...alpha];
  assert.throws(() => featherSelectionMask(alpha, 3, 3, 0), /radius exceeds deterministic bounds/);
  assert.throws(() => featherSelectionMask(alpha, 3, 3, MAX_SELECTION_MORPHOLOGY_RADIUS + 1), /radius exceeds deterministic bounds/);
  assert.throws(() => featherSelectionMask(new Uint8Array(1), MAX_SELECTION_MORPHOLOGY_DIMENSION + 1, 1, 1), /dimensions exceed deterministic bounds/);
  assert.deepEqual([...alpha], before);
});

test('grow shrink undo redo stay local and synchronize bytes provenance and quality', async () => {
  const seed = new Uint8Array(25);
  seed[12] = 255;
  const { service } = fixture(async input => ({
    target: 'LOCAL', modelId: 'm', modelVersion: '1', latencyMs: 1,
    candidates: [{ alpha: seed, width: input.analysis.analysisWidth, height: input.analysis.analysisHeight, coordinateSpace: 'ANALYSIS', score: .9 }],
  }));
  const localView = { displayWidth: 5, displayHeight: 5, originalWidth: 5, originalHeight: 5 };
  service.start({ imageArtifactId: 'image', width: 5, height: 5 });
  assert.throws(() => service.grow(1), /not ready for morphology/);
  await service.smartPoint({ displayPoint: { x: 2, y: 2 }, view: localView, privacyMode: 'LOCAL_ONLY' });

  const grown = service.grow(1);
  assert.equal(grown.provenance.at(-1), 'OPERATION_EXPANDED');
  assert.equal(grown.quality?.coverage, 9/25);
  assert.deepEqual([...grown.alpha], [...morphSelectionMask(seed, 5, 5, 1, 'GROW')]);

  const undone = service.undo();
  assert.deepEqual([...undone.alpha], [...seed]);
  assert.equal(undone.provenance.at(-1), 'SEGMENTATION');
  assert.equal(undone.quality?.coverage, 1/25);

  const redone = service.redo();
  assert.equal(redone.provenance.at(-1), 'OPERATION_EXPANDED');
  assert.deepEqual([...redone.alpha], [...grown.alpha]);

  const shrunk = service.shrink(1);
  assert.equal(shrunk.provenance.at(-1), 'OPERATION_CONTRACTED');
  assert.deepEqual([...shrunk.alpha], [...seed]);
});


test('polygon rasterization is fixed-point pixel-center even-odd and composition preserves exact alpha semantics', () => {
  const vertices = [
    { x: 1, y: 1, coordinateSpace: 'ORIGINAL' as const },
    { x: 4, y: 1, coordinateSpace: 'ORIGINAL' as const },
    { x: 4, y: 4, coordinateSpace: 'ORIGINAL' as const },
    { x: 1, y: 4, coordinateSpace: 'ORIGINAL' as const },
  ];
  const polygon = rasterizeSelectionPolygon(vertices, 5, 5);
  assert.deepEqual([...polygon], [
    0,0,0,0,0,
    0,255,255,255,0,
    0,255,255,255,0,
    0,255,255,255,0,
    0,0,0,0,0,
  ]);

  const current = new Uint8Array([0,64,128,255]);
  const shape = new Uint8Array([0,255,255,0]);
  assert.deepEqual([...composeSelectionMask(current, shape, 'REPLACE')], [0,255,255,0]);
  assert.deepEqual([...composeSelectionMask(current, shape, 'ADD')], [0,255,255,255]);
  assert.deepEqual([...composeSelectionMask(current, shape, 'SUBTRACT')], [0,0,0,255]);
  assert.deepEqual([...composeSelectionMask(current, shape, 'INTERSECT')], [0,64,128,0]);
  assert.throws(() => composeSelectionMask(current, shape, 'UNKNOWN' as never), /composition is unsupported/);
});

test('polygon rasterization validates vertex count dimensions and work before allocation', () => {
  const triangle = [
    { x: 0, y: 0, coordinateSpace: 'ORIGINAL' as const },
    { x: 2, y: 0, coordinateSpace: 'ORIGINAL' as const },
    { x: 1, y: 2, coordinateSpace: 'ORIGINAL' as const },
  ];
  assert.throws(() => rasterizeSelectionPolygon(triangle.slice(0,2), 3, 3), /at least three vertices/);
  assert.throws(() => rasterizeSelectionPolygon(new Array(MAX_SELECTION_POLYGON_VERTICES + 1).fill(triangle[0]), 3, 3), /vertex limit exceeded/);
  assert.throws(() => rasterizeSelectionPolygon(triangle, MAX_SELECTION_MORPHOLOGY_DIMENSION + 1, 1), /dimensions exceed deterministic bounds/);

  const many = Array.from({ length: MAX_SELECTION_POLYGON_VERTICES }, (_value, index) => ({
    x: index % 2 ? 8192 : 0,
    y: (index / MAX_SELECTION_POLYGON_VERTICES) * 2048,
    coordinateSpace: 'ORIGINAL' as const,
  }));
  assert.throws(() => rasterizeSelectionPolygon(many, 8192, 2048), /work exceeds deterministic bounds/);
});

test('polygon vertices use canonical display transform, survive mode changes, and first apply is undoable from empty state', () => {
  const { service } = fixture();
  const identity = { displayWidth: 5, displayHeight: 5, originalWidth: 5, originalHeight: 5 };
  service.start({ imageArtifactId: 'image', width: 5, height: 5 });
  service.setMode('POLYGON');
  for (const point of [{x:1,y:1},{x:4,y:1},{x:4,y:4},{x:1,y:4}]) service.polygonVertex({ displayPoint: point, view: identity });
  const staged = service.snapshot();
  assert.deepEqual(staged.polygonVertices.map(({x,y})=>[x,y]), [[1,1],[4,1],[4,4],[1,4]]);
  service.setMode('BRUSH_ADD');
  assert.equal(service.snapshot().polygonVertices.length, 4, 'mode changes must not discard staged polygon');
  service.setMode('POLYGON');

  const applied = service.applyPolygon('REPLACE');
  assert.equal(applied.polygonVertices.length, 0);
  assert.equal(applied.canUndo, true);
  assert.equal(applied.state, 'REFINING');
  assert.equal(applied.provenance.at(-1), 'POLYGON_REPLACE');

  const undone = service.undo();
  assert.equal(undone.state, 'NOTHING_SELECTED');
  assert.deepEqual([...undone.alpha], new Array(25).fill(0));

  const redone = service.redo();
  assert.equal(redone.state, 'REFINING');
  assert.deepEqual([...redone.alpha], [...applied.alpha]);
  assert.equal(redone.provenance.at(-1), 'POLYGON_REPLACE');
});

test('polygon vertices are quantized to exact 1/256 ORIGINAL pixels', () => {
  const { service } = fixture();
  const preciseView = { displayWidth: 100, displayHeight: 100, originalWidth: 10, originalHeight: 10 };
  service.start({ imageArtifactId: 'image', width: 10, height: 10 });
  service.setMode('POLYGON');
  service.polygonVertex({ displayPoint: { x: 12.345, y: 67.891 }, view: preciseView });
  const vertex = service.snapshot().polygonVertices[0];
  assert.equal(Number.isInteger(vertex.x * 256), true);
  assert.equal(Number.isInteger(vertex.y * 256), true);
  assert.ok(vertex.x >= 0 && vertex.x <= 10);
  assert.ok(vertex.y >= 0 && vertex.y <= 10);
});


test('lasso sampling is fixed-point bounded and reuses the exact polygon raster authority', () => {
  const { service } = fixture();
  const identity = { displayWidth: 5, displayHeight: 5, originalWidth: 5, originalHeight: 5 };
  service.start({ imageArtifactId: 'image', width: 5, height: 5 });
  service.setMode('LASSO');
  service.lassoStart({ displayPoint: { x: 1, y: 1 }, view: identity });
  service.lassoVertex({ displayPoint: { x: 1 + MIN_SELECTION_LASSO_SAMPLE_PIXELS / 4, y: 1 }, view: identity });
  assert.equal(service.snapshot().polygonVertices.length, 1, 'sub-threshold move sample must be ignored');
  service.lassoVertex({ displayPoint: { x: 4, y: 1 }, view: identity });
  service.lassoVertex({ displayPoint: { x: 4, y: 4 }, view: identity });
  service.lassoVertex({ displayPoint: { x: 1, y: 4 }, view: identity }, true);

  const staged = service.snapshot();
  assert.deepEqual(staged.polygonVertices.map(({x,y}) => [x,y]), [[1,1],[4,1],[4,4],[1,4]]);
  const expected = rasterizeSelectionPolygon(staged.polygonVertices, 5, 5);
  const applied = service.applyLasso('REPLACE');
  assert.deepEqual([...applied.alpha], [...expected]);
  assert.equal(applied.provenance.at(-1), 'LASSO_REPLACE');
  assert.equal(applied.canUndo, true);

  const undone = service.undo();
  assert.equal(undone.state, 'NOTHING_SELECTED');
  assert.deepEqual([...undone.alpha], new Array(25).fill(0));
  const redone = service.redo();
  assert.deepEqual([...redone.alpha], [...expected]);
  assert.equal(redone.provenance.at(-1), 'LASSO_REPLACE');
});

test('lasso point cap stops visibly instead of silently extending an unbounded path', () => {
  const { service } = fixture();
  const identity = { displayWidth: 1000, displayHeight: 1000, originalWidth: 1000, originalHeight: 1000 };
  service.start({ imageArtifactId: 'image', width: 1000, height: 1000 });
  service.setMode('LASSO');
  service.lassoStart({ displayPoint: { x: 0, y: 10 }, view: identity });
  for (let index = 1; index < MAX_SELECTION_POLYGON_VERTICES; index++) {
    service.lassoVertex({ displayPoint: { x: index * 3, y: 10 }, view: identity });
  }
  assert.equal(service.snapshot().polygonVertices.length, MAX_SELECTION_POLYGON_VERTICES);
  const capped = service.lassoVertex({ displayPoint: { x: 900, y: 20 }, view: identity }, true);
  assert.equal(capped.polygonVertices.length, MAX_SELECTION_POLYGON_VERTICES);
  assert.match(capped.warning ?? '', /Lasso point limit reached/);
  const cleared = service.clearLasso();
  assert.equal(cleared.polygonVertices.length, 0);
  assert.equal(cleared.warning, undefined);
});


test('rectangle and ellipse rasterization use exact ORIGINAL pixel-center geometry', () => {
  const rect = rasterizeSelectionRectangle([
    { x: 1, y: 1, coordinateSpace: 'ORIGINAL' },
    { x: 4, y: 4, coordinateSpace: 'ORIGINAL' },
  ], 5, 5);
  assert.deepEqual([...rect], [
    0,0,0,0,0,
    0,255,255,255,0,
    0,255,255,255,0,
    0,255,255,255,0,
    0,0,0,0,0,
  ]);

  const ellipse = rasterizeSelectionEllipse([
    { x: 0, y: 0, coordinateSpace: 'ORIGINAL' },
    { x: 5, y: 5, coordinateSpace: 'ORIGINAL' },
  ], 5, 5);
  assert.deepEqual([...ellipse], [
    0,255,255,255,0,
    255,255,255,255,255,
    255,255,255,255,255,
    255,255,255,255,255,
    0,255,255,255,0,
  ]);
});

test('basic shape rasterization rejects degenerate or hostile geometry before mutation', () => {
  const point = { x: 1, y: 1, coordinateSpace: 'ORIGINAL' as const };
  assert.throws(() => rasterizeSelectionRectangle([point], 5, 5), /requires two anchors/);
  assert.throws(() => rasterizeSelectionRectangle([point, point], 5, 5), /zero area/);
  assert.throws(() => rasterizeSelectionEllipse([point, point], 5, 5), /zero area/);
  assert.throws(() => rasterizeSelectionEllipse([
    { x: -1, y: 0, coordinateSpace: 'ORIGINAL' },
    { x: 2, y: 2, coordinateSpace: 'ORIGINAL' },
  ], 5, 5), /outside source bounds/);
  assert.throws(() => rasterizeSelectionRectangle([
    { x: 0, y: 0, coordinateSpace: 'ORIGINAL' },
    { x: 1, y: 1, coordinateSpace: 'ORIGINAL' },
  ], MAX_SELECTION_MORPHOLOGY_DIMENSION + 1, 1), /dimensions exceed deterministic bounds/);
});

test('rectangle and ellipse drag staging share composition history and first-apply undo semantics', () => {
  const { service } = fixture();
  const identity = { displayWidth: 5, displayHeight: 5, originalWidth: 5, originalHeight: 5 };
  service.start({ imageArtifactId: 'image', width: 5, height: 5 });
  service.setMode('RECTANGLE');
  service.shapeStart({ displayPoint: { x: 1, y: 1 }, view: identity });
  const staged = service.shapeVertex({ displayPoint: { x: 4, y: 4 }, view: identity });
  assert.equal(staged.shapeVertices.length, 2);
  const rectangle = service.applyShape('REPLACE');
  assert.equal(rectangle.provenance.at(-1), 'RECTANGLE_REPLACE');
  assert.equal(rectangle.canUndo, true);
  assert.equal(rectangle.shapeVertices.length, 0);
  assert.equal(rectangle.quality?.coverage, 9/25);
  const undone = service.undo();
  assert.equal(undone.state, 'NOTHING_SELECTED');
  assert.deepEqual([...undone.alpha], new Array(25).fill(0));
  service.redo();

  service.setMode('ELLIPSE');
  service.shapeStart({ displayPoint: { x: 0, y: 0 }, view: identity });
  service.shapeVertex({ displayPoint: { x: 5, y: 5 }, view: identity });
  const ellipse = service.applyShape('INTERSECT');
  assert.equal(ellipse.provenance.at(-1), 'ELLIPSE_INTERSECT');
  assert.equal(ellipse.state, 'REFINING');
  assert.ok(ellipse.quality?.coverage);
});


test('shape handle resize and keyboard nudge stay staged until Apply and clamp in ORIGINAL coordinates', () => {
  const { service } = fixture();
  const identity = { displayWidth: 6, displayHeight: 6, originalWidth: 6, originalHeight: 6 };
  service.start({ imageArtifactId: 'image', width: 6, height: 6 });
  service.setMode('RECTANGLE');
  service.shapeStart({ displayPoint: { x: 1, y: 1 }, view: identity });
  service.shapeVertex({ displayPoint: { x: 4, y: 4 }, view: identity });

  const before = service.snapshot();
  assert.deepEqual([...before.alpha], new Array(36).fill(0));
  assert.deepEqual(before.provenance, []);
  assert.equal(before.canUndo, false);

  const resized = service.shapeHandle({ handle: 'SE', displayPoint: { x: 5, y: 5 }, view: identity });
  assert.deepEqual(resized.shapeVertices.map(({x,y}) => [x,y]), [[1,1],[5,5]]);
  assert.deepEqual([...resized.alpha], [...before.alpha]);
  assert.deepEqual(resized.provenance, []);
  assert.equal(resized.canUndo, false);

  const clampedTopLeft = service.nudgeShape(-10, -10);
  assert.deepEqual(clampedTopLeft.shapeVertices.map(({x,y}) => [x,y]), [[0,0],[4,4]]);
  assert.deepEqual([...clampedTopLeft.alpha], [...before.alpha]);
  assert.deepEqual(clampedTopLeft.provenance, []);
  assert.equal(clampedTopLeft.canUndo, false);

  const clampedBottomRight = service.nudgeShape(10, 10);
  assert.deepEqual(clampedBottomRight.shapeVertices.map(({x,y}) => [x,y]), [[2,2],[6,6]]);
  assert.throws(() => service.nudgeShape(MAX_SELECTION_SHAPE_NUDGE_PIXELS + 1, 0), /nudge exceeds deterministic bounds/);
  assert.throws(() => service.shapeHandle({ handle: 'UNKNOWN' as never, displayPoint: { x: 3, y: 3 }, view: identity }), /handle is unsupported/);

  const applied = service.applyShape('REPLACE');
  assert.equal(applied.quality?.coverage, 16/36);
  assert.equal(applied.canUndo, true);
  assert.equal(applied.provenance.at(-1), 'RECTANGLE_REPLACE');
  const undone = service.undo();
  assert.deepEqual([...undone.alpha], new Array(36).fill(0));
});

test('shape handle resize cannot cross its opposite corner and retains 1/256 fixed-point anchors', () => {
  const { service } = fixture();
  const view = { displayWidth: 100, displayHeight: 100, originalWidth: 10, originalHeight: 10 };
  service.start({ imageArtifactId: 'image', width: 10, height: 10 });
  service.setMode('ELLIPSE');
  service.shapeStart({ displayPoint: { x: 20, y: 20 }, view });
  service.shapeVertex({ displayPoint: { x: 80, y: 80 }, view });
  const resized = service.shapeHandle({ handle: 'NW', displayPoint: { x: 95, y: 95 }, view });
  const [[left,top],[right,bottom]] = resized.shapeVertices.map(({x,y}) => [x,y]);
  assert.ok(left < right && top < bottom);
  assert.equal(Number.isInteger(left * 256), true);
  assert.equal(Number.isInteger(top * 256), true);
  assert.equal(Number.isInteger(right * 256), true);
  assert.equal(Number.isInteger(bottom * 256), true);
});

test('Core-authorized segmentation binds ticket, device admission, local runtime, quarantine upload and canonical result', async () => {
  const analysis = { originalWidth: 4, originalHeight: 4, analysisWidth: 2, analysisHeight: 2, scaleX: .5, scaleY: .5, offsetX: 0, offsetY: 0 };
  const points = [{ x: 1, y: 1, label: 'POSITIVE' as const, coordinateSpace: 'ORIGINAL' as const }];
  let uploaded: Uint8Array | undefined; let submitted: any; let localCalls = 0;
  const local: InteractiveSegmentationPort = { cancel() {}, async segment() { localCalls++; return { target: 'LOCAL', modelId: 'mobilesam-vit-t', modelVersion: '1.0.2', runtime: 'WASM', accelerator: 'wasm', memoryBytes: 4096, latencyMs: 7, candidates: [{ alpha: new Uint8Array([255, 0, 0, 255]), width: 2, height: 2, coordinateSpace: 'ANALYSIS', score: .95 }] }; } };
  const core = {
    async prepareSegmentation() { return { executionId: 'execution-1', ticket: localTicket(analysis, points) }; },
    async uploadMask(input: any) { uploaded = new Uint8Array(input.alpha); return { uploadId: 'upload-1', kind: 'mask', role: 'MASK' as const, sha256: 'a'.repeat(64), sizeBytes: input.alpha.length, mimeType: 'application/octet-stream', width: input.width, height: input.height }; },
    async submit(input: any) { submitted = input.result; return { executionId: 'execution-1', status: 'SUCCESS', artifactId: 'canonical-mask-1', verification: { valid: true } }; },
  };
  const adapter = new CoreAuthorizedSegmentation('p', local, core, approvedAdmission, approvedModel, { sha256: async () => INPUT_HASH });
  const result = await adapter.segment({ requestId: 'request-1', imageArtifactId: 'image-1', analysis, points, privacyMode: 'LOCAL_ONLY' });
  assert.equal(localCalls, 1); assert.equal(result.canonicalArtifactId, 'canonical-mask-1'); assert.equal(uploaded?.length, 16); assert.equal(submitted.runtime, 'WASM'); assert.equal(submitted.accelerator, 'wasm'); assert.equal(submitted.outputs[0].uploadId, 'upload-1'); assert.deepEqual(submitted.model, { modelId: 'mobilesam-vit-t', version: '1.0.2' }); assert.equal(submitted.benchmarkEvidence.deviceTier, 'MEDIUM');
});

test('input hash mismatch fails before local inference, upload or submit', async () => {
  const analysis = { originalWidth: 4, originalHeight: 4, analysisWidth: 2, analysisHeight: 2, scaleX: .5, scaleY: .5, offsetX: 0, offsetY: 0 };
  const points = [{ x: 1, y: 1, label: 'POSITIVE' as const, coordinateSpace: 'ORIGINAL' as const }];
  const calls = { local: 0, upload: 0, submit: 0 };
  const local: InteractiveSegmentationPort = { cancel() {}, async segment() { calls.local++; throw new Error('must not infer'); } };
  const core = { async prepareSegmentation() { return { executionId: 'execution-1', ticket: localTicket(analysis, points) }; }, async uploadMask() { calls.upload++; throw new Error('must not upload'); }, async submit() { calls.submit++; throw new Error('must not submit'); } };
  const adapter = new CoreAuthorizedSegmentation('p', local, core as any, approvedAdmission, approvedModel, { sha256: async () => 'e'.repeat(64) });
  await assert.rejects(() => adapter.segment({ requestId: 'request-1', imageArtifactId: 'image-1', analysis, points, privacyMode: 'LOCAL_ONLY' }), /SHA-256/);
  assert.deepEqual(calls, { local: 0, upload: 0, submit: 0 });
});

test('unsuitable or non-READY model fails before local inference and cannot fall through to cloud', async () => {
  const analysis = { originalWidth: 4, originalHeight: 4, analysisWidth: 2, analysisHeight: 2, scaleX: .5, scaleY: .5, offsetX: 0, offsetY: 0 };
  const points = [{ x: 1, y: 1, label: 'POSITIVE' as const, coordinateSpace: 'ORIGINAL' as const }];
  const calls = { local: 0, upload: 0, submit: 0 };
  const local: InteractiveSegmentationPort = { cancel() {}, async segment() { calls.local++; throw new Error('must not infer'); } };
  const core = { async prepareSegmentation() { return { executionId: 'execution-1', ticket: localTicket(analysis, points) }; }, async uploadMask() { calls.upload++; throw new Error('must not upload'); }, async submit() { calls.submit++; throw new Error('must not submit'); } };
  const deniedAdmission = { async admit(model: ModelManifest) { return { allowed: false as const, model, device: { tier: 'UNKNOWN' }, runtimes: { WASM: true, WEBGPU: 'UNKNOWN' }, suitability: { modelId: model.modelId, eligible: false, score: 0, factors: {}, reasons: ['Model status is QUARANTINED'] }, resource: { allowed: true, reasons: [], suggestedTarget: 'LOCAL' }, reasons: ['Model status is QUARANTINED'] } as any; } };
  const quarantined = Object.freeze({ ...approvedModel, status: 'QUARANTINED' as const });
  const adapter = new CoreAuthorizedSegmentation('p', local, core as any, deniedAdmission, quarantined, { sha256: async () => INPUT_HASH });
  await assert.rejects(() => adapter.segment({ requestId: 'request-1', imageArtifactId: 'image-1', analysis, points, privacyMode: 'LOCAL_ONLY' }), /admission blocked/);
  assert.deepEqual(calls, { local: 0, upload: 0, submit: 0 });
});

test('unknown device characteristics including tier remain UNKNOWN', async () => {
  const device = await new DeviceAnalyzer({ signals: async () => ({}) }).analyze();
  assert.equal(device.platform, 'UNKNOWN'); assert.equal(device.ramMb, 'UNKNOWN'); assert.equal(device.webgpu, 'UNKNOWN'); assert.equal(device.network, 'UNKNOWN'); assert.equal(device.tier, 'UNKNOWN');
});

test('MobileSAM candidate release is not silently promoted to READY', () => { assert.equal(MOBILE_SAM_BROWSER_MODEL.status, 'AVAILABLE'); });

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