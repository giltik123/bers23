import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const factoryUrl = new URL('./createProductionAutomation.ts', import.meta.url);
const serverUrl = new URL('../../index.ts', import.meta.url);

test('C3d production Automation composition reuses accepted Agent/Artifact/execution authorities without parallel state', async () => {
  const [factory, server] = await Promise.all([
    readFile(factoryUrl, 'utf8'),
    readFile(serverUrl, 'utf8'),
  ]);

  assert.match(factory, /new PostgresAutomationDefinitionStore\(input\.pool, input\.limits\)/);
  assert.match(factory, /new PostgresAutomationInvocationStore\(input\.pool\)/);
  assert.match(factory, /new PostgresAutomationScheduleStore\(input\.pool\)/);
  assert.match(factory, /new AutomationManualExecutionService\(Object\.freeze\(\{[\s\S]*invocations,[\s\S]*agent: input\.boundedAgent,[\s\S]*artifacts: input\.artifacts/);
  assert.match(factory, /new AutomationScheduleWorker\(Object\.freeze\(\{[\s\S]*schedules,[\s\S]*invocations,[\s\S]*execution: manualExecution/);
  assert.doesNotMatch(factory, /new BoundedAgentDeterministicWorkflowService/);
  assert.doesNotMatch(factory, /new SignedArtifactAuthority/);
  assert.doesNotMatch(factory, /new PostgresExecutionRunRegistry/);
  assert.doesNotMatch(factory, /new PostgresWorkflowContinuationStore/);
  assert.doesNotMatch(factory, /providerSelector|billing|creditsWallet/);

  assert.match(server, /const automation = createProductionAutomation\(\{[\s\S]*pool: production\.transactions\.pool,[\s\S]*boundedAgent: production\.agent\.boundedDeterministic,[\s\S]*artifacts: production\.artifacts\.external,[\s\S]*limits:/);
  assert.match(server, /createAutomationDefinitionHttpAdapter\(\{ definitions: automation\.definitions,/);
  assert.match(server, /createAutomationManualExecutionHttpAdapter\(\{[\s\S]*execution: automation\.manualExecution,[\s\S]*auth: production\.auth,[\s\S]*accepting: \(\) => accepting/);
  assert.match(server, /createAutomationScheduleHttpAdapter\(\{[\s\S]*schedules: automation\.schedules,[\s\S]*auth: production\.auth,[\s\S]*accepting: \(\) => accepting/);
  assert.match(server, /new AutomationSchedulePoller\(automation\.scheduleWorker/);
  assert.match(server, /automationSchedulePoller\.start\(\)/);
  assert.match(server, /await automationSchedulePoller\.stop\(\)/);
  assert.match(server, /if \(path === AUTOMATION_SCHEDULE_PATH \|\| path\.startsWith\(`\$\{AUTOMATION_SCHEDULE_PATH\}\/`\)\) return void automationScheduleAdapter\(request, response\);/);
  assert.match(server, /if \(isAutomationManualExecutionPath\(path\)\) return void automationManualExecutionAdapter\(request, response\);[\s\S]*AUTOMATION_DEFINITION_PATH/);
  assert.doesNotMatch(server, /new PostgresAutomationDefinitionStore/);
  assert.doesNotMatch(server, /new PostgresAutomationScheduleStore/);
  assert.match(server, /migrateAutomationInvocationSchema\(production\.transactions\.pool\)/);
  assert.match(server, /migrateAutomationScheduleSchema\(production\.transactions\.pool\)/);
  assert.match(server, /checkAutomationInvocationSchema\(production\.transactions\.pool\)/);
  assert.match(server, /checkAutomationScheduleSchema\(production\.transactions\.pool\)/);
  assert.doesNotMatch(server, /automation\.manualExecution\.(?:start|resume|submitLocalResult|retry|cancel)/);
});
