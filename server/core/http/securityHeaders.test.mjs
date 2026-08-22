import assert from 'node:assert/strict';
import test from 'node:test';
import { CORE_API_CSP, applyCoreSecurityHeaders } from './securityHeaders.ts';

function responseMock() {
  const headers = new Map();
  return { headers, setHeader(name, value) { headers.set(String(name).toLowerCase(), String(value)); } };
}

const secure = { authPublicOrigin: 'https://app.example.test' };
const local = { authPublicOrigin: 'http://localhost' };

test('Core browser defense headers are fail-closed and HSTS is HTTPS-only', () => {
  const response = responseMock();
  applyCoreSecurityHeaders(response, secure);
  assert.equal(response.headers.get('content-security-policy'), CORE_API_CSP);
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('cross-origin-opener-policy'), 'same-origin');
  assert.equal(response.headers.get('origin-agent-cluster'), '?1');
  assert.equal(response.headers.get('x-permitted-cross-domain-policies'), 'none');
  assert.equal(response.headers.get('permissions-policy'), 'camera=(), geolocation=(), payment=(), usb=()');
  assert.equal(response.headers.get('strict-transport-security'), 'max-age=63072000; includeSubDomains; preload');
  assert.match(CORE_API_CSP, /frame-ancestors 'none'/);
  assert.match(CORE_API_CSP, /default-src 'none'/);
  assert.doesNotMatch(CORE_API_CSP, /unsafe-inline|unsafe-eval|https:|data:|blob:/);
});

test('localhost smoke never pretends an HTTP response has HSTS protection', () => {
  const response = responseMock();
  applyCoreSecurityHeaders(response, local);
  assert.equal(response.headers.has('strict-transport-security'), false);
  assert.equal(response.headers.get('x-frame-options'), 'DENY');
});
