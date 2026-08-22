import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROWSER_CSRF_HEADER,
  assertBrowserAuthMutationOrigin,
  assertBrowserMutationAllowed,
  clearBrowserSession,
  cookieName,
  establishBrowserSession,
  exposeBrowserCsrfToken,
  requestAuthorization,
} from './browserSessionCookie.ts';

const secureConfig = {
  authPublicOrigin: 'https://app.example.test',
  authChallengeSecret: 'csrf-test-secret',
  allowedWebOrigins: Object.freeze(['https://app.example.test']),
  nodeEnv: 'production',
  allowApiBearerAuth: false,
};
const secureApiConfig = { ...secureConfig, allowApiBearerAuth: true };
const localConfig = {
  authPublicOrigin: 'http://localhost',
  authChallengeSecret: 'csrf-local-secret',
  allowedWebOrigins: Object.freeze(['http://localhost']),
  nodeEnv: 'test',
};
const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.signature';

function responseMock() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
  };
}

function request(headers = {}, method = 'GET') { return { headers, method }; }

function issue(config = secureConfig) {
  const response = responseMock();
  const now = Date.UTC(2026, 7, 22, 8, 0, 0);
  const expires = new Date(now + 8 * 60 * 60 * 1000).toISOString();
  const body = establishBrowserSession(response, { access_token: token, token_type: 'Bearer', expires_at: expires, user: { id: 'u' }, refresh_token: 'must-never-leak' }, config, now);
  return { response, body, csrf: String(response.headers.get(BROWSER_CSRF_HEADER.toLowerCase())) };
}

test('establishBrowserSession hides bearer material, hardens cookie and emits only a session-bound anti-forgery proof', () => {
  const { response, body, csrf } = issue();
  assert.deepEqual(body, { expires_at: '2026-08-22T16:00:00.000Z', user: { id: 'u' } });
  assert.equal(JSON.stringify(body).includes(token), false);
  assert.equal(JSON.stringify(body).includes('must-never-leak'), false);
  const cookie = String(response.headers.get('set-cookie'));
  assert.match(cookie, /^__Host-bers_session=/);
  assert.match(cookie, /; Path=\//);
  assert.match(cookie, /; HttpOnly;/);
  assert.match(cookie, /; SameSite=Strict;/);
  assert.match(cookie, /; Max-Age=28800;/);
  assert.match(cookie, /; Secure$/);
  assert.doesNotMatch(cookie, /Domain=/i);
  assert.match(csrf, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(csrf, token);
});

test('localhost development uses a non-__Host cookie without pretending transport is Secure', () => {
  const { response } = issue(localConfig);
  const cookie = String(response.headers.get('set-cookie'));
  assert.match(cookie, /^bers_session_dev=/);
  assert.doesNotMatch(cookie, /; Secure(?:;|$)/);
  assert.equal(cookieName(localConfig), 'bers_session_dev');
});

test('production disables bearer fallback by default and browser Sec-Fetch traffic never uses it', () => {
  assert.equal(requestAuthorization(request({ authorization: `Bearer ${token}` }), secureConfig), undefined);
  assert.equal(requestAuthorization(request({ origin: 'https://app.example.test', authorization: `Bearer ${token}` }), secureConfig), undefined);
  assert.equal(requestAuthorization(request({ 'sec-fetch-site': 'same-origin', authorization: `Bearer ${token}` }), secureApiConfig), undefined);
  assert.equal(requestAuthorization(request({ authorization: `Bearer ${token}` }), secureApiConfig), `Bearer ${token}`, 'explicit production API deployment may opt in');
  assert.equal(requestAuthorization(request({ authorization: `Bearer ${token}` }), localConfig), `Bearer ${token}`, 'test/dev compatibility remains available');
});

test('cookie authority wins over stale bearer and duplicate cookies fail closed', () => {
  assert.equal(requestAuthorization(request({ cookie: `__Host-bers_session=${token}`, authorization: 'Bearer stale.browser.token', 'sec-fetch-site': 'same-origin' }), secureApiConfig), `Bearer ${token}`);
  assert.equal(requestAuthorization(request({ cookie: `__Host-bers_session=${token}; __Host-bers_session=${token}`, 'sec-fetch-site': 'same-origin' }), secureApiConfig), undefined);
});

test('unsafe cookie-authenticated mutations require exact Origin and exact session-bound CSRF header', () => {
  const { csrf } = issue();
  const cookie = `__Host-bers_session=${token}`;
  assert.doesNotThrow(() => assertBrowserMutationAllowed(request({ cookie, origin: 'https://app.example.test', 'x-bers-csrf-token': csrf }, 'POST'), secureConfig));
  assert.throws(() => assertBrowserMutationAllowed(request({ cookie, origin: 'https://app.example.test' }, 'POST'), secureConfig), error => error?.code === 'csrf_denied');
  assert.throws(() => assertBrowserMutationAllowed(request({ cookie, origin: 'https://evil.example', 'x-bers-csrf-token': csrf }, 'PATCH'), secureConfig), error => error?.code === 'origin_denied');
  assert.throws(() => assertBrowserMutationAllowed(request({ cookie, origin: 'https://app.example.test', 'x-bers-csrf-token': `${csrf.slice(0, -1)}A` }, 'DELETE'), secureConfig), error => error?.code === 'csrf_denied');
  assert.doesNotThrow(() => assertBrowserMutationAllowed(request({ cookie, origin: 'https://evil.example' }, 'GET'), secureConfig), 'safe reads do not need an anti-forgery header');
  assert.doesNotThrow(() => assertBrowserMutationAllowed(request({ authorization: `Bearer ${token}` }, 'POST'), secureApiConfig), 'bearer-only API clients remain outside browser-cookie CSRF authority');
});

test('pre-auth browser mutations require an exact configured Origin', () => {
  assert.doesNotThrow(() => assertBrowserAuthMutationOrigin(request({ origin: 'https://app.example.test' }, 'POST'), secureConfig));
  assert.throws(() => assertBrowserAuthMutationOrigin(request({}, 'POST'), secureConfig), error => error?.code === 'origin_denied');
  assert.throws(() => assertBrowserAuthMutationOrigin(request({ origin: 'https://evil.example' }, 'POST'), secureConfig), error => error?.code === 'origin_denied');
});

test('authenticated context can restore CSRF state after reload without exposing the session cookie', () => {
  const response = responseMock();
  exposeBrowserCsrfToken(response, request({ cookie: `__Host-bers_session=${token}` }), secureConfig);
  const csrf = String(response.headers.get(BROWSER_CSRF_HEADER.toLowerCase()));
  assert.match(csrf, /^[A-Za-z0-9_-]{43}$/);
  assert.notEqual(csrf, token);
});

test('clearBrowserSession expires the exact hardened cookie and invalidates browser anti-forgery memory', () => {
  const response = responseMock();
  clearBrowserSession(response, secureConfig);
  const cookie = String(response.headers.get('set-cookie'));
  assert.match(cookie, /^__Host-bers_session=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure$/);
  assert.equal(response.headers.get(BROWSER_CSRF_HEADER.toLowerCase()), '');
});

test('malformed or expired session envelopes fail closed before any cookie or CSRF proof is issued', () => {
  const response = responseMock();
  assert.throws(() => establishBrowserSession(response, { access_token: 'not-a-jwt', expires_at: new Date(Date.now() + 60_000).toISOString(), user: { id: 'u' } }, secureConfig), error => error?.code === 'session_issuance_failed');
  assert.equal(response.headers.has('set-cookie'), false);
  assert.equal(response.headers.has(BROWSER_CSRF_HEADER.toLowerCase()), false);
});
