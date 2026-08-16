import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CreativeCanvasManager } from '../src/platform/creative/index.ts';
import { CreativeEditEngine } from '../src/platform/creative/editing/index.ts';

const access = { tenantId: 'tenant-1', projectId: 'project-1', userId: 'user-1' };

function setup() {
  const canvasManager = new CreativeCanvasManager(() => 1000);
  canvasManager.createCreativeCanvas(access, { id: 'canvas-1', assetId: 'asset-1', width: 1024, height: 1024 });
  canvasManager.addLayer(access, 'canvas-1', { id: 'face', type: 'IMAGE', name: 'Face' });
  const engine = new CreativeEditEngine(canvasManager, () => 1000);
  return { canvasManager, engine };
}

test('brightness не вызывает AI', () => {
  const { engine } = setup();
  const result = engine.apply({ ...access, canvasId: 'canvas-1', type: 'brightness', targetLayer: 'face', parameters: { value: 20 } });
  assert.equal(result.operation.source, 'LOCAL');
  assert.equal(result.operation.cost, 0);
  assert.equal(result.previewAvailable, true);
});

test('contrast не вызывает AI', () => {
  const { engine } = setup();
  const result = engine.apply({ ...access, canvasId: 'canvas-1', prompt: 'increase contrast', targetLayer: 'face', parameters: { value: 10 } });
  assert.equal(result.decision.mode, 'LOCAL');
  assert.equal(result.operation.type, 'contrast');
});

test('background replacement вызывает AI decision', () => {
  const { engine } = setup();
  const decision = engine.estimateCost({ ...access, canvasId: 'canvas-1', prompt: 'замени фон на студию' });
  assert.equal(decision.mode, 'AI');
  assert.equal(decision.workflow, 'background-replacement');
  assert.equal(decision.estimatedCost, 10);
});

test('try-on вызывает AI workflow', () => {
  const { engine } = setup();
  const result = engine.apply({ ...access, canvasId: 'canvas-1', prompt: 'сделай человека в костюме' });
  assert.equal(result.operation.source, 'AI');
  assert.equal(result.operation.workflow, 'virtual-try-on');
  assert.equal(result.operation.cost, 15);
});

test('история смешанных операций', () => {
  const { engine } = setup();
  engine.apply({ ...access, canvasId: 'canvas-1', type: 'brightness', targetLayer: 'face', parameters: { value: 12 } });
  engine.apply({ ...access, canvasId: 'canvas-1', prompt: 'сделай человека в костюме' });
  engine.apply({ ...access, canvasId: 'canvas-1', type: 'color_correction', targetLayer: 'face', parameters: { temperature: 5 } });
  assert.deepEqual(engine.history({ ...access, canvasId: 'canvas-1' }).map((operation) => [operation.type, operation.source]), [['brightness', 'LOCAL'], ['virtual_try_on', 'AI'], ['color_correction', 'LOCAL']]);
});

test('undo локальной операции', () => {
  const { engine } = setup();
  const result = engine.apply({ ...access, canvasId: 'canvas-1', type: 'brightness', targetLayer: 'face', parameters: { value: 12 } });
  const reverted = engine.undo({ ...access, canvasId: 'canvas-1' });
  assert.equal(reverted?.id, result.operation.id);
  assert.equal(reverted?.status, 'REVERTED');
});

test('undo AI операции', () => {
  const { engine } = setup();
  const result = engine.apply({ ...access, canvasId: 'canvas-1', prompt: 'сделай человека в костюме' });
  const reverted = engine.undo({ ...access, canvasId: 'canvas-1' });
  assert.equal(reverted?.id, result.operation.id);
  assert.equal(reverted?.source, 'AI');
  assert.equal(reverted?.status, 'REVERTED');
});

test('cost = 0 для local', () => {
  const { engine } = setup();
  engine.apply({ ...access, canvasId: 'canvas-1', type: 'brightness', targetLayer: 'face', parameters: { value: 20 } });
  engine.apply({ ...access, canvasId: 'canvas-1', type: 'contrast', targetLayer: 'face', parameters: { value: 10 } });
  const inspection = engine.inspect({ ...access, canvasId: 'canvas-1' });
  assert.equal(inspection.cost.localEdits, 2);
  assert.equal(inspection.cost.aiEdits, 0);
  assert.equal(inspection.cost.creditsUsed, 0);
});

test('tenant/project isolation', () => {
  const { engine } = setup();
  assert.throws(() => engine.apply({ ...access, tenantId: 'tenant-2', canvasId: 'canvas-1', type: 'brightness', targetLayer: 'face' }), /Tenant access denied/);
  assert.throws(() => engine.history({ ...access, projectId: 'project-2', canvasId: 'canvas-1' }), /Project access denied/);
});

test('immutable snapshots', () => {
  const { engine } = setup();
  const result = engine.apply({ ...access, canvasId: 'canvas-1', type: 'brightness', targetLayer: 'face', parameters: { value: 20 } });
  const history = engine.history({ ...access, canvasId: 'canvas-1' });
  const inspection = engine.inspect({ ...access, canvasId: 'canvas-1' });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.operation), true);
  assert.equal(Object.isFrozen(result.operation.parameters), true);
  assert.equal(Object.isFrozen(history), true);
  assert.equal(Object.isFrozen(inspection), true);
});

test('forbidden imports', () => {
  const files = ['CreativeOperation.ts', 'OperationType.ts', 'OperationExecutor.ts', 'EditDecisionEngine.ts', 'EditCapabilityResolver.ts', 'OperationHistory.ts', 'OperationCostTracker.ts', 'CreativeEditEngine.ts'];
  const forbidden = new RegExp("from ['\\\"](?:\\.\\./)+(?:api|application|lib|providers|runtime|workflow|agent|adapters|gateway|billing)");
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), 'src/platform/creative/editing', file), 'utf8');
    assert.equal(forbidden.test(source), false, file);
    assert.equal(new RegExp("from ['\\\"](?:react|@retired-runtime/sdk|three|canvas|opencv|@tensorflow)").test(source), false, file);
  }
});
