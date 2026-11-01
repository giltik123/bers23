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
