import assert from 'node:assert/strict';
import test from 'node:test';
import { clearBrowserSession, cookieName, establishBrowserSession, requestAuthorization } from './browserSessionCookie.ts';

const secureConfig = { authPublicOrigin: 'https://app.example.test', nodeEnv: 'production', allowApiBearerAuth: false };
const secureApiConfig = { ...secureConfig, allowApiBearerAuth: true };
const localConfig = { authPublicOrigin: 'http://localhost', nodeEnv: 'test' };
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
  const body = establishBrowserSession(response, { access_token: token, token_type: 'Bearer', expires_at: expires, user: { id: 'u' }, refresh_token: 'must-never-leak' }, secureConfig, now);
  assert.deepEqual(body, { expires_at: expires, user: { id: 'u' } });
  assert.equal(JSON.stringify(body).includes(token), false);
  assert.equal(JSON.stringify(body).includes('must-never-leak'), false);
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

test('production disables bearer fallback by default and browser Sec-Fetch traffic never uses it', () => {
  assert.equal(requestAuthorization(request({ authorization: `Bearer ${token}` }), secureConfig), undefined);
  assert.equal(requestAuthorization(request({ origin: 'https://app.example.test', authorization: `Bearer ${token}` }), secureConfig), undefined);
  assert.equal(requestAuthorization(request({ 'sec-fetch-site': 'same-origin', authorization: `Bearer ${token}` }), secureApiConfig), undefined);
  assert.equal(requestAuthorization(request({ authorization: `Bearer ${token}` }), secureApiConfig), `Bearer ${token}`,'explicit production API deployment may opt in');
  assert.equal(requestAuthorization(request({ authorization: `Bearer ${token}` }), localConfig), `Bearer ${token}`,'test/dev compatibility remains available');
});

test('cookie authority wins over stale bearer and duplicate cookies fail closed', () => {
  assert.equal(requestAuthorization(request({ cookie: `__Host-bers_session=${token}`, authorization: 'Bearer stale.browser.token', 'sec-fetch-site': 'same-origin' }), secureApiConfig), `Bearer ${token}`);
  assert.equal(requestAuthorization(request({ cookie: `__Host-bers_session=${token}; __Host-bers_session=${token}`, 'sec-fetch-site': 'same-origin' }), secureApiConfig), undefined);
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
  assert.throws(() => establishBrowserSession(response, { access_token: 'not-a-jwt', expires_at: new Date(Date.now() + 60_000).toISOString(), user: { id: 'u' } }, secureConfig), error => error?.code === 'session_issuance_failed');
  assert.equal(response.headers.has('set-cookie'), false);
});
