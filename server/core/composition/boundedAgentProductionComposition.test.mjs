import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const productionCoreUrl = new URL('./createProductionCore.ts', import.meta.url);
const boundedCompositionUrl = new URL('./createProductionBoundedAgentCompatibility.ts', import.meta.url);
const serverUrl = new URL('../../index.ts', import.meta.url);

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

test('bounded Agent production composition reuses canonical stores and exposes only the AE-4c.2 facade', async () => {
  const [source, bounded] = await Promise.all([
    readFile(productionCoreUrl, 'utf8'),
    readFile(boundedCompositionUrl, 'utf8'),
  ]);

  assert.equal(occurrences(source, 'new PostgresImageArtifactStore('), 1, 'production composition must own exactly one image Artifact store instance');
  assert.equal(occurrences(source, 'new PostgresProjectStore('), 1, 'production composition must own exactly one Project store instance');
  assert.equal(occurrences(source, 'new PostgresWorkflowContinuationStore('), 1, 'production composition must own exactly one workflow continuation store instance');

  assert.match(source, /const artifacts = new ArtifactAuthority\(externalArtifacts, maskArtifacts, imageArtifacts\);/);
  assert.match(source, /const workflowBoundLocalExecutionV2 = new WorkflowBoundLocalExecutionTicketV2Issuer\(localExecution, localExecutionAdmission\);/);
  assert.match(source, /localExecutionV2: workflowBoundLocalExecutionV2/);
  assert.equal(occurrences(source, 'continuations: workflowContinuations'), 2, 'bounded facade and Local Composite must share one continuation authority');
  assert.match(source, /await migrateAeeAdmittedPlanSchema\(transactions\.pool\)/);
  assert.match(source, /await checkAeeAdmittedPlanSchema\(transactions\.pool\)/);

  assert.match(source, /const durableArtifactResolver = new DurableArtifactLineageResolver\(\{ signed: externalArtifacts, images: imageArtifacts, masks: maskArtifacts \}\);/);
  assert.match(source, /const deterministicWorkflowFinalRecovery = new DeterministicWorkflowStepFinalRecoveryAuthority\(\{/);
  assert.match(source, /const boundedAgent = createProductionBoundedAgentCompatibility\(\{/);
  assert.match(source, /projects,\n      runs: executionRuns,\n      now,/);
  assert.match(source, /agent: Object\.freeze\(\{ boundedDeterministic: boundedAgent \}\)/);
  assert.equal(source.includes('new BoundedAgentDeterministicWorkflowService('), false, 'production root must not expose the legacy service directly');

  assert.equal(occurrences(bounded, 'new BoundedAgentDeterministicWorkflowService('), 1, 'one legacy instance may remain only as recovery delegate');
  assert.equal(occurrences(bounded, 'new PostgresAeeAdmittedPlanStore('), 1, 'one immutable AEE admitted-plan store is required');
  assert.equal(occurrences(bounded, 'new AeeSerialAdmittedGraphDriverV1('), 1, 'one generalized AEE execution driver is required');
  assert.equal(occurrences(bounded, 'new PostgresBoundedAgentCompatibilityAdmissionLock('), 1, 'one compatibility admission barrier is required');
  assert.equal(occurrences(bounded, 'new BoundedAgentAeeCompatibilityFacade('), 1, 'one compatibility facade is required');
  assert.match(bounded, /legacy,/);
  assert.match(bounded, /plans,/);
  assert.match(bounded, /aee,/);
  assert.match(bounded, /admission,/);
  assert.equal(bounded.includes('providerSelector'), false);
  assert.equal(bounded.includes('modelSelector'), false);
  assert.equal(bounded.includes('reserveCredits'), false);
  assert.equal(bounded.includes('spendCredits'), false);
});

test('bounded Agent keeps the dedicated HTTP transport and scoped terminal preview authority unchanged', async () => {
  const [source, bounded, server] = await Promise.all([
    readFile(productionCoreUrl, 'utf8'),
    readFile(boundedCompositionUrl, 'utf8'),
    readFile(serverUrl, 'utf8'),
  ]);
  const start = source.indexOf('const boundedAgent = createProductionBoundedAgentCompatibility({');
  const end = source.indexOf('const admittedLocalComposite =', start);
  assert.ok(start >= 0 && end > start, 'bounded Agent compatibility composition block must be present');
  const block = `${source.slice(start, end)}\n${bounded}`;

  for (const forbidden of ['providerSelector', 'creditsPerEdit', 'hardBudgetCredits', 'falWorkflowRuntime']) {
    assert.equal(block.includes(forbidden), false, `bounded Agent compatibility composition must not receive ${forbidden} authority`);
  }

  assert.match(server, /import \{ createBoundedAgentHttpAdapter \} from '\.\/core\/http\/boundedAgentHttpAdapter\.ts';/);
  const adapterStart = server.indexOf('const boundedAgentAdapter = createBoundedAgentHttpAdapter({');
  const adapterEnd = server.indexOf('  const orthogonalTransformAdapter =', adapterStart);
  assert.ok(adapterStart >= 0 && adapterEnd > adapterStart, 'bounded Agent HTTP adapter block must be present');
  const adapterBlock = server.slice(adapterStart, adapterEnd);
  assert.match(adapterBlock, /workflow: production\.agent\.boundedDeterministic/);
  assert.match(adapterBlock, /terminalPreview: Object\.freeze\(\{/);
  assert.match(adapterBlock, /resolveStoredFinalId\(artifactId, scope\)/);
  assert.match(adapterBlock, /issueStoredFinalDelivery\(stored\.storageId, scope, Date\.now\(\) \+ EXECUTION_RESULT_DELIVERY_TTL_MS\)/);
  assert.match(adapterBlock, /return `\/api\/core\/artifacts\/results\/\$\{encodeURIComponent\(deliveryToken\)\}`/);
  assert.match(adapterBlock, /auth: production\.auth/);
  assert.match(adapterBlock, /config,/);
  for (const forbidden of ['providerSelector', 'creditsPerEdit', 'hardBudgetCredits', 'FAL_KEY', 'falWorkflowRuntime']) {
    assert.equal(adapterBlock.includes(forbidden), false, `bounded Agent HTTP adapter must not receive ${forbidden} authority`);
  }

  assert.match(server, /startsWith\('\/api\/core\/agent\/bounded-deterministic\/'\)\) return void boundedAgentAdapter\(request, response\);/);
  assert.equal(server.includes("startsWith('/api/core/agent/')"), false, 'Core must not expose a generic Agent command namespace');
  assert.equal(server.includes('createAgentHttpAdapter'), false, 'Core must not introduce a generic Agent dispatcher');
});
