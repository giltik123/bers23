import assert from 'node:assert/strict';
import test from 'node:test';
import { SelectionApplicationService } from '../src/application/selection/SelectionApplicationService';

function harness() {
  const persisted: { mask: any; metadata: any }[] = [];
  const service = new SelectionApplicationService(
    { segment: async () => { throw new Error('Manual brushes must never trigger AI segmentation'); }, cancel() {} },
    {
      async persist(mask: any, metadata: any) {
        persisted.push({ mask, metadata });
        return { id: 'canonical-mask', role: 'MASK', state: 'AVAILABLE', value: mask, metadata } as any;
      },
    },
  );
  const view = { displayWidth: 16, displayHeight: 16, originalWidth: 16, originalHeight: 16 };
  const point = { x: 8, y: 8 };
  service.start({ imageArtifactId: 'canonical-image', width: 16, height: 16 });
  service.setMode('BRUSH_ADD');
  return { service, persisted, view, point };
}

test('100% brush opacity matches established opaque canonical mask behavior', () => {
  const { service, point, view } = harness();
  const result = service.brush({ points: [point], radius: 2, hardness: 1, view });
  assert.equal(result.alpha[8 * 16 + 8], 255);
  assert.equal(result.quality?.empty, false);
});

test('partial brush opacity produces real bounded alpha that survives undo, redo and Core persistence', async () => {
  const { service, persisted, point, view } = harness();
  const result = service.brush({ points: [point], radius: 2, hardness: 1, opacity: .5, view });
  assert.equal(result.alpha[8 * 16 + 8], 128);
  assert.equal(result.canUndo, true);
  assert.equal(service.undo().alpha[8 * 16 + 8], 0);
  assert.equal(service.redo().alpha[8 * 16 + 8], 128);
  const stored = await service.done();
  assert.equal((stored.value as any).alpha[8 * 16 + 8], 128);
  assert.equal(persisted.length, 1);
  assert.equal(persisted[0].metadata.sourceImageArtifactId, 'canonical-image');
  assert.equal(persisted[0].metadata.encoding, 'ALPHA_8_LOSSLESS');
  assert.equal(persisted[0].metadata.coordinateSpace, 'ORIGINAL');
});

test('subtract brush respects opacity and never underflows mask alpha', () => {
  const { service, point, view } = harness();
  service.brush({ points: [point], radius: 2, hardness: 1, view });
  service.setMode('BRUSH_SUBTRACT');
  const faded = service.brush({ points: [point], radius: 2, hardness: 1, opacity: .25, view });
  assert.equal(faded.alpha[8 * 16 + 8], 191);
  const cleared = service.brush({ points: [point], radius: 2, hardness: 1, opacity: 1, view });
  assert.equal(cleared.alpha[8 * 16 + 8], 0);
  assert.equal(service.undo().alpha[8 * 16 + 8], 191);
});

test('zero opacity makes no paint and cannot manufacture a usable empty mask', async () => {
  const { service, persisted, point, view } = harness();
  const transparent = service.brush({ points: [point], radius: 2, hardness: 1, opacity: 0, view });
  assert.equal(transparent.quality?.empty, true);
  assert.equal(transparent.alpha.every(value => value === 0), true);
  await assert.rejects(service.done(), /empty selection/);
  assert.equal(persisted.length, 0);
});

test('unsafe brush opacity is rejected without changing authoritative selection state', () => {
  for (const opacity of [-.01, 1.01, NaN, Infinity, -Infinity]) {
    const { service, point, view } = harness();
    const before = [...service.snapshot().alpha];
    assert.throws(
      () => service.brush({ points: [point], radius: 2, hardness: 1, opacity, view }),
      /Invalid brush stroke/,
    );
    assert.deepEqual([...service.snapshot().alpha], before);
    assert.equal(service.snapshot().canUndo, false);
  }
});
