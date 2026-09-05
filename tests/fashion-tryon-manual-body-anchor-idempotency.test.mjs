import assert from 'node:assert/strict';
import test from 'node:test';
import { createCanonicalTryOnManualPrerequisiteApplication } from '../src/application/fashion/createCanonicalTryOnManualPrerequisiteApplication.js';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const KEY_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const KEY_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const KEY_C = 'cccccccc-3333-4333-8333-333333333333';
const SOURCE = 'canonical-source';
const ANCHORS = Object.freeze({
  leftShoulder: Object.freeze([0.2, 0.2]),
  rightShoulder: Object.freeze([0.8, 0.2]),
  leftHip: Object.freeze([0.3, 0.8]),
  rightHip: Object.freeze([0.7, 0.8]),
});

function appWith({ acquire, keys }) {
  let keyIndex = 0;
  const app = createCanonicalTryOnManualPrerequisiteApplication({
    garments: { get: async () => { throw new Error('unused'); } },
    wardrobe: { get: async () => { throw new Error('unused'); } },
    fashion: {
      admitManualParametricRepresentation: async () => { throw new Error('unused'); },
      acquireManualBodyAnchors: acquire,
    },
    createIdempotencyKey: () => keys[Math.min(keyIndex++, keys.length - 1)],
  });
  return { app, keyCount: () => keyIndex };
}

const save = (anchors = ANCHORS, sourceArtifactId = SOURCE) => ({
  projectId: PROJECT,
  sourceArtifactId,
  anchors,
});

test('ambiguous body-anchor failure retains one private key and exact explicit retry reuses it', async () => {
  const calls = [];
  let attempt = 0;
  const { app, keyCount } = appWith({
    keys: [KEY_A, KEY_B],
    acquire: async (projectId, payload) => {
      calls.push({ projectId, payload });
      attempt += 1;
      if (attempt === 1) throw Object.assign(new Error('connection reset after commit may be ambiguous'), { code: 'network_error' });
      return { anchorSetId: 'must-not-escape' };
    },
  });

  await assert.rejects(() => app.saveBodyAnchors(save()), /connection reset/);
  const result = await app.saveBodyAnchors(save());
  assert.deepEqual(result, { status: 'SAVED' });
  assert.equal(keyCount(), 1);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].payload.idempotencyKey, KEY_A);
  assert.equal(calls[1].payload.idempotencyKey, KEY_A);
  assert.equal(JSON.stringify(result).includes(KEY_A), false);
});

test('changed source or payload after a failed Save receives a new key instead of rebinding the uncertain intent', async () => {
  const calls = [];
  const { app, keyCount } = appWith({
    keys: [KEY_A, KEY_B, KEY_C],
    acquire: async (_projectId, payload) => {
      calls.push(payload);
      if (calls.length < 3) throw new Error('ambiguous');
      return {};
    },
  });

  await assert.rejects(() => app.saveBodyAnchors(save()), /ambiguous/);
  await assert.rejects(() => app.saveBodyAnchors(save(ANCHORS, 'different-source')), /ambiguous/);
  const changedAnchors = { ...ANCHORS, leftHip: [0.31, 0.8] };
  await app.saveBodyAnchors(save(changedAnchors, 'different-source'));

  assert.equal(keyCount(), 3);
  assert.deepEqual(calls.map(value => value.idempotencyKey), [KEY_A, KEY_B, KEY_C]);
});

test('successful Save destroys the previous key so a later explicit Save is a new intent', async () => {
  const calls = [];
  const { app, keyCount } = appWith({
    keys: [KEY_A, KEY_B],
    acquire: async (_projectId, payload) => { calls.push(payload); return {}; },
  });

  await app.saveBodyAnchors(save());
  await app.saveBodyAnchors(save());
  assert.equal(keyCount(), 2);
  assert.deepEqual(calls.map(value => value.idempotencyKey), [KEY_A, KEY_B]);
});

test('invalid generated key fails before transport and never enters browser-visible result state', async () => {
  let calls = 0;
  const { app } = appWith({
    keys: ['not-a-uuid'],
    acquire: async () => { calls += 1; },
  });
  await assert.rejects(() => app.saveBodyAnchors(save()), /idempotency key must be a UUID/);
  assert.equal(calls, 0);
});
