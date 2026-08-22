import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Login stores only the canonical access token and logout crosses the server boundary', async () => {
  const client = await readFile('src/api/coreClient.js', 'utf8');
  const login = await readFile('src/pages/Login.jsx', 'utf8');
  assert.match(login, /coreClient\.auth\.loginViaEmailPassword/);
  assert.match(client, /request\('\/auth\/password\/login'/);
  assert.match(client, /result\?\.access_token/);
  assert.match(client, /setItem\('core_access_token', result\.access_token\)/);
  assert.match(client, /request\('\/auth\/logout'/);
  assert.equal(/setItem\([^,]+,\s*password/.test(client), false);
  assert.equal(/console\..*access_token/.test(client), false);
});

test('AuthContext bootstraps from canonical persisted token without legacy public settings', async () => {
  const context = await readFile('src/lib/AuthContext.jsx', 'utf8');
  assert.match(context, /coreClient\.auth\.hasToken\(\)/);
  assert.match(context, /coreClient\.auth\.me\(\)/);
  assert.match(context, /coreClient\.auth\.clearToken\(\)/);
  assert.doesNotMatch(context, /appParams|publicSettings|\/config\/public/);
});

test('login to Projects to Editor critical path has no generic legacy API dependency', async () => {
  const [login, context, projects, projectService, editor] = await Promise.all([
    readFile('src/pages/Login.jsx', 'utf8'),
    readFile('src/lib/AuthContext.jsx', 'utf8'),
    readFile('src/pages/Projects.jsx', 'utf8'),
    readFile('src/lib/projectService.js', 'utf8'),
    readFile('src/pages/Editor.jsx', 'utf8'),
  ]);
  const critical = `${login}\n${context}\n${projects}\n${projectService}\n${editor}`;
  assert.doesNotMatch(critical, /\/config\/public|\/data\/|\/assets|\/commands\//);
  assert.doesNotMatch(critical, /coreClient\.entities|coreClient\.functions\.invoke|UploadFile/);
  assert.match(projectService, /coreClient\.projects/);
  assert.match(editor, /inputArtifactId:\s*project\.current_image_artifact_id/);
});

test('creative client uses the explicit Core endpoint and preserves public error fields', async () => {
  const client = await readFile('src/api/coreClient.js', 'utf8');
  assert.match(client, /creative:\s*{/);
  assert.match(client, /request\('\/creative\/execute'/);
  for (const field of ['status', 'code', 'correlationId', 'retryable']) assert.match(client, new RegExp(`error\\.${field}`));
});
