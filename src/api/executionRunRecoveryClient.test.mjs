import assert from 'node:assert/strict';
import test from 'node:test';
import { createExecutionRunRecoveryClient } from './executionRunRecoveryClient.js';

const projectId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';

function response(status, data) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  };
}

test('recovery client exposes exactly three GET-only scoped reads', async () => {
  const calls = [];
  const client = createExecutionRunRecoveryClient({
    apiRoot: 'https://core.example.test/api/core/',
    fetcher: async (url, options) => {
      calls.push({ url, options });
      if (url.includes('/children?')) return response(200, { parent: { runId }, runs: [] });
      if (url.includes(`/execution-runs/${runId}?`)) return response(200, { runId });
      return response(200, { runs: [] });
    },
  });

  assert.deepEqual(Object.keys(client).sort(), ['get', 'listChildren', 'listRoots']);
  await client.listRoots(projectId, 7);
  await client.get(runId, projectId);
  await client.listChildren(runId, projectId, 9);

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(({ options }) => options.method), ['GET', 'GET', 'GET']);
  assert.equal(calls.every(({ options }) => options.credentials === 'include'), true);
  assert.equal(calls.every(({ options }) => options.body === undefined), true);
  assert.equal(calls.every(({ options }) => options.headers.Accept === 'application/json'), true);
  assert.equal(calls[0].url, `https://core.example.test/api/core/execution-runs?projectId=${projectId}&limit=7`);
  assert.equal(calls[1].url, `https://core.example.test/api/core/execution-runs/${runId}?projectId=${projectId}`);
  assert.equal(calls[2].url, `https://core.example.test/api/core/execution-runs/${runId}/children?projectId=${projectId}&limit=9`);
});

test('recovery client rejects invalid scope and unbounded limits before network access', () => {
  let calls = 0;
  const client = createExecutionRunRecoveryClient({
    fetcher: async () => { calls += 1; return response(200, { runs: [] }); },
  });

  assert.throws(() => client.listRoots('not-a-project', 10), /projectId must be a UUID/);
  assert.throws(() => client.listRoots(projectId, 0), /limit must be an integer from 1 to 100/);
  assert.throws(() => client.listChildren(runId, projectId, 101), /limit must be an integer from 1 to 100/);
  assert.throws(() => client.get('bad-run', projectId), /runId must be a UUID/);
  assert.equal(calls, 0);
});

test('recovery client preserves server error classification without exposing a mutation fallback', async () => {
  const client = createExecutionRunRecoveryClient({
    fetcher: async () => response(404, { error: 'execution_run_not_found', message: 'Execution run is unavailable in this scope', correlationId: 'corr-1' }),
  });

  await assert.rejects(
    () => client.get(runId, projectId),
    (error) => error.status === 404 && error.code === 'execution_run_not_found' && error.correlationId === 'corr-1',
  );
  assert.equal('request' in client, false);
  assert.equal('cancel' in client, false);
  assert.equal('retry' in client, false);
  assert.equal('issue' in client, false);
});
