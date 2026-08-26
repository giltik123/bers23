import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('Editor single-edit path crosses only an application boundary', async () => { const source = await readFile('src/pages/Editor.jsx', 'utf8'); for (const forbidden of ['editingEngine', 'creditsEngine', 'reveProvider', 'providers/fal', 'provider-runtime', 'server/transactions']) assert.equal(source.includes(forbidden), false, forbidden); assert.match(source, /creativeEditApplicationService\.execute/); });
test('application edit adapter sends no server-authoritative fields', async () => { const source = await readFile('src/application/creative/CreativeEditApplicationService.js', 'utf8'); assert.match(source, /coreClient\.creative\.execute/); for (const forbidden of ['walletBalance', 'reservationStatus', 'authorizationResult', 'retryCount', 'FAL_KEY', 'REVE_KEY']) assert.equal(source.includes(forbidden), false); });
test('browser source imports no transaction internals and canonical edit boundaries contain no provider secrets', async () => { for (const file of await collect('src')) { const source = await readFile(file, 'utf8'); assert.equal(/from ['"][^'"]*server\/transactions/.test(source), false, file); } for (const file of ['src/pages/Editor.jsx', 'src/application/creative/CreativeEditApplicationService.js', 'src/api/coreClient.js']) { const source = await readFile(file, 'utf8'); assert.equal(/\b(FAL_KEY|REVE_KEY|FASHN_KEY)\b/.test(source), false, file); } });
async function collect(directory) { const entries = await readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? collect(join(directory, entry.name)) : [join(directory, entry.name)]))).flat().filter((file) => /\.(js|jsx|ts|tsx)$/.test(file)); }
test('Editor selection uses the Core mask port and never manufactures a mask UUID', async () => { const source = await readFile('src/pages/Editor.jsx', 'utf8'); assert.match(source, /new CoreMaskArtifactPort\(project\.id\)/); assert.doesNotMatch(source, /persist:\s*async[\s\S]*randomUUID/); assert.match(source, /mask_artifact_id: artifact\.id/); });
test('Core mask port sends exact alpha and maps the server artifact identity', async () => { const source = await readFile('src/application/selection/CoreMaskArtifactPort.js', 'utf8'); assert.match(source, /alpha: mask\.alpha/); assert.match(source, /id: response\.artifactId/); assert.match(source, /ALPHA_8_LOSSLESS/); });

test('Automation Studio remains preview-only until durable server execution authority exists', async () => {
  const page = await readFile('src/pages/AutomationStudio.jsx', 'utf8');
  const runner = await readFile('src/lib/automation/AutomationRunner.js', 'utf8');
  for (const forbidden of ['coreClient', 'automationManager', 'automationHistory', 'AutomationHistoryPanel']) assert.equal(page.includes(forbidden), false, forbidden);
  assert.match(page, /automationRunner\.plan\(/);
  assert.doesNotMatch(page, /automationRunner\.run\(/);
  assert.match(page, /previewOnly/);
  assert.match(runner, /status:\s*'PLANNED_NOT_EXECUTED'/);
  assert.match(runner, /conditionsEvaluated:\s*Boolean\(context\)/);
  assert.match(runner, /AUTOMATION_EXECUTION_NOT_WIRED/);
  for (const forbidden of ['jobManager', 'automationHistory', "status: 'completed'", 'credits_consumed']) assert.equal(runner.includes(forbidden), false, forbidden);
});
