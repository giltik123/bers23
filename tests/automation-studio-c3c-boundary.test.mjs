import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const PAGE = 'src/pages/AutomationStudio.jsx';
const STUDIO = 'src/components/automation/CanonicalAutomationStudio.jsx';
const CLIENT = 'src/api/automationClient.js';
const RUNNER = 'src/application/automation/createAutomationInvocationRunner.ts';

test('Automation Studio is canonical and does not revive legacy browser execution authority', async () => {
  const [page, studio, client, runner] = await Promise.all([PAGE, STUDIO, CLIENT, RUNNER].map(path => readFile(path, 'utf8')));

  assert.match(page, /CanonicalAutomationStudio/);
  for (const forbidden of ['automationRunner', 'AutomationBuilder', 'AutomationBuilderPanel', 'AutomationTemplateGallery']) assert.equal(page.includes(forbidden), false, forbidden);

  assert.match(studio, /automationClient\.definitions\.list/);
  assert.match(studio, /coreClient\.projects\.list/);
  assert.match(studio, /createAutomationInvocationRunner/);
  assert.match(studio, /coreClient\.projects\.acceptFinal/);
  for (const forbidden of ['coreClient.entities', '/data/', 'automationRunner', 'AutomationBuilder', 'providerSelector', 'billing', 'creditsWallet', 'run_ai_agent', 'scheduleDaily', 'scheduleWeekly']) assert.equal(studio.includes(forbidden), false, forbidden);

  assert.match(client, /\/automations\/\$\{encodeURIComponent\(token\(automationId, 'automationId'\)\)\}\/manual-runs/);
  assert.match(client, /\/automation-invocations\/\$\{encodeURIComponent\(token\(invocationId, 'invocationId'\)\)\}\/result/);
  assert.match(client, /X-Expected-Automation-Revision/);
  assert.match(client, /\/auth\/context/);
  assert.match(client, /X-Bers-CSRF-Token/);
  for (const forbidden of ['/agent/bounded-deterministic/', 'sourceArtifactId', 'provider', 'model', 'executionId']) assert.equal(client.includes(forbidden), false, forbidden);

  assert.match(runner, /CoreAuthorizedOrthogonalTransform/);
  assert.match(runner, /CoreAuthorizedResize/);
  assert.match(runner, /policy !== 'LOCAL_ONLY'/);
  assert.match(runner, /providerCalls !== 0/);
  assert.match(runner, /paidCloudCredits !== 0/);
  assert.match(runner, /Automation must not prepare a second orthogonal ticket/);
  assert.match(runner, /Automation must not finalize through standalone Resize transport/);
  assert.equal(runner.includes('/agent/bounded-deterministic/'), false);
  assert.equal(runner.includes('executionId'), false, 'Automation browser runner must not expose delegated Agent executionId');
});
