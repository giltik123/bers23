import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

// Exercise the actual login handlers, without mounting React or calling Core.
// The hosted R3m browser gate separately covers the real Core/PostgreSQL path.
const source = readFileSync('src/pages/Login.jsx', 'utf8');
const start = source.indexOf('  const handleSubmit = async (e) => {');
const end = source.indexOf('\n  return (\n', start);
assert.ok(start >= 0 && end > start, 'login handlers must remain testable');

function harness(login) {
  const errors = [];
  const loading = [];
  const calls = [];
  const providerCalls = [];
  const location = { href: '/login' };
  const requestInFlight = { current: false };
  const context = {
    email: 'user@example.test',
    password: 'a-test-password',
    requestInFlight,
    setError: (value) => errors.push(value),
    setLoading: (value) => loading.push(value),
    t: (key) => key,
    window: { location },
    coreClient: { auth: {
      loginViaEmailPassword: (email, password) => {
        calls.push({ email, password });
        return login();
      },
      loginWithProvider: (...args) => providerCalls.push(args),
    } },
  };
  const { handleSubmit, handleGoogle } = runInNewContext(
    source.slice(start, end) + '\n({ handleSubmit, handleGoogle })',
    context,
  );
  return {
    submit: () => handleSubmit({ preventDefault() {} }),
    google: () => handleGoogle(),
    errors, loading, calls, providerCalls, location, requestInFlight,
  };
}

test('two rapid login submits produce only one Core request and one redirect', async () => {
  let resolveLogin;
  const pending = new Promise((resolve) => { resolveLogin = resolve; });
  const h = harness(() => pending);
  const first = h.submit();
  const second = h.submit();
  h.google();
  assert.equal(h.calls.length, 1);
  assert.equal(h.providerCalls.length, 0, 'Google must not interrupt a pending email sign-in');
  assert.equal(h.location.href, '/login', 'do not navigate before Core succeeds');
  assert.equal(h.requestInFlight.current, true);
  resolveLogin();
  await Promise.all([first, second]);
  assert.equal(h.location.href, '/');
  assert.equal(h.requestInFlight.current, false);
  assert.deepEqual(h.loading, [true, false]);
});

test('invalid credentials do not expose untrusted Core error text and can retry', async () => {
  let attempts = 0;
  const h = harness(async () => {
    if (++attempts === 1) throw Object.assign(new Error('private auth backend details'), { status: 401 });
  });
  await h.submit();
  assert.equal(h.location.href, '/login');
  assert.equal(h.errors.at(-1), 'authUi.invalidLogin');
  assert.equal(h.requestInFlight.current, false);
  await h.submit();
  assert.equal(h.calls.length, 2);
  assert.equal(h.location.href, '/');
});

test('network failures and server failures are not misreported as bad credentials', async () => {
  const network = harness(async () => { throw new TypeError('failed to fetch'); });
  await network.submit();
  assert.equal(network.errors.at(-1), 'errors.network');
  const server = harness(async () => {
    throw Object.assign(new Error('private stack trace'), { status: 503 });
  });
  await server.submit();
  assert.equal(server.errors.at(-1), 'errors.generic');
  assert.equal(server.location.href, '/login');
});

test('login errors are announced and controls are disabled during pending submission', () => {
  assert.match(source, /role="alert"/);
  assert.match(source, /aria-busy=\{loading\}/);
  assert.match(source, /onClick=\{handleGoogle\}\s+disabled=\{loading\}/);
  assert.equal((source.match(/disabled=\{loading\}/g) || []).length, 4);
  assert.doesNotMatch(source, /setError\(err\.message/);
});
