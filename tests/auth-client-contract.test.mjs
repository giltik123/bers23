import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

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
  assert.match(editor, /inputArtifactId:\s*project\.current_image_artifact_id/);
});

test('creative client uses explicit Core endpoint and preserves public error fields', async () => {
  const client = await readFile('src/api/coreClient.js', 'utf8');
  assert.match(client, /creative:\s*{/);
  assert.match(client, /request\('\/creative\/execute'/);
  for (const field of ['status', 'code', 'correlationId', 'retryable']) assert.match(client, new RegExp(`error\\.${field}`));
});
