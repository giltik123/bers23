import assert from 'node:assert/strict';
import test from 'node:test';
import { clearBrowserSession, cookieName, establishBrowserSession, requestAuthorization } from './browserSessionCookie.ts';

const secureConfig = { authPublicOrigin: 'https://app.example.test' };
const localConfig = { authPublicOrigin: 'http://localhost' };
const token = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1In0.signature';

function responseMock() {
  const headers = new Map();
  return {
    headers,
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
  };
}

function request(headers = {}) { return { headers }; }

test('establishBrowserSession hides bearer material and sets a hardened __Host cookie in HTTPS production', () => {
  const response = responseMock();
  const now = Date.UTC(2026, 7, 22, 8, 0, 0);
  const expires = new Date(now + 8 * 60 * 60 * 1000).toISOString();
  const body = establishBrowserSession(response, { access_token: token, token_type: 'Bearer', expires_at: expires, user: { id: 'u' } }, secureConfig, now);
  assert.deepEqual(body, { expires_at: expires, user: { id: 'u' } });
  assert.equal(JSON.stringify(body).includes(token), false);
  const cookie = String(response.headers.get('set-cookie'));
  assert.match(cookie, /^__Host-bers_session=/);
  assert.match(cookie, /; Path=\/;/);
  assert.match(cookie, /; HttpOnly;/);
  assert.match(cookie, /; SameSite=Strict;/);
  assert.match(cookie, /; Max-Age=28800;/);
  assert.match(cookie, /; Secure$/);
  assert.doesNotMatch(cookie, /Domain=/i);
});

test('localhost development uses a non-__Host cookie without pretending transport is Secure', () => {
  const response = responseMock();
  const now = 1_000_000;
  establishBrowserSession(response, { access_token: token, token_type: 'Bearer', expires_at: new Date(now + 60_000).toISOString(), user: { id: 'u' } }, localConfig, now);
  const cookie = String(response.headers.get('set-cookie'));
  assert.match(cookie, /^bers_session_dev=/);
  assert.doesNotMatch(cookie, /; Secure(?:;|$)/);
  assert.equal(cookieName(localConfig), 'bers_session_dev');
});

test('browser requests cannot fall back to Authorization bearer and duplicate cookies fail closed', () => {
  assert.equal(requestAuthorization(request({ origin: 'https://app.example.test', authorization: `Bearer ${token}` }), secureConfig), undefined);
  assert.equal(requestAuthorization(request({ 'sec-fetch-site': 'same-origin', authorization: `Bearer ${token}` }), secureConfig), undefined);
  assert.equal(requestAuthorization(request({ cookie: `__Host-bers_session=${token}`, authorization: 'Bearer stale.browser.token', 'sec-fetch-site': 'same-origin' }), secureConfig), `Bearer ${token}`);
  assert.equal(requestAuthorization(request({ cookie: `__Host-bers_session=${token}; __Host-bers_session=${token}`, 'sec-fetch-site': 'same-origin' }), secureConfig), undefined);
  assert.equal(requestAuthorization(request({ authorization: `Bearer ${token}` }), secureConfig), `Bearer ${token}`);
});

test('clearBrowserSession expires the exact hardened cookie', () => {
  const response = responseMock();
  clearBrowserSession(response, secureConfig);
  const cookie = String(response.headers.get('set-cookie'));
  assert.match(cookie, /^__Host-bers_session=;/);
  assert.match(cookie, /Max-Age=0/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Secure$/);
});

test('malformed or expired session envelopes fail closed before any cookie is issued', () => {
  const response = responseMock();
  assert.throws(() => establishBrowserSession(response, { access_token: 'not-a-jwt', expires_at: new Date(Date.now() + 60_000).toISOString() }, secureConfig), error => error?.code === 'session_issuance_failed');
  assert.equal(response.headers.has('set-cookie'), false);
});
