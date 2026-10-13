import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { join } from 'node:path';
import test from 'node:test';
import { requiredProductionFrontendHeaders } from '../config/frontendSecurityPolicy.mjs';
import { createProductionFrontendServer } from '../scripts/serve-production-frontend.mjs';

async function withFrontend(coreApiUrl, run, deploymentSha = 'a'.repeat(40), coreUpstreamUrl = null) {
  const rootDir = await mkdtemp(join(tmpdir(), 'bers-v1-frontend-'));
  await mkdir(join(rootDir, 'assets'), { recursive: true });
  await writeFile(join(rootDir, 'index.html'), '<!doctype html><html><body>BERS v1</body></html>');
  await writeFile(join(rootDir, 'assets', 'app.js'), 'console.log("BERS");');

  const server = createProductionFrontendServer({ rootDir, coreApiUrl, deploymentSha, coreUpstreamUrl });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => server.close(error => error ? rejectPromise(error) : resolvePromise()));
  }
}

test('production frontend server emits the shared exact response security contract', async () => {
  const coreApiUrl = 'https://core.example.test/api/core';
  await withFrontend(coreApiUrl, async baseUrl => {
    const response = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/u);
    for (const [name, value] of Object.entries(requiredProductionFrontendHeaders(coreApiUrl))) {
      assert.equal(response.headers.get(name), value);
    }
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
    assert.equal(response.headers.get('x-bers-deployment-sha'), 'a'.repeat(40));
  });
});

test('production frontend server preserves assets and SPA fallback under the same headers', async () => {
  await withFrontend('/api/core', async baseUrl => {
    const asset = await fetch(`${baseUrl}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type') ?? '', /^text\/javascript/u);
    assert.equal(await asset.text(), 'console.log("BERS");');

    const fallback = await fetch(`${baseUrl}/projects/example`);
    assert.equal(fallback.status, 200);
    assert.match(fallback.headers.get('content-type') ?? '', /^text\/html/u);
    assert.match(await fallback.text(), /BERS v1/u);
  });
});


test('production frontend server rejects malformed deployment identity instead of emitting ambiguous release evidence', () => {
  assert.throws(
    () => createProductionFrontendServer({ deploymentSha: 'not-a-git-sha' }),
    /RAILWAY_GIT_COMMIT_SHA must be one exact 40-character Git SHA/u,
  );
});


test('same-origin gateway preserves strict HttpOnly session across login and reload without browser bearer fallback', async () => {
  const requests = [];
  const core = createServer(async (request, response) => {
    requests.push({
      method: request.method,
      path: request.url,
      origin: request.headers.origin,
      fetchSite: request.headers['sec-fetch-site'],
      host: request.headers.host,
      forgedForwarded: request.headers['x-forwarded-for'],
    });
    if (request.url === '/api/core/auth/password/login' && request.method === 'POST') {
      let body = '';
      for await (const chunk of request) body += chunk.toString();
      assert.equal(JSON.parse(body).email, 'demo@example.test');
      response.writeHead(200, {
        'Content-Type': 'application/json',
        'Set-Cookie': '__Host-bers_session=session.jwt.token; Path=/; Secure; HttpOnly; SameSite=Strict',
        'X-Bers-CSRF-Token': 'session-bound-csrf',
      });
      response.end('{"user":{"id":"test"}}');
      return;
    }
    if (request.url === '/api/core/auth/context' && request.method === 'GET') {
      const authorized = request.headers.cookie === '__Host-bers_session=session.jwt.token';
      response.writeHead(authorized ? 200 : 401, { 'Content-Type': 'application/json' });
      response.end(authorized ? '{"user":{"id":"test"}}' : '{"message":"Unauthorized"}');
      return;
    }
    response.writeHead(404); response.end();
  });
  await new Promise(resolvePromise => core.listen(0, '127.0.0.1', resolvePromise));
  try {
    const coreAddress = core.address();
    assert.ok(coreAddress && typeof coreAddress !== 'string');
    await withFrontend('/api/core', async baseUrl => {
      const login = await fetch(baseUrl + '/api/core/auth/password/login', {
        method: 'POST',
        headers: {
          Origin: 'https://frontend.example.test',
          'Sec-Fetch-Site': 'same-origin',
          'Content-Type': 'application/json',
          'X-Forwarded-For': 'spoofed-client',
        },
        body: JSON.stringify({ email: 'demo@example.test', password: 'not-a-real-password' }),
      });
      assert.equal(login.status, 200);
      assert.match(login.headers.get('set-cookie') ?? '', /^__Host-bers_session=.*; Path=\/; Secure; HttpOnly; SameSite=Strict$/u);
      assert.equal(login.headers.get('x-bers-csrf-token'), 'session-bound-csrf');
      assert.equal((await fetch(baseUrl + '/api/core/auth/context')).status, 401);
      const context = await fetch(baseUrl + '/api/core/auth/context', {
        headers: { Cookie: '__Host-bers_session=session.jwt.token', 'Sec-Fetch-Site': 'same-origin' },
      });
      assert.equal(context.status, 200, 'first-party cookie must reach Core after navigation/reload');
      assert.equal((await context.json()).user.id, 'test');
      assert.equal((await fetch(baseUrl + '/api/core/auth/context?missing=1')).status, 404);
      assert.equal((await fetch(baseUrl + '/api/core-other')).status, 200, 'non-API path must remain an SPA route');
    }, 'a'.repeat(40), 'http://127.0.0.1:' + coreAddress.port + '/api/core');
    assert.equal(requests[0].origin, 'https://frontend.example.test');
    assert.equal(requests[0].fetchSite, 'same-origin');
    assert.equal(requests[0].forgedForwarded, undefined, 'browser-supplied proxy identities must be removed');
    assert.equal(requests[0].host, '127.0.0.1:' + coreAddress.port);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => core.close(error => error ? rejectPromise(error) : resolvePromise()));
  }
});

test('API routing fails closed when upstream is missing or unsafe; it never serves index.html for API routes', async () => {
  await withFrontend('/api/core', async baseUrl => {
    const unavailable = await fetch(baseUrl + '/api/core/auth/context');
    assert.equal(unavailable.status, 503);
    assert.match(await unavailable.text(), /upstream not configured/u);
    assert.equal((await fetch(baseUrl + '/login')).status, 200);
  });
  for (const invalid of [
    'http://not-local.example.test/api/core',
    'https://user:password@core.example.test/api/core',
    'https://core.example.test/api/core?unsafe=1',
    'https://core.example.test/api/core/',
    'https://core.example.test/not-core',
    '//core.example.test/api/core',
  ]) {
    assert.throws(
      () => createProductionFrontendServer({ coreUpstreamUrl: invalid }),
      /CORE_API_URL/u,
      invalid,
    );
  }
});
