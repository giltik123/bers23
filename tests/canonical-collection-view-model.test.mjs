import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCanonicalCollectionViewModel,
  sortCollections,
} from '../src/application/fashion/canonicalCollectionViewModel.js';

const A = Object.freeze({ id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'A', revision: 4, garmentIds: [], updatedAt: '2026-09-03T00:00:00.000Z' });
const B = Object.freeze({ id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'B', revision: 7, garmentIds: [], updatedAt: '2026-09-03T01:00:00.000Z' });
const G = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function harness() {
  const calls = [];
  const client = {
    list: async () => [A, B],
    create: async (input) => { calls.push(['create', input]); return A; },
    updateMetadata: async (...args) => { calls.push(['updateMetadata', ...args]); return { ...A, revision: 5 }; },
    remove: async (...args) => { calls.push(['remove', ...args]); },
    addGarment: async (...args) => { calls.push(['addGarment', ...args]); return { ...A, revision: 5, garmentIds: [G] }; },
    removeGarment: async (...args) => { calls.push(['removeGarment', ...args]); return { ...A, revision: 5, garmentIds: [] }; },
    moveGarment: async (input) => {
      calls.push(['moveGarment', input]);
      return {
        source: { ...A, revision: 5, garmentIds: [] },
        target: { ...B, revision: 8, garmentIds: [G] },
        targetChanged: true,
      };
    },
  };
  return { model: createCanonicalCollectionViewModel({ collections: client }), calls };
}

test('load returns deterministic latest-first collection projection', async () => {
  const { model } = harness();
  assert.deepEqual((await model.load()).map((item) => item.id), [B.id, A.id]);
  assert.deepEqual(sortCollections([A, B]).map((item) => item.id), [B.id, A.id]);
});

test('membership add/remove binds the exact collection revision', async () => {
  const { model, calls } = harness();
  await model.addGarment(A, G);
  await model.removeGarment({ ...A, revision: 5 }, G);
  assert.deepEqual(calls, [
    ['addGarment', A.id, 4, G],
    ['removeGarment', A.id, 5, G],
  ]);
});

test('move is one atomic dual-revision client intent and never degrades to remove plus add', async () => {
  const { model, calls } = harness();
  const result = await model.moveGarment(A, B, G);
  assert.equal(result.source.revision, 5);
  assert.equal(result.target.revision, 8);
  assert.deepEqual(calls, [[
    'moveGarment',
    {
      sourceCollectionId: A.id,
      targetCollectionId: B.id,
      garmentId: G,
      expectedSourceRevision: 4,
      expectedTargetRevision: 7,
    },
  ]]);
});

test('same-source move and malformed collection intent fail before side effects', async () => {
  const { model, calls } = harness();
  await assert.rejects(() => model.moveGarment(A, A, G), /different/);
  await assert.rejects(() => model.addGarment({ id: A.id, revision: 0 }, G), /canonical collection snapshot/);
  assert.deepEqual(calls, []);
});
