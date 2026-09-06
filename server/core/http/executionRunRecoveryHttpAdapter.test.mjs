import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { createExecutionRunRecoveryHttpAdapter } from './executionRunRecoveryHttpAdapter.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const tenantId = 'tenant-recovery';
const userId = 'user-recovery';
const scope = Object.freeze({ tenantId, userId, projectId });
const parentRunId = randomUUID();
const localChildRunId = randomUUID();
const internalChildRunId = randomUUID();
const now = '2026-09-06T00:00:00.000Z';

const parent = run({
  runId: parentRunId,
  capability: 'WORKFLOW_CONTINUATION',
  authorityKind: 'WORKFLOW_CONTINUATION',
  authorityRef: 'workflow-execution-recovery-1',
  status: 'RUNNING',
  revision: 2,
  startedAt: now,
});
const localChild = run({
  runId: localChildRunId,
  parentRunId,
  capability: 'LOCAL_EXECUTION',
  authorityKind: 'LOCAL_EXECUTION_TICKET',
  authorityRef: 'ticket-recovery-1',
  status: 'SUCCEEDED',
  revision: 3,
  startedAt: now,
  finishedAt: now,
});
const internalChild = run({
  runId: internalChildRunId,
  parentRunId,
  capability: 'WORKFLOW_STEP',
  authorityKind: 'WORKFLOW_INTERNAL_STEP',
  authorityRef: 'workflow-internal-step:recovery:verify',
  status: 'RUNNING',
  revision: 2,
  startedAt: now,
});

function run(overrides) {
  return Object.freeze({
    runId: randomUUID(),
    scope,
    capability: 'CREATIVE_EXECUTION',
    idempotencyKey: 'private-idempotency-key-must-not-leak',
    authorityKind: 'CREATIVE_EXECUTION',
    authorityRef: 'creative-recovery-1',
    status: 'QUEUED',
    revision: 1,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  });
}

function sameScope(candidate) {
  return candidate?.tenantId === tenantId && candidate?.userId === userId && candidate?.projectId === projectId;
}

function harness(principal = Object.freeze({ tenantId, userId })) {
  const calls = { roots: [], gets: [], children: [] };
  const reader = Object.freeze({
    listRoots: async (candidateScope, limit) => {
      calls.roots.push({ scope: candidateScope, limit });
      return sameScope(candidateScope) ? Object.freeze([parent]) : Object.freeze([]);
    },
    get: async (candidateScope, runId) => {
      calls.gets.push({ scope: candidateScope, runId });
      if (!sameScope(candidateScope)) return undefined;
      return [parent, localChild, internalChild].find(candidate => candidate.runId === runId);
    },
    listChildren: async (candidateScope, runId, limit) => {
      calls.children.push({ scope: candidateScope, runId, limit });
      return sameScope(candidateScope) && runId === parentRunId
        ? Object.freeze([localChild, internalChild])
        : Object.freeze([]);
    },
  });
  const config = Object.freeze({
    nodeEnv: 'test',
    allowApiBearerAuth: true,
    allowedWebOrigins: Object.freeze(['https://app.example.test']),
    authPublicOrigin: 'http://localhost',
    authChallengeSecret: 'recovery-test-secret',
  });
  const auth = Object.freeze({
    verify: async authorization => {
      if (authorization !== 'Bearer test.token.value') throw Object.assign(new Error('Authentication token is invalid'), { status: 401, code: 'unauthenticated' });
      return principal;
    },
  });
  return Object.freeze({ adapter: createExecutionRunRecoveryHttpAdapter({ runs: reader, auth, config }), calls });
}

async function withServer(handler, fn) {
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  try { return await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function headers(extra = {}) {
  return { authorization: 'Bearer test.token.value', origin: 'https://app.example.test', ...extra };
}

async function json(response) {
  const body = await response.json();
  return body;
}

test('root recovery is authenticated, scoped, bounded and does not expose idempotency or scope internals', async () => {
  const { adapter, calls } = harness();
  await withServer(adapter, async base => {
    const response = await fetch(`${base}/api/core/execution-runs?projectId=${projectId}&limit=2`, { headers: headers() });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.example.test');
    const body = await json(response);
    assert.equal(body.runs.length, 1);
    assert.equal(body.runs[0].runId, parentRunId);
    assert.equal(body.runs[0].capability, 'WORKFLOW_CONTINUATION');
    assert.equal(body.runs[0].authorityRef, 'workflow-execution-recovery-1');
    assert.equal('idempotencyKey' in body.runs[0], false);
    assert.equal('scope' in body.runs[0], false);
  });
  assert.deepEqual(calls.roots, [{ scope, limit: 2 }]);
});

test('exact get and direct children return the canonical run tree without mutation authority', async () => {
  const { adapter, calls } = harness();
  await withServer(adapter, async base => {
    const getResponse = await fetch(`${base}/api/core/execution-runs/${parentRunId}?projectId=${projectId}`, { headers: headers() });
    assert.equal(getResponse.status, 200);
    const getBody = await json(getResponse);
    assert.equal(getBody.runId, parentRunId);
    assert.equal(getBody.status, 'RUNNING');

    const childrenResponse = await fetch(`${base}/api/core/execution-runs/${parentRunId}/children?projectId=${projectId}&limit=2`, { headers: headers() });
    assert.equal(childrenResponse.status, 200);
    const childrenBody = await json(childrenResponse);
    assert.equal(childrenBody.parent.runId, parentRunId);
    assert.deepEqual(childrenBody.runs.map(candidate => candidate.runId), [localChildRunId, internalChildRunId]);
    assert.equal(childrenBody.runs[0].status, 'SUCCEEDED');
    assert.equal(childrenBody.runs[1].authorityKind, 'WORKFLOW_INTERNAL_STEP');
    assert.equal(childrenBody.runs.some(candidate => 'idempotencyKey' in candidate), false);

    const postResponse = await fetch(`${base}/api/core/execution-runs?projectId=${projectId}`, { method: 'POST', headers: headers() });
    assert.equal(postResponse.status, 405);
    assert.equal((await json(postResponse)).error, 'method_not_allowed');
  });
  assert.equal(calls.gets.length, 2);
  assert.deepEqual(calls.children, [{ scope, runId: parentRunId, limit: 2 }]);
});

test('cross-scope and unknown runs are existence-safe', async () => {
  const wrongUser = harness(Object.freeze({ tenantId, userId: 'other-user' }));
  await withServer(wrongUser.adapter, async base => {
    const listResponse = await fetch(`${base}/api/core/execution-runs?projectId=${projectId}`, { headers: headers() });
    assert.equal(listResponse.status, 200);
    assert.deepEqual((await json(listResponse)).runs, []);

    const getResponse = await fetch(`${base}/api/core/execution-runs/${parentRunId}?projectId=${projectId}`, { headers: headers() });
    assert.equal(getResponse.status, 404);
    assert.equal((await json(getResponse)).error, 'execution_run_not_found');

    const childrenResponse = await fetch(`${base}/api/core/execution-runs/${parentRunId}/children?projectId=${projectId}`, { headers: headers() });
    assert.equal(childrenResponse.status, 404);
    assert.equal((await json(childrenResponse)).error, 'execution_run_not_found');
  });

  const ownerHarness = harness();
  await withServer(ownerHarness.adapter, async base => {
    const response = await fetch(`${base}/api/core/execution-runs/${randomUUID()}?projectId=${projectId}`, { headers: headers() });
    assert.equal(response.status, 404);
    assert.equal((await json(response)).error, 'execution_run_not_found');
  });
});

test('invalid identifiers, limits, query authority and malformed path encoding fail closed before registry reads', async () => {
  const { adapter, calls } = harness();
  await withServer(adapter, async base => {
    const cases = [
      [`${base}/api/core/execution-runs`, 'invalid_project_id'],
      [`${base}/api/core/execution-runs?projectId=not-a-uuid`, 'invalid_project_id'],
      [`${base}/api/core/execution-runs?projectId=${projectId}&projectId=${projectId}`, 'invalid_project_id'],
      [`${base}/api/core/execution-runs?projectId=${projectId}&limit=0`, 'invalid_limit'],
      [`${base}/api/core/execution-runs?projectId=${projectId}&limit=101`, 'invalid_limit'],
      [`${base}/api/core/execution-runs?projectId=${projectId}&status=SUCCEEDED`, 'unexpected_query_parameter'],
      [`${base}/api/core/execution-runs/not-a-uuid?projectId=${projectId}`, 'invalid_run_id'],
      [`${base}/api/core/execution-runs/%E0%A4%A?projectId=${projectId}`, 'invalid_run_id'],
    ];
    for (const [url, code] of cases) {
      const response = await fetch(url, { headers: headers() });
      assert.equal(response.status, 400, url);
      assert.equal((await json(response)).error, code, url);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  });
  assert.equal(calls.roots.length, 0);
  assert.equal(calls.gets.length, 0);
  assert.equal(calls.children.length, 0);
});

test('authentication and origin policy are preserved and OPTIONS is read-only', async () => {
  const { adapter, calls } = harness();
  await withServer(adapter, async base => {
    const unauthenticated = await fetch(`${base}/api/core/execution-runs?projectId=${projectId}`);
    assert.equal(unauthenticated.status, 401);
    assert.equal((await json(unauthenticated)).error, 'unauthenticated');

    const deniedOrigin = await fetch(`${base}/api/core/execution-runs?projectId=${projectId}`, { headers: { authorization: 'Bearer test.token.value', origin: 'https://evil.example' } });
    assert.equal(deniedOrigin.status, 403);
    assert.equal((await json(deniedOrigin)).error, 'origin_denied');

    const options = await fetch(`${base}/api/core/execution-runs`, { method: 'OPTIONS', headers: { origin: 'https://app.example.test' } });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
    assert.equal(options.headers.get('cache-control'), 'no-store');
  });
  assert.equal(calls.roots.length, 0);
  assert.equal(calls.gets.length, 0);
  assert.equal(calls.children.length, 0);
});
