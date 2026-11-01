import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Exercise the actual page submit handler without mocking the Core authority or
// importing JSX into Node. The browser lifecycle remains covered by R3m E2E.
const source = readFileSync('src/pages/ResetPassword.jsx', 'utf8');
const match = source.match(/const handleSubmit = async \(e\) => \{([\s\S]*?)\n  \};/);
assert.ok(match, 'ResetPassword submit handler must remain testable');

function harness({ password = 'long-password-123', confirm = password, response } = {}) {
  const calls = [];
  const errors = [];
  const loading = [];
  const submitting = { current: false };
  const window = { location: { href: '' } };
  const coreClient = { auth: { resetPassword: (payload) => {
    calls.push(payload);
    return response ? response() : Promise.resolve();
  } } };
  const build = new Function(
    'submitting', 'resetToken', 'setError', 'newPassword', 'confirmPassword',
    't', 'setLoading', 'coreClient', 'window',
    'return async (e) => {' + match[1] + '\n};',
  );
  const handler = build(submitting, 'opaque-reset-token', (value) => errors.push(value),
    password, confirm, (key) => key, (value) => loading.push(value), coreClient, window);
  return { submit: () => handler({ preventDefault() {} }), calls, errors, loading, submitting, window };
}

test('password reset is single-flight and redirects only after Core success', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const h = harness({ response: () => pending });
  const first = h.submit();
  const second = h.submit();
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.calls[0], { resetToken: 'opaque-reset-token', newPassword: 'long-password-123' });
  assert.equal(h.window.location.href, '');
  assert.equal(h.submitting.current, true);
  resolve();
  await Promise.all([first, second]);
  assert.equal(h.window.location.href, '/login');
  assert.equal(h.submitting.current, false);
  assert.deepEqual(h.loading, [true, false]);
});

test('Core failure is generic, leaves user on reset page and allows explicit retry', async () => {
  let attempts = 0;
  const h = harness({ response: async () => {
    attempts += 1;
    if (attempts === 1) throw Error('private server error and token data');
  } });
  await h.submit();
  assert.equal(h.window.location.href, '');
  assert.equal(h.errors.at(-1), 'authUi.resetFailed');
  assert.equal(h.submitting.current, false);
  await h.submit();
  assert.equal(h.calls.length, 2);
  assert.equal(h.window.location.href, '/login');
});

test('password mismatch is rejected before contacting Core', async () => {
  const h = harness({ confirm: 'different' });
  await h.submit();
  assert.equal(h.calls.length, 0);
  assert.equal(h.errors.at(-1), 'authUi.passwordMismatch');
  assert.deepEqual(h.loading, []);
});

test('reset errors are announced and provide a localized new-link recovery path', () => {
  assert.match(source, /role="alert"/);
  assert.match(source, /to="\/forgot-password"/);
  assert.match(source, /authUi\.requestNewLink/);
  assert.match(source, /disabled=\{loading\}/);
  assert.doesNotMatch(source, /setError\(err\.message/);
});

const requestSource = readFileSync('src/pages/ForgotPassword.jsx', 'utf8');
const requestMatch = requestSource.match(/const handleSubmit = async \(e\) => \{([\s\S]*?)\n  \};/);
assert.ok(requestMatch, 'ForgotPassword submit handler must remain testable');

function requestHarness(response) {
  const submitting = { current: false };
  const errors = [];
  const loading = [];
  const sent = [];
  const calls = [];
  const coreClient = { auth: { resetPasswordRequest: (email) => {
    calls.push(email);
    return response();
  } } };
  const build = new Function(
    'submitting', 'setError', 'setLoading', 'coreClient', 'email', 'setSent', 't',
    'return async (e) => {' + requestMatch[1] + '\n};',
  );
  const handler = build(submitting, (value) => errors.push(value),
    (value) => loading.push(value), coreClient, 'person@example.test',
    (value) => sent.push(value), (key) => key);
  return { submit: () => handler({ preventDefault() {} }), submitting, errors, loading, sent, calls };
}

test('reset-link request is single-flight and shows non-enumerating success after response', async () => {
  let resolve;
  const pending = new Promise((done) => { resolve = done; });
  const h = requestHarness(() => pending);
  const first = h.submit();
  const second = h.submit();
  assert.deepEqual(h.calls, ['person@example.test']);
  assert.deepEqual(h.sent, []);
  resolve();
  await Promise.all([first, second]);
  assert.deepEqual(h.sent, [true]);
  assert.deepEqual(h.loading, [true, false]);
});

test('HTTP denial remains indistinguishable from accepted email, including rate limits', async () => {
  const h = requestHarness(async () => { throw Object.assign(Error('sensitive response'), { status: 429 }); });
  await h.submit();
  assert.deepEqual(h.sent, [true]);
  assert.equal(h.errors.at(-1), undefined);
});

test('network failure does not falsely claim a reset email was sent and can retry', async () => {
  let attempts = 0;
  const h = requestHarness(async () => {
    if (++attempts === 1) throw TypeError('Failed to fetch');
  });
  await h.submit();
  assert.deepEqual(h.sent, []);
  assert.equal(h.errors.at(-1), 'errors.network');
  assert.equal(h.submitting.current, false);
  await h.submit();
  assert.deepEqual(h.sent, [true]);
  assert.equal(h.calls.length, 2);
  assert.match(requestSource, /role="alert"/);
  assert.match(requestSource, /aria-busy=\{loading\}/);
});
