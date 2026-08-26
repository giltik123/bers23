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
test('Editor chain cancellation and credit estimate stay bound to the active execution/planning objects', async () => {
  const source = await readFile('src/pages/Editor.jsx', 'utf8');
  assert.match(source, /onCancel=\{\(\) => legacyRecipeExecutionAdapter\.cancel\(\)\}/);
  assert.doesNotMatch(source, /\bchainRunner\b/);
  assert.match(source, /<CreditsBar estimate=\{!pendingResult && plan\?\.status === 'ready' \? \(plan\.credits\?\.credits \?\? 0\) : 0\} \/>/);
  assert.doesNotMatch(source, /\bcreditsCalculator\b/);
});
test('zero-object projects keep the canonical whole-image prompt path reachable', async () => {
  const source = await readFile('src/pages/Editor.jsx', 'utf8');
  assert.match(source, /\{objects\.length === 0 && !pendingResult && \(/);
  assert.match(source, /Object detection is optional/);
  assert.match(source, /\) : objects\.length === 0 \? \([\s\S]*?<InstructionBar[\s\S]*?onApply=\{\(\) => applyEdit\(false\)\}/);
  assert.doesNotMatch(source, /\{objects\.length === 0 \? \(\s*<Button[\s\S]*?\) : pendingResult \?/);
});
