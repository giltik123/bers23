import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreativeCanvasManager, LocalEditingEngine } from '../src/platform/creative/index.ts';

const access = { tenantId: 'tenant-1', projectId: 'project-1', userId: 'user-1' };

function setup() {
  const canvasManager = new CreativeCanvasManager(() => 1000);
  canvasManager.createCreativeCanvas(access, { id: 'canvas-1', assetId: 'asset-1', width: 512, height: 512 });
  canvasManager.addLayer(access, 'canvas-1', { id: 'background', type: 'IMAGE', name: 'Background Layer' });
  const events = [];
  const historyPort = { record(event) { events.push(Object.freeze(event)); } };
  const engine = new LocalEditingEngine(canvasManager, historyPort, () => 1000);
  return { canvasManager, engine, events };
}

test('brightness без API', () => {
  const { engine } = setup();
  const result = engine.apply({ context: access, canvasId: 'canvas-1', adjustment: { type: 'BRIGHTNESS', value: -20, targetLayer: 'background' } });
  assert.equal(result.success, true);
  assert.equal(result.credits, 0);
  assert.equal(result.previewAvailable, true);
  assert.equal(result.updatedLayer?.id, 'background');
});

test('contrast pipeline', () => {
  const { engine } = setup();
  engine.apply({ context: access, canvasId: 'canvas-1', adjustment: { type: 'CONTRAST', value: 10, targetLayer: 'background' } });
  const inspection = engine.inspect({ context: access, canvasId: 'canvas-1' });
  assert.equal(inspection.appliedAdjustments[0].type, 'CONTRAST');
  assert.equal(inspection.renderDecision.output, 'PREVIEW');
});

test('несколько adjustments подряд', () => {
  const { engine } = setup();
  engine.apply({ context: access, canvasId: 'canvas-1', adjustment: { type: 'BRIGHTNESS', value: 20, targetLayer: 'background' } });
  engine.apply({ context: access, canvasId: 'canvas-1', adjustment: { type: 'CONTRAST', value: 10, targetLayer: 'background' } });
  engine.apply({ context: access, canvasId: 'canvas-1', adjustment: { type: 'SATURATION', value: -5, targetLayer: 'background' } });
  assert.deepEqual(engine.inspect({ context: access, canvasId: 'canvas-1' }).appliedAdjustments.map((adjustment) => adjustment.type), ['BRIGHTNESS', 'CONTRAST', 'SATURATION']);
});

test('undo/redo через history contract', () => {
  const { engine, events } = setup();
  const result = engine.apply({ context: access, canvasId: 'canvas-1', adjustment: { type: 'HIGHLIGHTS', value: -12, targetLayer: 'background' } });
  engine.remove({ context: access, canvasId: 'canvas-1', operationId: result.operationId });
  engine.redo({ context: access, canvasId: 'canvas-1' });
  assert.deepEqual(events.map((event) => event.type), ['operation.started', 'operation.completed', 'operation.reverted', 'operation.completed']);
});

test('preview generation', () => {
  const { engine } = setup();
  engine.apply({ context: access, canvasId: 'canvas-1', adjustment: { type: 'TEMPERATURE', value: 15, targetLayer: 'background' } });
  const preview = engine.preview({ context: access, canvasId: 'canvas-1' });
  assert.equal(preview.canvasId, 'canvas-1');
  assert.equal(preview.assetCreated, false);
  assert.equal(preview.adjustments.length, 1);
});

test('local operation cost = 0', () => {
  const { engine } = setup();
  const decision = engine.resolve({ operation: 'NOISE_REDUCTION' });
  assert.equal(decision.mode, 'LOCAL');
  assert.equal(decision.credits, 0);
  assert.equal(decision.creditsRequired, false);
});

test('AI-required operation detection', () => {
  const { engine } = setup();
  const decision = engine.resolve({ prompt: 'замени комнату на Париж' });
  assert.equal(decision.mode, 'AI');
  assert.equal(decision.provider, 'REVE');
  assert.equal(decision.creditsRequired, true);
});

test('immutable snapshots', () => {
  const { engine, events } = setup();
  const result = engine.apply({ context: access, canvasId: 'canvas-1', adjustment: { type: 'SHARPEN', value: 5, targetLayer: 'background', metadata: { source: 'slider' } } });
  const inspection = engine.inspect({ context: access, canvasId: 'canvas-1' });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.preview), true);
  assert.equal(Object.isFrozen(inspection.activePipeline), true);
  assert.equal(Object.isFrozen(inspection.appliedAdjustments[0].metadata), true);
  assert.equal(Object.isFrozen(events[1]), true);
});

test('tenant/project isolation', () => {
  const { engine } = setup();
  assert.throws(() => engine.apply({ context: { ...access, tenantId: 'tenant-2' }, canvasId: 'canvas-1', adjustment: { type: 'BRIGHTNESS', value: 1, targetLayer: 'background' } }), /Tenant access denied/);
  assert.throws(() => engine.preview({ context: { ...access, projectId: 'project-2' }, canvasId: 'canvas-1' }), /Project access denied/);
});

test('debug snapshot', () => {
  const { engine } = setup();
  engine.apply({ context: access, canvasId: 'canvas-1', adjustment: { type: 'BLUR', value: 2, targetLayer: 'background' } });
  const snapshot = engine.debug({ context: access, canvasId: 'canvas-1' });
  assert.equal(snapshot.canvas.id, 'canvas-1');
  assert.equal(snapshot.layers.length, 1);
  assert.equal(snapshot.activePipeline.length, 1);
  assert.equal(snapshot.appliedAdjustments[0].type, 'BLUR');
  assert.equal(snapshot.previewState.assetCreated, false);
  assert.equal(snapshot.renderDecision.output, 'PREVIEW');
});

test('forbidden imports', () => {
  const files = ['LocalEditingTypes.ts', 'LocalEditingEngine.ts', 'LocalPreviewEngine.ts', 'AdjustmentPipeline.ts', 'LayerRenderer.ts', 'EditCapabilityResolver.ts', 'LocalEngineDebugger.ts'];
  const forbidden = /from ['"](?:\.\.\/)+(?:api|application|lib|providers|runtime|workflow|agent|adapters|CreativeHistory)/;
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), 'src/platform/creative/local-engine', file), 'utf8');
    assert.equal(forbidden.test(source), false, file);
    assert.equal(/from ['"](?:react|@retired-runtime\/sdk|three|canvas|opencv|@tensorflow)/.test(source), false, file);
  }
});
