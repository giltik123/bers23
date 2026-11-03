import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { productionBrowserCsp } from '../vite.config.js';

const retiredTokenApi = /(?:\.|\b)(?:hasToken|getToken|setToken|clearToken|storeAccessToken|persistedToken)\s*(?:\(|:|=)/;

test('browser auth is HttpOnly-cookie based and exposes no JS-readable bearer authority', async () => {
  const [client, login, appParams] = await Promise.all([
    readFile('src/api/coreClient.js', 'utf8'),
    readFile('src/pages/Login.jsx', 'utf8'),
    readFile('src/lib/app-params.js', 'utf8'),
  ]);
  assert.match(login, /coreClient\.auth\.loginViaEmailPassword/);
  assert.match(client, /request\('\/auth\/password\/login'/);
  assert.match(client, /credentials:\s*'include'/);
  assert.match(client, /request\('\/auth\/logout'/);

  // Sensitive names may appear only in deny/scrub logic. Browser code must not
  // read, persist, or synthesize an Authorization bearer from them.
  assert.doesNotMatch(client, /localStorage|sessionStorage|core_access_token/);
  assert.doesNotMatch(client, /headers\.set\(\s*['"]Authorization['"]/);
  assert.doesNotMatch(client, /Bearer\s*\$\{/);
  assert.doesNotMatch(client, /result\?\.access_token|result\.access_token/);
  assert.doesNotMatch(client, /(?:searchParams|fragment)\.get\(\s*['"]access_token['"]\s*\)/);
  assert.doesNotMatch(client, retiredTokenApi);

  assert.match(client, /function safeReturnTo/);
  assert.match(client, /target\.hash\s*=\s*['"]{2}/);
  assert.match(client, /['"]access_token['"]/);
  assert.match(client, /target\.searchParams\.delete\(key\)/);

  assert.match(appParams, /core_access_token/);
  assert.match(appParams, /removeItem\(key\)/);
  assert.match(appParams, /searchParams\.delete\(name\)/);
  assert.doesNotMatch(appParams, /setItem|getAppParamValue|core_from_url\s*=|window\.location\.href[^;]*localStorage/);
  assert.match(appParams, /core_from_url/,'retired URL cache is explicitly removed');
  assert.equal(/setItem\([^,]+,\s*password/.test(client), false);
});


test('legacy browser bearer cleanup still scrubs the URL when the storage getter is denied', async () => {
  const source = await readFile('src/lib/app-params.js', 'utf8');
  const replacements = [];
  const window = {
    get localStorage() { throw new Error('storage denied'); },
    location: { href: 'https://bers.example/login?access_token=secret&keep=1#return' },
    history: { replaceState(...args) { replacements.push(args); } },
  };

  assert.doesNotThrow(() => runInNewContext(source, { window, document: { title: 'BERS' }, URL }));
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0][2], '/login?keep=1#return');
  assert.doesNotMatch(replacements[0][2], /access_token|secret/);
});

test('legacy browser bearer cleanup continues after an individual storage removal fails', async () => {
  const source = await readFile('src/lib/app-params.js', 'utf8');
  const removed = [];
  const replacements = [];
  const window = {
    localStorage: {
      removeItem(key) {
        removed.push(key);
        if (key === 'core_token') throw new Error('storage denied');
      },
    },
    location: { href: 'https://bers.example/login?clear_access_token=secret&keep=1#return' },
    history: { replaceState(...args) { replacements.push(args); } },
  };

  assert.doesNotThrow(() => runInNewContext(source, { window, document: { title: 'BERS' }, URL }));
  assert.deepEqual(removed, ['core_access_token', 'core_token', 'token', 'core_from_url']);
  assert.equal(replacements.length, 1);
  assert.equal(replacements[0][2], '/login?keep=1#return');
  assert.doesNotMatch(replacements[0][2], /clear_access_token|secret/);
});

test('browser anti-forgery proof is session-bound server output and remains memory-only', async () => {
  const client = await readFile('src/api/coreClient.js','utf8');
  assert.match(client, /const CSRF_HEADER\s*=\s*['"]X-Bers-CSRF-Token['"]/);
  assert.match(client, /let browserCsrfToken/);
  assert.match(client, /response\.headers\.has\(CSRF_HEADER\)/);
  assert.match(client, /headers\.set\(CSRF_HEADER,\s*browserCsrfToken\)/);
  assert.match(client, /unsafeMethod\(options\.method\)/);
  assert.doesNotMatch(client, /localStorage[^\n]*csrf|sessionStorage[^\n]*csrf|document\.cookie[^\n]*csrf/i);
});

test('OAuth callback establishes HttpOnly session server-side and AuthContext trusts only canonical context', async () => {
  const [client, context] = await Promise.all([readFile('src/api/coreClient.js','utf8'),readFile('src/lib/AuthContext.jsx','utf8')]);
  assert.match(context, /coreClient\.auth\.me\(\)/);
  assert.doesNotMatch(context, /exchangePendingBrowserGrant|auth_code|window\.location\.hash/);
  assert.doesNotMatch(context, retiredTokenApi);
  assert.doesNotMatch(context, /localStorage|sessionStorage/);
  assert.doesNotMatch(context, /appParams|publicSettings|\/config\/public/);
  assert.doesNotMatch(client, /pendingBrowserGrant|fragment\.get\(['"]auth_code['"]\)|request\(['"]\/auth\/exchange['"]/);
  assert.doesNotMatch(client, /searchParams\.get\(['"]auth_code['"]\)|searchParams\.get\(['"]access_token['"]\)/);
  assert.match(client, /['"]auth_code['"]/,'auth_code remains only in the return_to denylist');
});

test('Google auth UI is explicit opt-in and remains hidden by default', async () => {
  const [login, register] = await Promise.all([
    readFile('src/pages/Login.jsx','utf8'),
    readFile('src/pages/Register.jsx','utf8'),
  ]);
  for (const source of [login, register]) {
    assert.match(source, /VITE_GOOGLE_AUTH_ENABLED/);
    assert.match(source, /GOOGLE_AUTH_ENABLED\s*&&/);
    assert.match(source, /loginWithProvider\("google"/);
  }
});

test('registration OTP is bound to a browser-held verification handle but never receives a bearer', async () => {
  const [client, register] = await Promise.all([readFile('src/api/coreClient.js','utf8'), readFile('src/pages/Register.jsx','utf8')]);
  assert.match(register,/verificationHandle/);
  assert.match(register,/result\?\.verification_handle/);
  assert.match(register,/verifyOtp\(\{\s*email,\s*otpCode,\s*verificationHandle\s*\}\)/);
  assert.match(register,/resendOtp\(email,\s*verificationHandle\)/);
  assert.match(client,/resendOtp:\s*\(email,\s*verificationHandle\)/);
  assert.doesNotMatch(register,/access_token|\.setToken\s*\(|localStorage|sessionStorage/);
});

test('password reset secret is fragment-only and scrubbed from the address bar', async () => {
  const reset = await readFile('src/pages/ResetPassword.jsx','utf8');
  assert.match(reset,/window\.location\.hash/);
  assert.match(reset,/URLSearchParams/);
  assert.match(reset,/history\.replaceState/);
  assert.doesNotMatch(reset,/useSearchParams|searchParams\.get\("token"\)/);
});

test('registration verification recovery and Google sign-in use explicit canonical auth endpoints', async () => {
  const [client, register, forgot, reset, login] = await Promise.all([
    readFile('src/api/coreClient.js','utf8'), readFile('src/pages/Register.jsx','utf8'), readFile('src/pages/ForgotPassword.jsx','utf8'), readFile('src/pages/ResetPassword.jsx','utf8'), readFile('src/pages/Login.jsx','utf8')
  ]);
  for (const path of ['/auth/register','/auth/verify-otp','/auth/resend-otp','/auth/password/reset-request','/auth/password/reset']) assert.match(client,new RegExp(path.replaceAll('/','\\/')));
  assert.match(client,/\/auth\/login\/\$\{encodeURIComponent\(provider\)\}/);
  assert.match(register,/coreClient\.auth\.register/); assert.match(register,/coreClient\.auth\.verifyOtp/); assert.match(register,/coreClient\.auth\.resendOtp/); assert.match(register,/loginWithProvider\("google"/);
  assert.match(forgot,/coreClient\.auth\.resetPasswordRequest/); assert.match(reset,/coreClient\.auth\.resetPassword/); assert.match(login,/loginWithProvider\("google"/);
  const authCritical=`${register}\n${forgot}\n${reset}\n${login}`;
  assert.doesNotMatch(authCritical,/coreClient\.entities|coreClient\.functions\.invoke|UploadFile|\/data\/|\/assets|\/commands\//);
});

test('login to Projects to Editor critical path has no generic legacy API dependency', async () => {
  const [login, context, projects, projectService, editor] = await Promise.all([
    readFile('src/pages/Login.jsx', 'utf8'), readFile('src/lib/AuthContext.jsx', 'utf8'), readFile('src/pages/Projects.jsx', 'utf8'), readFile('src/lib/projectService.js', 'utf8'), readFile('src/pages/Editor.jsx', 'utf8'),
  ]);
  const critical = `${login}\n${context}\n${projects}\n${projectService}\n${editor}`;
  assert.doesNotMatch(critical, /\/config\/public|\/data\/|\/assets|\/commands\//);
  assert.doesNotMatch(critical, /coreClient\.entities|coreClient\.functions\.invoke|UploadFile/);
  assert.match(projectService, /coreClient\.projects/);
  // New scoped AI Studio commands bind a reviewed source; legacy requests
  // still fall back to the current canonical Project source.
  assert.match(editor, /inputArtifactId:\s*guardedScope\?\.sourceArtifactId\s*\?\?\s*project\.current_image_artifact_id/);
  assert.match(editor, /expectedSourceArtifactId:\s*aiScope\.expectedSourceArtifactId/);
  assert.match(editor, /bindGenerativeScope\(/);
});

test('creative client uses explicit Core endpoint and preserves public error fields', async () => {
  const client = await readFile('src/api/coreClient.js', 'utf8');
  assert.match(client, /creative:\s*{/);
  assert.match(client, /request\('\/creative\/execute'/);
  for (const field of ['status', 'code', 'correlationId', 'retryable']) assert.match(client, new RegExp(`error\\.${field}`));
});

test('production CSP permits local WASM without arbitrary script execution and does not enforce incompatible Trusted Types', () => {
  const local = productionBrowserCsp('/api/core');
  assert.match(local, /script-src 'self' 'wasm-unsafe-eval'/);
  assert.doesNotMatch(local, /'unsafe-eval'/);
  assert.doesNotMatch(local, /script-src[^;]*'unsafe-inline'/);
  assert.match(local, /script-src-attr 'none'/);
  assert.match(local, /worker-src 'self' blob:/);
  assert.match(local, /connect-src 'self'/);
  assert.match(local, /object-src 'none'/);
  assert.match(local, /frame-src 'none'/);
  assert.doesNotMatch(local, /require-trusted-types-for/);
  assert.doesNotMatch(local, /(?:^|;)\s*trusted-types\s/);

  const remote = productionBrowserCsp('https://core.example.test/api/core');
  assert.match(remote, /connect-src 'self' https:\/\/core\.example\.test(?:;|$)/);
  assert.doesNotMatch(remote, /connect-src[^;]*https:\s/,'connect-src must not become a wildcard HTTPS exfiltration channel');
  assert.throws(() => productionBrowserCsp('http://core.example.test/api/core'), /relative or HTTPS/);
  assert.throws(() => productionBrowserCsp('https://user:pass@core.example.test/api/core'), /credentials/);
});

test('first-party browser source contains no raw HTML or string-code execution sinks', async () => {
  const forbidden = [
    /dangerouslySetInnerHTML/,
    /\.innerHTML\s*=/,
    /\.outerHTML\s*=/,
    /insertAdjacentHTML\s*\(/,
    /document\.write\s*\(/,
    /\beval\s*\(/,
    /new\s+Function\s*\(/,
  ];
  const violations = [];
  for (const file of await sourceFiles('src')) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbidden) if (pattern.test(source)) violations.push(`${file}: ${pattern}`);
  }
  assert.deepEqual(violations, []);
});

async function sourceFiles(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await sourceFiles(file));
    else if (/\.(?:js|jsx|ts|tsx)$/.test(entry.name)) output.push(file);
  }
  return output;
}

async function registerOtpHandlersFromSource(overrides = {}) {
  // Exercise the real React component's auth handlers without mounting the
  // browser or calling Core. The hosted R3m gate covers the real browser path.
  const source = await readFile('src/pages/Register.jsx', 'utf8');
  const start = source.indexOf('  const handleSubmit = async (e) => {');
  const end = source.indexOf('\n  if (showOtp)', start);
  assert.ok(start >= 0 && end > start, 'registration handlers must be present');
  const context = {
    coreClient: { auth: {} },
    t: key => key,
    email: 'user@example.test',
    password: 'password',
    confirmPassword: 'password',
    otpCode: '123456',
    verificationHandle: 'verified-attempt-handle',
    requestInFlight: { current: false },
    setError: () => {},
    setLoading: () => {},
    setShowOtp: () => {},
    setVerificationHandle: () => {},
    toast: () => {},
    window: { location: { href: '/register' } },
    ...overrides,
  };
  const handlers = runInNewContext(
    source.slice(start, end) + '\n({ handleSubmit, handleVerify, handleResend, handleGoogle })',
    context,
  );
  return { ...handlers, context, source };
}

test('registration cannot submit twice before React loading state renders', async () => {
  let resolveRegistration;
  const pending = new Promise(resolve => { resolveRegistration = resolve; });
  let requests = 0;
  let shown = false;
  let savedHandle = '';
  const { handleSubmit, context } = await registerOtpHandlersFromSource({
    coreClient: { auth: { register: () => { requests += 1; return pending; } } },
    setShowOtp: value => { shown = value; },
    setVerificationHandle: value => { savedHandle = value; },
  });
  const event = { preventDefault() {} };
  const first = handleSubmit(event);
  const second = handleSubmit(event);
  assert.equal(requests, 1);
  resolveRegistration({ verification_handle: 'verified-attempt-handle' });
  await Promise.all([first, second]);
  assert.equal(savedHandle, 'verified-attempt-handle');
  assert.equal(shown, true);
  assert.equal(context.requestInFlight.current, false);
});

test('malformed registration response never opens an unusable OTP screen', async () => {
  let shown = false;
  const errors = [];
  const { handleSubmit, context } = await registerOtpHandlersFromSource({
    coreClient: { auth: { register: async () => ({}) } },
    setShowOtp: value => { shown = value; },
    setError: value => errors.push(value),
  });
  await handleSubmit({ preventDefault() {} });
  assert.equal(shown, false);
  assert.ok(errors.includes('authUi.registrationFailed'));
  assert.equal(context.requestInFlight.current, false);
});

test('OTP resend and verification share a lock, and network failures permit safe retry', async () => {
  let rejectResend;
  const pending = new Promise((_, reject) => { rejectResend = reject; });
  let resendCalls = 0;
  let verifyCalls = 0;
  const loading = [];
  const errors = [];
  const { handleResend, handleVerify, context, source } = await registerOtpHandlersFromSource({
    coreClient: { auth: {
      resendOtp: () => { resendCalls += 1; return resendCalls === 1 ? pending : Promise.resolve({}); },
      verifyOtp: async () => { verifyCalls += 1; },
    } },
    setLoading: value => loading.push(value),
    setError: value => errors.push(value),
  });
  const first = handleResend();
  await handleResend();
  await handleVerify();
  assert.equal(resendCalls, 1);
  assert.equal(verifyCalls, 0);
  rejectResend(new TypeError('offline private network details'));
  await first;
  assert.deepEqual(errors.filter(Boolean), ['errors.network']);
  assert.equal(context.requestInFlight.current, false);
  await handleResend();
  await handleVerify();
  assert.equal(resendCalls, 2);
  assert.equal(verifyCalls, 1);
  assert.equal(loading.at(-1), false);
  assert.match(source, /disabled=\{loading \|\| !verificationHandle\}/);
  assert.match(source, /<InputOTP[^>]*disabled=\{loading\}/);
  assert.match(source, /role="alert"/);
});

test('Register and OTP expose only localized recovery for HTTP failures', async () => {
  const sensitive = 'private Core response and verification details';
  const errors = [];
  const { handleSubmit, handleVerify, handleResend, source } = await registerOtpHandlersFromSource({
    coreClient: { auth: {
      register: async () => { throw Object.assign(new Error(sensitive), { status: 409 }); },
      verifyOtp: async () => { throw Object.assign(new Error(sensitive), { status: 400 }); },
      resendOtp: async () => { throw Object.assign(new Error(sensitive), { status: 429 }); },
    } },
    setError: value => errors.push(value),
  });
  await handleSubmit({ preventDefault() {} });
  await handleVerify();
  await handleResend();
  assert.deepEqual(errors.filter(Boolean), [
    'authUi.registrationFailed',
    'authUi.invalidCode',
    'authUi.resendFailed',
  ]);
  assert.equal(errors.join(' ').includes(sensitive), false);
  assert.doesNotMatch(source, /setError\(err\.message/);
});

test('Register Google navigation shares the single-flight lock and recovers safely', async () => {
  let providerCalls = 0;
  let registerCalls = 0;
  let failProvider = true;
  const errors = [];
  const { handleGoogle, handleSubmit, context, source } = await registerOtpHandlersFromSource({
    coreClient: { auth: {
      loginWithProvider: () => {
        providerCalls += 1;
        if (failProvider) throw new TypeError('private provider navigation details');
      },
      register: async () => { registerCalls += 1; },
    } },
    setError: value => errors.push(value),
  });
  handleGoogle();
  assert.equal(providerCalls, 1);
  assert.deepEqual(errors.filter(Boolean), ['errors.network']);
  assert.equal(context.requestInFlight.current, false);
  failProvider = false;
  handleGoogle();
  handleGoogle();
  await handleSubmit({ preventDefault() {} });
  assert.equal(providerCalls, 2);
  assert.equal(registerCalls, 0);
  assert.equal(context.requestInFlight.current, true);
  assert.match(source, /onClick=\{handleGoogle\} disabled=\{loading\}/);
  assert.match(source, /aria-busy=\{loading\}/);
  for (const id of ['email', 'password', 'confirm']) {
    assert.match(source, new RegExp(`<Input id="${id}"[^\\n]*disabled=\\{loading\\}`));
  }
});
