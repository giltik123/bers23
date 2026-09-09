import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const factoryUrl = new URL('./createProductionAutomation.ts', import.meta.url);
const serverUrl = new URL('../../index.ts', import.meta.url);

test('C3b production Automation composition reuses accepted Agent and Artifact authorities without parallel execution state', async () => {
  const [factory, server] = await Promise.all([
    readFile(factoryUrl, 'utf8'),
    readFile(serverUrl, 'utf8'),
  ]);

  assert.match(factory, /new PostgresAutomationDefinitionStore\(input\.pool, input\.limits\)/);
  assert.match(factory, /new PostgresAutomationInvocationStore\(input\.pool\)/);
  assert.match(factory, /new AutomationManualExecutionService\(Object\.freeze\(\{[\s\S]*invocations,[\s\S]*agent: input\.boundedAgent,[\s\S]*artifacts: input\.artifacts/);
  assert.doesNotMatch(factory, /new BoundedAgentDeterministicWorkflowService/);
  assert.doesNotMatch(factory, /new SignedArtifactAuthority/);
  assert.doesNotMatch(factory, /new PostgresExecutionRunRegistry/);
  assert.doesNotMatch(factory, /new PostgresWorkflowContinuationStore/);

  assert.match(server, /const automation = createProductionAutomation\(\{[\s\S]*pool: production\.transactions\.pool,[\s\S]*boundedAgent: production\.agent\.boundedDeterministic,[\s\S]*artifacts: production\.artifacts\.external,[\s\S]*limits:/);
  assert.match(server, /createAutomationDefinitionHttpAdapter\(\{ definitions: automation\.definitions,/);
  assert.doesNotMatch(server, /new PostgresAutomationDefinitionStore/);
  assert.match(server, /migrateAutomationInvocationSchema\(production\.transactions\.pool\)/);
  assert.match(server, /checkAutomationInvocationSchema\(production\.transactions\.pool\)/);
  assert.doesNotMatch(server, /automation\.manualExecution\.(?:start|resume|submitLocalResult|retry|cancel)/);
});
