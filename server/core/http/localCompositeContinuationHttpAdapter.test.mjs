import assert from 'node:assert/strict';
import test from 'node:test';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { createLocalCompositeContinuationHttpAdapter } from './localCompositeContinuationHttpAdapter.ts';

const sessionToken = 'aaa.bbb.ccc';
const origin = 'https://app.example.test';
const config = Object.freeze({
  nodeEnv: 'test', allowedWebOrigins: Object.freeze([origin]), authChallengeSecret: 'composite-csrf-secret', authPublicOrigin: 'http://localhost',
  bodyLimitBytes: 64_000, maskUploadLimitBytes: 64_000, imageUploadLimitBytes: 256_000,
});
const principal = Object.freeze({ tenantId: 'tenant-http', userId: 'user-http', sessionId: 'session-http' });
const csrf = createHmac('sha256', config.authChallengeSecret).update('bers-browser-csrf-v1\0').update(sessionToken).digest('base64url');
const cookie = `bers_session_dev=${sessionToken}`;

function ticket() {
  return Object.freeze({ ticketId: 'ticket-http', version: '1', issuer: 'CORE', requestId: 'execution-http', workflowId: 'execution-http', stepId: 'local-continuation-01-segment', nonce: 'nonce-http', expiresAt: 60_000 });
}
function waitingView() {
  return Object.freeze({ executionId: 'execution-http', revision: 1, state: 'WAITING_FOR_LOCAL_RESULT', nextAction: Object.freeze({ type: 'LOCAL_EXECUTION', ticket: ticket() }) });
}

async function withServer(handler, fn) {
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try { await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function browserHeaders(contentType = 'application/json') {
  return { origin, cookie, 'x-bers-csrf-token': csrf, 'content-type': contentType };
}

function auth() {
  return {
    async verify(authorization) { assert.equal(authorization, `Bearer ${sessionToken}`); return principal; },
  };
}

test('composite HTTP transport validates browser intent before one start-only production admission and never accepts client workflow authority', async () => {
  const calls = [];
  let admissionCalls = 0;
  const continuation = {
    async start(command, scope) { calls.push(['start', command, scope]); return waitingView(); },
    async resume(executionId, scope) { calls.push(['resume', executionId, scope]); return waitingView(); },
    async submitLocalResult(executionId, scope, result) { calls.push(['result', executionId, scope, result]); return Object.freeze({ executionId, revision: 2, state: 'WAITING_FOR_LOCAL_RESULT', nextAction: Object.freeze({ type: 'LOCAL_EXECUTION', ticket: Object.freeze({ ...ticket(), version: '2', ticketId: 'ticket-image' }) }) }); },
  };
  const outputs = {
    async upload(value) { calls.push(['upload', value]); return Object.freeze({ uploadId: 'upload-http', kind: 'mask', role: 'MASK', sha256: 'a'.repeat(64), sizeBytes: value.bytes.byteLength, mimeType: value.mimeType, width: 2, height: 2 }); },
  };
  const startAdmission = Object.freeze({ assertStartAllowed() { admissionCalls += 1; return Object.freeze({ admitted: true, status: 'ADMITTED', blockers: [] }); } });
  const adapter = createLocalCompositeContinuationHttpAdapter({ continuation, outputs, startAdmission, auth: auth(), config });

  await withServer(adapter, async base => {
    const denied = await fetch(`${base}/api/core/composite-continuations/start`, {
      method: 'POST', headers: { origin, cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ projectId: 'project-http', clientRequestId: 'client-http', inputArtifactId: 'original-http', analysis: {}, points: [{}] }),
    });
    assert.equal(denied.status, 403); assert.equal((await denied.json()).error, 'csrf_denied'); assert.equal(calls.length, 0); assert.equal(admissionCalls, 0);

    const forged = await fetch(`${base}/api/core/composite-continuations/start`, {
      method: 'POST', headers: browserHeaders(),
      body: JSON.stringify({ projectId: 'project-http', clientRequestId: 'client-http', inputArtifactId: 'original-http', analysis: {}, points: [{}], stepId: 'forged-step' }),
    });
    assert.equal(forged.status, 400); assert.equal((await forged.json()).error, 'client_workflow_authority_forbidden'); assert.equal(calls.length, 0); assert.equal(admissionCalls, 0);

    const malformedSelection = await fetch(`${base}/api/core/composite-continuations/start`, {
      method: 'POST', headers: browserHeaders(),
      body: JSON.stringify({ projectId: 'project-http', clientRequestId: 'client-http', inputArtifactId: 'original-http', analysis: { originalWidth: 2 }, points: [{ x: 1 }, 'discard-me'] }),
    });
    assert.equal(malformedSelection.status, 400);
    assert.equal((await malformedSelection.json()).error, 'invalid_local_selection');
    assert.equal(calls.length, 0, 'transport must reject the whole malformed selection instead of filtering individual points');
    assert.equal(admissionCalls, 0, 'invalid browser intent must not cross production start admission');

    const started = await fetch(`${base}/api/core/composite-continuations/start`, {
      method: 'POST', headers: browserHeaders(),
      body: JSON.stringify({ projectId: 'project-http', clientRequestId: 'client-http', inputArtifactId: 'original-http', analysis: { originalWidth: 2 }, points: [{ x: 1 }] }),
    });
    assert.equal(started.status, 202);
    const startedBody = await started.json();
    assert.equal(startedBody.executionId, 'execution-http'); assert.equal(startedBody.state, 'WAITING_FOR_LOCAL_RESULT'); assert.equal(startedBody.nextAction.ticket.ticketId, 'ticket-http');
    assert.equal(admissionCalls, 1, 'exactly one production admission must occur before one new start');
    assert.deepEqual(calls[0][2], { tenantId: principal.tenantId, userId: principal.userId, projectId: 'project-http' });
    assert.equal(calls[0][1].stepId, undefined); assert.equal(calls[0][1].capability, undefined);

    const resumed = await fetch(`${base}/api/core/composite-continuations/execution-http?projectId=project-http`, { headers: { cookie } });
    assert.equal(resumed.status, 200); assert.equal((await resumed.json()).nextAction.ticket.ticketId, 'ticket-http');
    assert.equal(admissionCalls, 1, 'resume must not be re-gated by current release readiness');

    const uploaded = await fetch(`${base}/api/core/composite-continuations/execution-http/output?projectId=project-http`, {
      method: 'POST', headers: browserHeaders('application/octet-stream'), body: new Uint8Array([255, 0, 0, 255]),
    });
    assert.equal(uploaded.status, 201); assert.equal((await uploaded.json()).uploadId, 'upload-http');
    const uploadCall = calls.find(value => value[0] === 'upload'); assert.ok(uploadCall); assert.equal(uploadCall[1].executionId, 'execution-http'); assert.equal(uploadCall[1].mimeType, 'application/octet-stream');
    assert.equal(admissionCalls, 1, 'output upload must obey the outstanding ticket, not current start readiness');

    const resultPayload = Object.freeze({ ticketId: 'ticket-http', nonce: 'nonce-http', outputs: Object.freeze([{ uploadId: 'upload-http' }]) });
    const submitted = await fetch(`${base}/api/core/composite-continuations/execution-http/result`, {
      method: 'POST', headers: browserHeaders(), body: JSON.stringify({ projectId: 'project-http', result: resultPayload }),
    });
    assert.equal(submitted.status, 202); assert.equal((await submitted.json()).state, 'WAITING_FOR_LOCAL_RESULT');
    const resultCall = calls.find(value => value[0] === 'result'); assert.ok(resultCall); assert.deepEqual(resultCall[3], resultPayload);
    assert.equal(admissionCalls, 1, 'result submit must not be re-gated by current start readiness');

    const forgedResult = await fetch(`${base}/api/core/composite-continuations/execution-http/result`, {
      method: 'POST', headers: browserHeaders(), body: JSON.stringify({ projectId: 'project-http', ticketId: 'attacker-ticket', result: resultPayload }),
    });
    assert.equal(forgedResult.status, 400); assert.equal((await forgedResult.json()).error, 'client_workflow_authority_forbidden');
    assert.equal(admissionCalls, 1);
  });
});

test('blocked production start returns stable 503 before continuation creation while existing workflow resume remains recoverable', async () => {
  let startCalls = 0;
  let resumeCalls = 0;
  let admissionCalls = 0;
  const continuation = {
    async start() { startCalls += 1; return waitingView(); },
    async resume() { resumeCalls += 1; return waitingView(); },
    async submitLocalResult() { throw new Error('not used'); },
  };
  const outputs = { async upload() { throw new Error('not used'); } };
  const startAdmission = Object.freeze({
    assertStartAllowed() {
      admissionCalls += 1;
      throw Object.assign(new Error('Local composite production start is not admitted'), {
        status: 503,
        code: 'local_composite_production_unavailable',
        readiness: Object.freeze({ blockers: Object.freeze(['SEGMENT_MODEL_AUTHORITY_UNAVAILABLE']) }),
      });
    },
  });
  const adapter = createLocalCompositeContinuationHttpAdapter({ continuation, outputs, startAdmission, auth: auth(), config });

  await withServer(adapter, async base => {
    const blocked = await fetch(`${base}/api/core/composite-continuations/start`, {
      method: 'POST', headers: browserHeaders(),
      body: JSON.stringify({ projectId: 'project-http', clientRequestId: 'client-http', inputArtifactId: 'original-http', analysis: { originalWidth: 2 }, points: [{ x: 1 }] }),
    });
    assert.equal(blocked.status, 503);
    assert.deepEqual(await blocked.json(), {
      error: 'local_composite_production_unavailable',
      message: 'Local composite production start is not admitted',
      correlationId: blocked.headers.get('x-correlation-id'),
    });
    assert.equal(admissionCalls, 1);
    assert.equal(startCalls, 0, 'blocked admission must precede durable continuation creation');

    const resumed = await fetch(`${base}/api/core/composite-continuations/execution-http?projectId=project-http`, { headers: { cookie } });
    assert.equal(resumed.status, 200);
    assert.equal((await resumed.json()).executionId, 'execution-http');
    assert.equal(resumeCalls, 1);
    assert.equal(admissionCalls, 1, 'existing workflow recovery must not consult current start admission');
  });
});
