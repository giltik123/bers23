import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  authenticatedOwnerScope,
  authenticatedProjectScope,
} from './authenticatedPrincipalScope.ts';
import { createLocalExecutionHttpAdapter } from './localExecutionHttpAdapter.ts';

const principal = Object.freeze({
  tenantId: 'tenant-browser-principal',
  userId: 'user-browser-principal',
  sessionId: 'session-browser-principal',
  scopes: Object.freeze([]),
});

const ownerScope = Object.freeze({
  tenantId: principal.tenantId,
  userId: principal.userId,
});

const config = Object.freeze({
  nodeEnv: 'test',
  allowedWebOrigins: Object.freeze(['http://app.test']),
  bodyLimitBytes: 8192,
  imageUploadLimitBytes: 1024 * 1024,
  authChallengeSecret: 'test-secret',
  authPublicOrigin: 'http://localhost',
  allowApiBearerAuth: true,
});

const headers = Object.freeze({
  Authorization: 'Bearer browser.session.token',
  'Content-Type': 'application/json',
});

const projectId = '11111111-1111-4111-8111-111111111111';
const sourceArtifactId = 'source-artifact-browser-principal';

function assertCanonicalOwnerScope(actual) {
  assert.deepEqual(actual, ownerScope);
  assert.deepEqual(Object.keys(actual).sort(), ['tenantId', 'userId']);
  assert.equal(Object.isFrozen(actual), true);
  assert.equal('sessionId' in actual, false);
  assert.equal('scopes' in actual, false);
}

test('authenticated principal projection keeps transport/session metadata out of canonical scopes', () => {
  const owner = authenticatedOwnerScope(principal);
  const project = authenticatedProjectScope(principal, projectId);

  assertCanonicalOwnerScope(owner);
  assert.deepEqual(project, { ...ownerScope, projectId });
  assert.deepEqual(Object.keys(project).sort(), ['projectId', 'tenantId', 'userId']);
  assert.equal(Object.isFrozen(project), true);
  assert.equal('sessionId' in project, false);
  assert.equal('scopes' in project, false);
});

async function withLocalExecutionServer(run) {
  const calls = [];
  const prepared = capability => Object.freeze({
    prepare: async (command, auth) => {
      calls.push(Object.freeze({ capability, command, auth }));
      return Object.freeze({
        executionId: `${capability}-execution`,
        ticket: Object.freeze({ ticketId: `${capability}-ticket` }),
      });
    },
  });

  const adapter = createLocalExecutionHttpAdapter({
    service: Object.freeze({
      prepare: async () => { throw new Error('segment service must not be reached'); },
    }),
    crop: prepared('crop'),
    resize: prepared('resize'),
    superResolution: prepared('super-resolution'),
    auth: Object.freeze({
      verify: async authorization => {
        assert.equal(authorization, headers.Authorization);
        return principal;
      },
    }),
    config,
  });

  const server = createServer((request, response) => { void adapter(request, response); });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server address unavailable');
    await run(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function postJson(base, path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

test('browser-shaped principal is projected before Crop, Resize and Super-Resolution prepare delegation', async () => {
  await withLocalExecutionServer(async (base, calls) => {
    const common = Object.freeze({
      projectId,
      sourceArtifactId,
      clientRequestId: '22222222-2222-4222-8222-222222222222',
    });

    const crop = await postJson(base, '/api/core/local-execution/crop/prepare', {
      ...common,
      x: 1,
      y: 2,
      width: 320,
      height: 240,
    });
    const resize = await postJson(base, '/api/core/local-execution/resize/prepare', {
      ...common,
      width: 640,
      height: 480,
    });
    const superResolution = await postJson(base, '/api/core/local-execution/super-resolution/prepare', common);

    assert.equal(crop.status, 202);
    assert.equal(resize.status, 202);
    assert.equal(superResolution.status, 202);
    assert.deepEqual(calls.map(call => call.capability), ['crop', 'resize', 'super-resolution']);

    for (const call of calls) assertCanonicalOwnerScope(call.auth);
  });
});
