import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import { createBoundedAgentHttpAdapter } from './boundedAgentHttpAdapter.ts';

const sessionToken = 'aaa.bbb.ccc';
const origin = 'https://app.example.test';
const config = Object.freeze({
  nodeEnv: 'test',
  allowedWebOrigins: Object.freeze([origin]),
  authChallengeSecret: 'agent-csrf-secret',
  authPublicOrigin: 'http://localhost',
  bodyLimitBytes: 64_000,
});
const principal = Object.freeze({ tenantId: 'agent-tenant', userId: 'agent-user', sessionId: 'agent-session', scopes: Object.freeze(['transport-only']) });
const csrf = createHmac('sha256', config.authChallengeSecret).update('bers-browser-csrf-v1\0').update(sessionToken).digest('base64url');
const cookie = `bers_session_dev=${sessionToken}`;

function ticket(ticketId = 'agent-ticket-1', operation = 'ORTHOGONAL_TRANSFORM') {
  return Object.freeze({
    version: '2', issuer: 'CORE', ticketId, requestId: 'agent-child-execution', workflowId: 'agent-execution',
    stepId: operation === 'ORTHOGONAL_TRANSFORM' ? 'orthogonal-transform-v1' : 'resize-v1',
    operation: Object.freeze({ id: operation === 'ORTHOGONAL_TRANSFORM' ? 'orthogonal-transform-v1' : 'resize-v1', version: '1', type: operation, capability: `local:deterministic:${operation.toLowerCase()}:v1` }),
    scope: Object.freeze({ tenantId: principal.tenantId, userId: principal.userId, projectId: 'agent-project' }),
    inputs: Object.freeze([]), expectedOutputs: Object.freeze([]), allowedExecutors: Object.freeze([]),
    policy: 'LOCAL_ONLY', cost: Object.freeze({ providerCalls: 0, paidCloudCredits: 0 }),
    idempotencyKey: 'agent-idempotency', nonce: 'agent-nonce', expiresAt: 60_000,
  });
}
function waitingView(operation = 'ORTHOGONAL_TRANSFORM') {
  return Object.freeze({
    executionId: 'agent-execution', revision: 1, state: 'WAITING_FOR_LOCAL_RESULT',
    nextAction: Object.freeze({ type: 'LOCAL_EXECUTION', operation, ticket: ticket(undefined, operation) }),
    internalSecret: 'must-not-cross-http',
  });
}
function terminalPreview(calls = []) {
  return Object.freeze({
    async mint(scope, artifactId) {
      calls.push([scope, artifactId]);
      return `/api/core/artifacts/results/${encodeURIComponent(`delivery:${artifactId}`)}`;
    },
  });
}
function auth() {
  return Object.freeze({
    async verify(authorization) { assert.equal(authorization, `Bearer ${sessionToken}`); return principal; },
  });
}
function browserHeaders(contentType = 'application/json') {
  return { origin, cookie, 'x-bers-csrf-token': csrf, 'content-type': contentType };
}
async function withServer(handler, fn) {
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try { await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('bounded Agent HTTP start is CSRF protected, strict-field allowlisted and principal-normalized', async () => {
  const calls = [];
  const previewCalls = [];
  const workflow = {
    async start(command, caller) { calls.push(['start', command, caller]); return waitingView(); },
    async resume() { throw new Error('not used'); },
    async submitLocalResult() { throw new Error('not used'); },
    async retry() { throw new Error('not used'); },
    async cancel() { throw new Error('not used'); },
  };
  const adapter = createBoundedAgentHttpAdapter({ workflow, terminalPreview: terminalPreview(previewCalls), auth: auth(), config });

  await withServer(adapter, async base => {
    const denied = await fetch(`${base}/api/core/agent/bounded-deterministic/start`, {
      method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ clientRequestId: 'request-1', projectId: 'agent-project', sourceArtifactId: 'source-1', mode: 'ROTATE_90_CW', width: 640, height: 480 }),
    });
    assert.equal(denied.status, 403); assert.equal((await denied.json()).error, 'csrf_denied'); assert.equal(calls.length, 0);

    const forged = await fetch(`${base}/api/core/agent/bounded-deterministic/start`, {
      method: 'POST', headers: browserHeaders(),
      body: JSON.stringify({ clientRequestId: 'request-1', projectId: 'agent-project', sourceArtifactId: 'source-1', mode: 'ROTATE_90_CW', width: 640, height: 480, stepId: 'attacker-step' }),
    });
    assert.equal(forged.status, 400); assert.equal((await forged.json()).error, 'client_agent_authority_forbidden'); assert.equal(calls.length, 0);

    const started = await fetch(`${base}/api/core/agent/bounded-deterministic/start`, {
      method: 'POST', headers: browserHeaders(),
      body: JSON.stringify({ clientRequestId: 'request-1', projectId: 'agent-project', sourceArtifactId: 'source-1', mode: 'ROTATE_90_CW', width: 640, height: 480 }),
    });
    assert.equal(started.status, 202);
    const body = await started.json();
    assert.equal(body.executionId, 'agent-execution'); assert.equal(body.nextAction.operation, 'ORTHOGONAL_TRANSFORM');
    assert.equal(body.nextAction.ticket.ticketId, 'agent-ticket-1'); assert.equal(body.internalSecret, undefined);
    assert.equal(body.terminalImageUrl, undefined); assert.equal(previewCalls.length, 0, 'nonterminal views must not mint FINAL delivery capabilities');
    assert.deepEqual(calls[0][1], { clientRequestId: 'request-1', projectId: 'agent-project', sourceArtifactId: 'source-1', mode: 'ROTATE_90_CW', width: 640, height: 480 });
    assert.deepEqual(calls[0][2], { tenantId: principal.tenantId, userId: principal.userId });
    assert.equal(calls[0][2].sessionId, undefined); assert.equal(calls[0][2].scopes, undefined);
  });
});

test('resume/result/retry/cancel keep execution identity in the route and mint preview only for scoped durable SUCCESS', async () => {
  const calls = [];
  const previewCalls = [];
  const workflow = {
    async start() { throw new Error('not used'); },
    async resume(executionId, projectId, caller) { calls.push(['resume', executionId, projectId, caller]); return waitingView(); },
    async submitLocalResult(executionId, projectId, caller, result) { calls.push(['result', executionId, projectId, caller, result]); return Object.freeze({ executionId, revision: 4, state: 'SUCCESS', terminalArtifactId: 'final-resize-artifact' }); },
    async retry(executionId, projectId, caller) { calls.push(['retry', executionId, projectId, caller]); return Object.freeze({ ...waitingView('RESIZE'), revision: 3 }); },
    async cancel(executionId, projectId, caller) { calls.push(['cancel', executionId, projectId, caller]); return Object.freeze({ executionId, revision: 5, state: 'CANCELLED', failureCode: 'WORKFLOW_CANCELLED' }); },
  };
  const adapter = createBoundedAgentHttpAdapter({ workflow, terminalPreview: terminalPreview(previewCalls), auth: auth(), config });

  await withServer(adapter, async base => {
    const forgedResume = await fetch(`${base}/api/core/agent/bounded-deterministic/agent-execution?projectId=agent-project&providerId=fal`, { headers: { cookie } });
    assert.equal(forgedResume.status, 400); assert.equal((await forgedResume.json()).error, 'client_agent_authority_forbidden'); assert.equal(calls.length, 0);

    const resumed = await fetch(`${base}/api/core/agent/bounded-deterministic/agent-execution?projectId=agent-project`, { headers: { cookie } });
    assert.equal(resumed.status, 200); assert.equal((await resumed.json()).state, 'WAITING_FOR_LOCAL_RESULT');
    assert.deepEqual(calls[0], ['resume', 'agent-execution', 'agent-project', { tenantId: principal.tenantId, userId: principal.userId }]);
    assert.equal(previewCalls.length, 0);

    const result = Object.freeze({ ticketId: 'agent-ticket-1', nonce: 'agent-nonce', outputs: Object.freeze([{ uploadId: 'upload-1' }]) });
    const forgedResult = await fetch(`${base}/api/core/agent/bounded-deterministic/agent-execution/result`, {
      method: 'POST', headers: browserHeaders(), body: JSON.stringify({ projectId: 'agent-project', ticketId: 'attacker-ticket', result }),
    });
    assert.equal(forgedResult.status, 400); assert.equal((await forgedResult.json()).error, 'client_agent_authority_forbidden'); assert.equal(calls.length, 1);

    const submitted = await fetch(`${base}/api/core/agent/bounded-deterministic/agent-execution/result`, {
      method: 'POST', headers: browserHeaders(), body: JSON.stringify({ projectId: 'agent-project', result }),
    });
    assert.equal(submitted.status, 200);
    const submittedBody = await submitted.json();
    assert.equal(submittedBody.terminalArtifactId, 'final-resize-artifact');
    assert.equal(submittedBody.terminalImageUrl, '/api/core/artifacts/results/delivery%3Afinal-resize-artifact');
    assert.deepEqual(previewCalls, [[{ tenantId: principal.tenantId, userId: principal.userId, projectId: 'agent-project' }, 'final-resize-artifact']]);
    assert.deepEqual(calls[1], ['result', 'agent-execution', 'agent-project', { tenantId: principal.tenantId, userId: principal.userId }, result]);

    const retried = await fetch(`${base}/api/core/agent/bounded-deterministic/agent-execution/retry`, {
      method: 'POST', headers: browserHeaders(), body: JSON.stringify({ projectId: 'agent-project' }),
    });
    assert.equal(retried.status, 202); assert.equal((await retried.json()).nextAction.operation, 'RESIZE');
    assert.equal(previewCalls.length, 1, 'retry waiting view must not mint another FINAL delivery capability');

    const forgedCancel = await fetch(`${base}/api/core/agent/bounded-deterministic/agent-execution/cancel`, {
      method: 'POST', headers: browserHeaders(), body: JSON.stringify({ projectId: 'agent-project', target: 'cloud' }),
    });
    assert.equal(forgedCancel.status, 400); assert.equal((await forgedCancel.json()).error, 'client_agent_authority_forbidden');

    const cancelled = await fetch(`${base}/api/core/agent/bounded-deterministic/agent-execution/cancel`, {
      method: 'POST', headers: browserHeaders(), body: JSON.stringify({ projectId: 'agent-project' }),
    });
    assert.equal(cancelled.status, 200); assert.equal((await cancelled.json()).state, 'CANCELLED');
    assert.equal(previewCalls.length, 1, 'cancelled workflow must not mint a FINAL delivery capability');
  });
});

test('bounded Agent HTTP fails closed when SUCCESS has no canonical terminal Artifact', async () => {
  let previewCalls = 0;
  const workflow = {
    async start() { return Object.freeze({ executionId: 'agent-execution', revision: 4, state: 'SUCCESS' }); },
    async resume() { throw new Error('not used'); }, async submitLocalResult() { throw new Error('not used'); }, async retry() { throw new Error('not used'); }, async cancel() { throw new Error('not used'); },
  };
  const adapter = createBoundedAgentHttpAdapter({
    workflow,
    terminalPreview: Object.freeze({ async mint() { previewCalls += 1; return '/api/core/artifacts/results/forbidden'; } }),
    auth: auth(),
    config,
  });
  await withServer(adapter, async base => {
    const response = await fetch(`${base}/api/core/agent/bounded-deterministic/start`, {
      method: 'POST', headers: browserHeaders(),
      body: JSON.stringify({ clientRequestId: 'request-1', projectId: 'agent-project', sourceArtifactId: 'source-1', mode: 'ROTATE_90_CW', width: 640, height: 480 }),
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, 'internal_error'); assert.equal(body.message, 'Bounded Agent request failed');
    assert.equal(previewCalls, 0, 'missing terminal Artifact must fail before capability minting');
  });
});

test('bounded Agent HTTP hides internal failures behind correlation-scoped 500 responses', async () => {
  const workflow = {
    async start() { throw new Error('database secret path'); },
    async resume() { throw new Error('not used'); }, async submitLocalResult() { throw new Error('not used'); }, async retry() { throw new Error('not used'); }, async cancel() { throw new Error('not used'); },
  };
  const adapter = createBoundedAgentHttpAdapter({ workflow, terminalPreview: terminalPreview(), auth: auth(), config });
  await withServer(adapter, async base => {
    const response = await fetch(`${base}/api/core/agent/bounded-deterministic/start`, {
      method: 'POST', headers: browserHeaders(),
      body: JSON.stringify({ clientRequestId: 'request-1', projectId: 'agent-project', sourceArtifactId: 'source-1', mode: 'ROTATE_90_CW', width: 640, height: 480 }),
    });
    assert.equal(response.status, 500);
    const body = await response.json();
    assert.equal(body.error, 'internal_error'); assert.equal(body.message, 'Bounded Agent request failed'); assert.ok(body.correlationId);
    assert.equal(JSON.stringify(body).includes('database secret path'), false);
  });
});
