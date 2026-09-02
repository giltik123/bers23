import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import {
  assertProductionFrontendResponseCsp,
  productionBrowserMetaCsp,
  productionBrowserResponseCsp,
  requiredProductionFrontendHeaders,
} from '../config/frontendSecurityPolicy.mjs';
import { verifyFrontendSecurityHeaders } from '../scripts/verify-frontend-security-headers.mjs';

test('meta CSP preserves browser hardening but never pretends to enforce frame-ancestors', () => {
  const csp = productionBrowserMetaCsp('/api/core');
  assert.match(csp, /script-src 'self' 'wasm-unsafe-eval'/u);
  assert.match(csp, /require-trusted-types-for 'script'/u);
  assert.match(csp, /trusted-types 'none'/u);
  assert.match(csp, /connect-src 'self'/u);
  assert.doesNotMatch(csp, /frame-ancestors/u);
});

test('response CSP adds the HTTP-only clickjacking boundary and exact external Core origin', () => {
  const csp = productionBrowserResponseCsp('https://core.example.test/api/core');
  assert.match(csp, /connect-src 'self' https:\/\/core\.example\.test/u);
  assert.match(csp, /frame-ancestors 'none'/u);
  assert.equal(assertProductionFrontendResponseCsp(csp, 'https://core.example.test/api/core'), true);
  assert.deepEqual(requiredProductionFrontendHeaders('/api/core'), {
    'Content-Security-Policy': productionBrowserResponseCsp('/api/core'),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
});

test('response CSP validator rejects meta-only, weakened, duplicate and drifted policies', () => {
  assert.throws(
    () => assertProductionFrontendResponseCsp(productionBrowserMetaCsp('/api/core'), '/api/core'),
    /frame-ancestors/u,
  );
  assert.throws(
    () => assertProductionFrontendResponseCsp(
      productionBrowserResponseCsp('/api/core').replace("frame-ancestors 'none'", 'frame-ancestors *'),
      '/api/core',
    ),
    /frame-ancestors/u,
  );
  assert.throws(
    () => assertProductionFrontendResponseCsp(`${productionBrowserResponseCsp('/api/core')}; script-src *`, '/api/core'),
    /duplicate CSP directive/u,
  );
  assert.throws(
    () => assertProductionFrontendResponseCsp(`${productionBrowserResponseCsp('/api/core')}; report-uri /csp`, '/api/core'),
    /outside the production contract/u,
  );
});

test('Core connect source rejects insecure, protocol-relative, credentialed and query-bearing endpoints', () => {
  assert.throws(() => productionBrowserMetaCsp('http://core.example.test/api/core'), /HTTPS outside localhost/u);
  assert.throws(() => productionBrowserMetaCsp('//attacker.example/api/core'), /root-relative path or absolute URL/u);
  assert.throws(() => productionBrowserMetaCsp('https://user:secret@core.example.test/api/core'), /credentials/u);
  assert.throws(() => productionBrowserMetaCsp('https://core.example.test/api/core?mode=unsafe'), /query or fragment/u);
  assert.match(productionBrowserMetaCsp('http://localhost:8080/api/core'), /http:\/\/localhost:8080/u);
});

async function withFrontend(handler, run) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server address unavailable');
    await run(`http://127.0.0.1:${address.port}/`);
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function goodHeaders(coreApiUrl = '/api/core') {
  return requiredProductionFrontendHeaders(coreApiUrl);
}

test('live verifier accepts a direct HTML response only when HTTP security headers satisfy the shared contract', async () => {
  await withFrontend((request, response) => {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    for (const [name, value] of Object.entries(goodHeaders())) response.setHeader(name, value);
    response.end('<!doctype html><html><body>BERS</body></html>');
  }, async frontendUrl => {
    const result = await verifyFrontendSecurityHeaders({ frontendUrl, coreApiUrl: '/api/core' });
    assert.equal(result.status, 200);
    assert.equal(result.frontendUrl, frontendUrl);
  });
});

test('live verifier rejects meta-only CSP because frame-ancestors requires an HTTP response header', async () => {
  await withFrontend((request, response) => {
    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.end(`<meta http-equiv="Content-Security-Policy" content="${productionBrowserMetaCsp('/api/core')}">`);
  }, async frontendUrl => {
    await assert.rejects(
      () => verifyFrontendSecurityHeaders({ frontendUrl }),
      /HTTP Content-Security-Policy response header/u,
    );
  });
});

test('live verifier rejects weakened headers, redirects and non-HTML roots', async () => {
  const all = goodHeaders();
  const cases = [
    {
      headers: { ...all, 'Content-Security-Policy': productionBrowserMetaCsp('/api/core'), 'Content-Type': 'text/html' },
      status: 200,
      error: /frame-ancestors/u,
    },
    {
      headers: { ...all, 'X-Content-Type-Options': undefined, 'Content-Type': 'text/html' },
      status: 200,
      error: /X-Content-Type-Options/u,
    },
    {
      headers: { ...all, 'X-Frame-Options': 'SAMEORIGIN', 'Content-Type': 'text/html' },
      status: 200,
      error: /X-Frame-Options/u,
    },
    {
      headers: { ...all, 'Referrer-Policy': 'origin', 'Content-Type': 'text/html' },
      status: 200,
      error: /Referrer-Policy/u,
    },
    {
      headers: { Location: '/app' },
      status: 302,
      error: /direct 2xx/u,
    },
    {
      headers: { ...all, 'Content-Type': 'application/json' },
      status: 200,
      error: /serve HTML/u,
    },
  ];
  for (const candidate of cases) {
    await withFrontend((request, response) => {
      response.statusCode = candidate.status;
      for (const [name, value] of Object.entries(candidate.headers)) {
        if (value !== undefined) response.setHeader(name, value);
      }
      response.end(candidate.status === 302 ? '' : '<html>BERS</html>');
    }, async frontendUrl => {
      await assert.rejects(() => verifyFrontendSecurityHeaders({ frontendUrl }), candidate.error);
    });
  }
});
