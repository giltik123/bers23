import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreativeCanvasManager, createCreativeCanvas } from '../src/platform/creative/index.ts';

const access = { tenantId: 'tenant-1', projectId: 'project-1', userId: 'user-1' };

function setup() {
  const manager = new CreativeCanvasManager(() => 1000);
  const canvas = manager.createCreativeCanvas(access, { id: 'canvas-1', assetId: 'asset-1', width: 1024, height: 768 });
  return { manager, canvas };
}

test('создание canvas', () => {
  const { manager, canvas } = setup();
  assert.equal(canvas.status, 'EMPTY');
  assert.equal(canvas.width, 1024);
  assert.equal(manager.getCanvas(access, 'canvas-1').assetId, 'asset-1');
  assert.equal(createCreativeCanvas(access, { id: 'standalone', assetId: 'asset-2', width: 1, height: 1 }).id, 'standalone');
});

test('добавление слоя', () => {
  const { manager } = setup();
  const layer = manager.addLayer(access, 'canvas-1', { id: 'layer-original', type: 'IMAGE', name: 'Original Photo' });
  const canvas = manager.getCanvas(access, 'canvas-1');
  assert.equal(layer.type, 'IMAGE');
  assert.equal(canvas.layers.length, 1);
  assert.equal(canvas.selectedLayerId, 'layer-original');
});

test('удаление слоя', () => {
  const { manager } = setup();
  manager.addLayer(access, 'canvas-1', { id: 'layer-original', type: 'IMAGE', name: 'Original Photo' });
  manager.removeLayer(access, 'canvas-1', 'layer-original');
  assert.equal(manager.getCanvas(access, 'canvas-1').layers.length, 0);
});

test('изменение порядка слоёв', () => {
  const { manager } = setup();
  manager.addLayer(access, 'canvas-1', { id: 'background', type: 'IMAGE', name: 'Background' });
  manager.addLayer(access, 'canvas-1', { id: 'hair-mask', type: 'MASK', name: 'Hair Mask' });
  const reordered = manager.reorderLayer(access, 'canvas-1', 'hair-mask', 0);
  assert.deepEqual(reordered.layers.map((layer) => layer.id), ['hair-mask', 'background']);
});

test('создание mask', () => {
  const { manager } = setup();
  manager.addLayer(access, 'canvas-1', { id: 'hair-mask-layer', type: 'MASK', name: 'Hair Mask' });
  const mask = manager.createMask(access, 'canvas-1', { id: 'mask-1', assetId: 'asset-1', layerId: 'hair-mask-layer', region: { x: 1, y: 2, width: 10, height: 20 }, source: 'AI_GENERATED', confidence: 0.91 });
  assert.equal(mask.source, 'AI_GENERATED');
  assert.equal(manager.getCanvas(access, 'canvas-1').masks.length, 1);
});

test('local adjustment без API', () => {
  const { manager } = setup();
  manager.addLayer(access, 'canvas-1', { id: 'background', type: 'IMAGE', name: 'Background Layer' });
  const adjustment = manager.createAdjustment(access, 'canvas-1', { id: 'adjustment-1', type: 'BRIGHTNESS', value: -20, targetLayer: 'background' });
  assert.equal(adjustment.type, 'BRIGHTNESS');
  assert.equal(adjustment.value, -20);
  assert.equal(manager.getCanvas(access, 'canvas-1').adjustments.length, 1);
});

test('undo/redo', () => {
  const { manager } = setup();
  manager.addLayer(access, 'canvas-1', { id: 'layer-original', type: 'IMAGE', name: 'Original Photo' });
  assert.equal(manager.historyFor(access, 'canvas-1').length, 1);
  assert.equal(manager.undo(access, 'canvas-1').layers.length, 0);
  assert.equal(manager.redo(access, 'canvas-1').layers.length, 1);
});

test('variant creation', () => {
  const { manager } = setup();
  manager.addLayer(access, 'canvas-1', { id: 'background', type: 'IMAGE', name: 'Background' });
  manager.createAdjustment(access, 'canvas-1', { id: 'adjustment-1', type: 'TEMPERATURE', value: 12, targetLayer: 'background' });
  const variant = manager.createVariant(access, 'canvas-1', { id: 'variant-a', name: 'Variant A - warmer colors' });
  assert.equal(variant.canvasId, 'canvas-1');
  assert.equal(variant.changes.length, 2);
});

test('immutable snapshots', () => {
  const { manager } = setup();
  manager.addLayer(access, 'canvas-1', { id: 'background', type: 'IMAGE', name: 'Background', metadata: { source: 'imported' } });
  const canvas = manager.getCanvas(access, 'canvas-1');
  const operation = canvas.history[0];
  assert.equal(Object.isFrozen(canvas), true);
  assert.equal(Object.isFrozen(canvas.layers), true);
  assert.equal(Object.isFrozen(canvas.layers[0].metadata), true);
  assert.equal(Object.isFrozen(operation.before), true);
  assert.equal(Object.isFrozen(operation.after), true);
});

test('tenant isolation', () => {
  const { manager } = setup();
  assert.throws(() => manager.getCanvas({ ...access, tenantId: 'tenant-2' }, 'canvas-1'), /Tenant access denied/);
  assert.throws(() => manager.historyFor({ ...access, tenantId: 'tenant-2' }, 'canvas-1'), /Tenant access denied/);
});

test('project isolation', () => {
  const { manager } = setup();
  assert.throws(() => manager.addLayer({ ...access, projectId: 'project-2' }, 'canvas-1', { type: 'IMAGE', name: 'Blocked' }), /Project access denied/);
});

test('debug snapshot', () => {
  const { manager } = setup();
  manager.addLayer(access, 'canvas-1', { id: 'original', type: 'IMAGE', name: 'Original Photo' });
  manager.createVariant(access, 'canvas-1', { id: 'original-variant', name: 'Original' });
  const snapshot = manager.debug(access, 'canvas-1');
  assert.equal(snapshot.canvas.id, 'canvas-1');
  assert.equal(snapshot.layers.length, 1);
  assert.equal(snapshot.history.length, 1);
  assert.equal(snapshot.variants[0].name, 'Original');
});

test('forbidden imports', () => {
  const files = ['CreativeTypes.ts', 'CreativeCanvasManager.ts', 'CreativeLayerManager.ts', 'MaskManager.ts', 'AdjustmentManager.ts', 'CreativeHistory.ts', 'CreativeDebugger.ts'];
  const forbidden = /from ['"](?:\.\.\/)+(?:api|application|lib|providers|runtime|workflow|agent|adapters)/;
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), 'src/platform/creative', file), 'utf8');
    assert.equal(forbidden.test(source), false, file);
    assert.equal(/from ['"](?:react|@retired-runtime\/sdk|three|canvas|opencv)/.test(source), false, file);
  }
});
