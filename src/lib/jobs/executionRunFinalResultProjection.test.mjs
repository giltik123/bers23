import assert from 'node:assert/strict';
import test from 'node:test';
import { ExecutionRunProjection } from './executionRunProjection.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = '2026-09-07T00:00:00.000Z';

function creative(overrides = {}) {
  return Object.freeze({
    runId,
    capability: 'CREATIVE_EXECUTION',
    authorityKind: 'CREATIVE_EXECUTION',
    authorityRef: 'creative-final-result-recovery',
    status: 'SUCCEEDED',
    revision: 3,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    finishedAt: now,
    result: Object.freeze({
      kind: 'FINAL_IMAGE',
      artifactId: 'signed.final.artifact',
      imageUrl: '/api/core/artifacts/results/signed.final.delivery',
      width: 640,
      height: 480,
    }),
    ...overrides,
  });
}

function projection(root) {
  const client = Object.freeze({
    listRoots: async () => ({ runs: [root] }),
    get: async () => root,
    listChildren: async () => ({ parent: null, runs: [] }),
  });
  return new ExecutionRunProjection({
    client,
    pollIntervalMs: 15000,
    schedule: () => 'timer',
    cancelSchedule: () => undefined,
    now: () => now,
  });
}

test('browser projection preserves only the bounded authoritative Creative FINAL descriptor', async () => {
  const value = projection(creative());
  assert.equal(await value.start(projectId), true);
  const recovered = value.snapshot().runs[0];
  assert.equal(recovered.status, 'SUCCEEDED');
  assert.deepEqual(recovered.result, {
    kind: 'FINAL_IMAGE',
    artifactId: 'signed.final.artifact',
    imageUrl: '/api/core/artifacts/results/signed.final.delivery',
    width: 640,
    height: 480,
  });
  assert.equal(Object.isFrozen(recovered.result), true);
  assert.equal('storageId' in recovered.result, false);
  assert.equal('bytes' in recovered.result, false);
  value.stop();
});

test('browser projection fails closed on result attached to non-SUCCEEDED or non-Creative authority', async () => {
  const invalid = [
    creative({ status: 'RUNNING', finishedAt: undefined }),
    creative({ capability: 'LOCAL_EXECUTION', authorityKind: 'LOCAL_EXECUTION_TICKET' }),
    creative({ authorityKind: 'LOCAL_EXECUTION_TICKET' }),
  ];
  for (const candidate of invalid) {
    const value = projection(candidate);
    assert.equal(await value.start(projectId), false);
    assert.equal(value.snapshot().authoritative, false);
    assert.equal(value.snapshot().runs.length, 0);
    value.stop();
  }
});

test('browser projection rejects arbitrary navigation and malformed FINAL descriptor shapes', async () => {
  const invalidResults = [
    { kind: 'FINAL_IMAGE', artifactId: 'signed.final.artifact', imageUrl: 'https://evil.example/final.png', width: 640, height: 480 },
    { kind: 'FINAL_IMAGE', artifactId: 'signed.final.artifact', imageUrl: 'javascript:alert(1)', width: 640, height: 480 },
    { kind: 'FINAL_IMAGE', artifactId: 'signed.final.artifact', imageUrl: '/api/core/artifacts/results/token?redirect=evil', width: 640, height: 480 },
    { kind: 'FUTURE_RESULT', artifactId: 'signed.final.artifact', imageUrl: '/api/core/artifacts/results/token', width: 640, height: 480 },
    { kind: 'FINAL_IMAGE', artifactId: '', imageUrl: '/api/core/artifacts/results/token', width: 640, height: 480 },
    { kind: 'FINAL_IMAGE', artifactId: 'signed.final.artifact', imageUrl: '/api/core/artifacts/results/token', width: 0, height: 480 },
  ];
  for (const result of invalidResults) {
    const value = projection(creative({ result }));
    assert.equal(await value.start(projectId), false);
    assert.equal(value.snapshot().authoritative, false);
    assert.equal(value.snapshot().error.code, 'execution_run_recovery_unavailable');
    value.stop();
  }
});
