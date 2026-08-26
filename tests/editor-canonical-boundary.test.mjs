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

test('browser financial surfaces and legacy writers cannot mutate privileged authority', async () => {
  const subscriptionPage = await readFile('src/pages/Subscription.jsx', 'utf8');
  const settingsCard = await readFile('src/components/subscription/SubscriptionSettingsCard.jsx', 'utf8');
  const creditsBar = await readFile('src/components/editor/credits/CreditsBar.jsx', 'utf8');
  const projectService = await readFile('src/lib/projectService.js', 'utf8');
  const authority = await readFile('src/lib/financial/clientFinancialAuthority.js', 'utf8');
  const eslint = await readFile('eslint.config.js', 'utf8');

  for (const source of [subscriptionPage, settingsCard]) {
    for (const forbidden of ['subscriptionManager', 'creditsWallet', 'changePlan(', 'startTrial(', 'coreClient.entities']) assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.doesNotMatch(creditsBar, /creditsWallet|Balance:|Reserved:|After:/);
  assert.match(creditsBar, /Advisory only/);
  assert.doesNotMatch(projectService, /subscriptionValidator|subscriptionUsage/);
  assert.match(projectService, /coreClient\.projects\.createFromFile/);
  assert.match(authority, /CLIENT_FINANCIAL_AUTHORITY_DISABLED/);

  for (const file of [
    'src/lib/credits/creditsManager.js',
    'src/lib/credits/creditsReservation.js',
    'src/lib/credits/creditsWallet.js',
    'src/lib/subscriptions/subscriptionManager.js',
    'src/lib/subscriptions/subscriptionUsage.js',
  ]) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /requireServerFinancialAuthority/);
    assert.doesNotMatch(source, /coreClient\.entities\.(CreditsWallet|CreditTransaction|UserSubscription|SubscriptionUsage)\.(create|update|delete|bulkCreate)/);
  }

  for (const legacyException of [
    'src/lib/credits/creditsManager.js',
    'src/lib/credits/creditsReservation.js',
    'src/lib/credits/creditsWallet.js',
    'src/lib/subscriptions/subscriptionManager.js',
    'src/lib/subscriptions/subscriptionUsage.js',
  ]) assert.equal(eslint.includes(`\"${legacyException}\"`), false, legacyException);
  assert.match(eslint, /callee\.object\.object\.object\.name='coreClient'/);
});
