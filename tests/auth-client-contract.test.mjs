import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Login method exists and stores only the canonical access token', async () => { const client = await readFile('src/api/coreClient.js', 'utf8'); const login = await readFile('src/pages/Login.jsx', 'utf8'); assert.match(login, /coreClient\.auth\.loginViaEmailPassword/); assert.match(client, /loginViaEmailPassword/); assert.match(client, /result\?\.access_token/); assert.match(client, /localStorage\.setItem\('core_access_token', result\.access_token\)/); assert.equal(/setItem\([^,]+,\s*password/.test(client), false); assert.equal(/console\..*access_token/.test(client), false); });
test('creative client uses the explicit Core endpoint and preserves public error fields', async () => { const client = await readFile('src/api/coreClient.js', 'utf8'); assert.match(client, /creative:\s*{/); assert.match(client, /request\('\/creative\/execute'/); for (const field of ['status', 'code', 'correlationId', 'retryable']) assert.match(client, new RegExp(`error\\.${field}`)); });
