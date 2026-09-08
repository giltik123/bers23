import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const productionCoreUrl = new URL('./createProductionCore.ts', import.meta.url);
const serverUrl = new URL('../../index.ts', import.meta.url);

function occurrences(source, needle) {
  return source.split(needle).length - 1;
}

test('bounded Agent production composition reuses the canonical PostgreSQL authorities', async () => {
  const source = await readFile(productionCoreUrl, 'utf8');

  assert.equal(occurrences(source, 'new PostgresImageArtifactStore('), 1, 'production composition must own exactly one image Artifact store instance');
  assert.equal(occurrences(source, 'new PostgresProjectStore('), 1, 'production composition must own exactly one Project store instance');
  assert.equal(occurrences(source, 'new PostgresWorkflowContinuationStore('), 1, 'production composition must own exactly one workflow continuation store instance');

  assert.match(source, /const artifacts = new ArtifactAuthority\(externalArtifacts, maskArtifacts, imageArtifacts\);/);
  assert.match(source, /const workflowBoundLocalExecutionV2 = new WorkflowBoundLocalExecutionTicketV2Issuer\(localExecution, localExecutionAdmission\);/);
  assert.match(source, /localExecutionV2: workflowBoundLocalExecutionV2/);
  assert.equal(occurrences(source, 'continuations: workflowContinuations'), 2, 'Agent and Local Composite must share one continuation authority');

  assert.match(source, /const durableArtifactResolver = new DurableArtifactLineageResolver\(\{ signed: externalArtifacts, images: imageArtifacts, masks: maskArtifacts \}\);/);
  assert.match(source, /const deterministicWorkflowFinalRecovery = new DeterministicWorkflowStepFinalRecoveryAuthority\(\{/);
  assert.match(source, /const boundedAgent = new BoundedAgentDeterministicWorkflowService\(\{/);
  assert.match(source, /projects,\n      runs: executionRuns,\n      now,/);
  assert.match(source, /agent: Object\.freeze\(\{ boundedDeterministic: boundedAgent \}\)/);
});

test('bounded Agent gains only the dedicated HTTP transport and no provider or billing authority', async () => {
  const [source, server] = await Promise.all([
    readFile(productionCoreUrl, 'utf8'),
    readFile(serverUrl, 'utf8'),
  ]);
  const start = source.indexOf('const boundedAgent = new BoundedAgentDeterministicWorkflowService({');
  const end = source.indexOf('const admittedLocalComposite =', start);
  assert.ok(start >= 0 && end > start, 'bounded Agent composition block must be present');
  const block = source.slice(start, end);

  for (const forbidden of ['runtime,', 'transactions', 'providerSelector', 'creditsPerEdit', 'hardBudgetCredits', 'fal']) {
    assert.equal(block.includes(forbidden), false, `bounded Agent composition must not receive ${forbidden} authority`);
  }

  assert.match(server, /import \{ createBoundedAgentHttpAdapter \} from '\.\/core\/http\/boundedAgentHttpAdapter\.ts';/);
  assert.match(server, /const boundedAgentAdapter = createBoundedAgentHttpAdapter\(\{ workflow: production\.agent\.boundedDeterministic, auth: production\.auth, config \}\);/);
  assert.match(server, /startsWith\('\/api\/core\/agent\/bounded-deterministic\/'\)\) return void boundedAgentAdapter\(request, response\);/);
  assert.equal(server.includes("startsWith('/api/core/agent/')"), false, 'Core must not expose a generic Agent command namespace');
  assert.equal(server.includes('createAgentHttpAdapter'), false, 'Core must not introduce a generic Agent dispatcher');
});