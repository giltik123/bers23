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

test('bounded Agent composition does not gain provider, billing or HTTP authority in the server-only slice', async () => {
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
  assert.equal(server.includes('boundedDeterministic'), false, 'server-only slice must not expose bounded Agent through HTTP yet');
  assert.equal(server.includes('/api/core/agent'), false, 'server-only slice must not add an Agent HTTP namespace yet');
});
