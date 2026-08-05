import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { GovernanceManager } from '../src/application/governance/index.ts';

const adminContext = { tenantId: 'tenant-1', organizationId: 'org-1', actorId: 'admin-1' };
const executionContext = { tenantId: 'tenant-1', organizationId: 'org-1', teamId: 'team-1', projectId: 'project-1', userId: 'user-1', workflowId: 'fashion-image', providerId: 'stable-provider', estimatedCost: 50, userPermissions: ['assets.read'] };

function setup() { return new GovernanceManager(() => 1000); }

test('policy creation', () => {
  const manager = setup();
  const policy = manager.createPolicy(adminContext, { policyId: 'budget-policy', name: 'Budget cap', category: 'BUDGET', rules: [{ rule: 'maximum workflow cost per execution', limit: 100 }] });
  assert.equal(policy.category, 'BUDGET');
  assert.equal(policy.rules[0].limit, 100);
  assert.equal(manager.listPolicies(adminContext).length, 1);
});

test('policy update', () => {
  const manager = setup();
  manager.createPolicy(adminContext, { policyId: 'budget-policy', name: 'Budget cap', category: 'BUDGET', rules: [{ rule: 'maximum workflow cost per execution', limit: 100 }] });
  const updated = manager.updatePolicy(adminContext, 'budget-policy', { name: 'Strict budget cap', rules: [{ rule: 'maximum workflow cost per execution', limit: 25 }] });
  assert.equal(updated.name, 'Strict budget cap');
  assert.equal(updated.rules[0].limit, 25);
});

test('budget restriction', () => {
  const manager = setup();
  manager.createPolicy(adminContext, { policyId: 'budget-policy', name: 'Budget cap', category: 'BUDGET', rules: [{ rule: 'maximum workflow cost per execution', limit: 40 }] });
  const decision = manager.evaluate({ ...executionContext, estimatedCost: 50 });
  assert.equal(decision.allowed, false);
  assert.equal(decision.violations[0].type, 'BUDGET_EXCEEDED');
  assert.equal(decision.reason, 'Budget limit exceeded');
});

test('provider restriction', () => {
  const manager = setup();
  manager.createPolicy(adminContext, { policyId: 'provider-policy', name: 'Disable experimental providers', category: 'PROVIDER', rules: [{ rule: 'disable experimental providers', providers: ['experimental-provider'] }] });
  const decision = manager.evaluate({ ...executionContext, providerId: 'experimental-provider' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.violations[0].type, 'PROVIDER_RESTRICTED');
});

test('workflow restriction', () => {
  const manager = setup();
  manager.createPolicy(adminContext, { policyId: 'workflow-policy', name: 'Allowed workflows', category: 'WORKFLOW', rules: [{ rule: 'only approved workflows', workflows: ['catalog-workflow'] }] });
  const decision = manager.evaluate({ ...executionContext, workflowId: 'fashion-image' });
  assert.equal(decision.allowed, false);
  assert.equal(decision.violations[0].type, 'WORKFLOW_NOT_ALLOWED');
});

test('permission validation', () => {
  const manager = setup();
  manager.createPolicy(adminContext, { policyId: 'data-policy', name: 'Asset access', category: 'DATA_ACCESS', rules: [{ rule: 'requires private asset access', permissions: ['private-assets.read'] }] });
  const denied = manager.evaluate({ ...executionContext, userPermissions: ['assets.read'] });
  const allowed = manager.evaluate({ ...executionContext, userPermissions: ['assets.read', 'private-assets.read'] });
  assert.equal(denied.allowed, false);
  assert.equal(denied.violations[0].type, 'DATA_ACCESS_DENIED');
  assert.equal(allowed.allowed, true);
});

test('violation history', () => {
  const manager = setup();
  manager.createPolicy(adminContext, { policyId: 'budget-policy', name: 'Budget cap', category: 'BUDGET', rules: [{ rule: 'maximum workflow cost per execution', limit: 10 }] });
  manager.evaluate({ ...executionContext, estimatedCost: 50 });
  assert.deepEqual(manager.history.list('tenant-1', 'org-1').map((event) => event.type), ['policy.created', 'execution.blocked', 'violation.created']);
});

test('organization isolation', () => {
  const manager = setup();
  manager.createPolicy(adminContext, { policyId: 'budget-policy', name: 'Budget cap', category: 'BUDGET', rules: [{ rule: 'maximum workflow cost per execution', limit: 10 }] });
  const decision = manager.evaluate({ ...executionContext, organizationId: 'org-2', estimatedCost: 50 });
  assert.equal(decision.allowed, true);
  assert.equal(manager.listPolicies({ tenantId: 'tenant-1', organizationId: 'org-2', actorId: 'admin-1' }).length, 0);
});

test('immutable snapshots', () => {
  const manager = setup();
  const policy = manager.createPolicy(adminContext, { policyId: 'budget-policy', name: 'Budget cap', category: 'BUDGET', rules: [{ rule: 'maximum workflow cost per execution', limit: 10 }] });
  manager.evaluate({ ...executionContext, estimatedCost: 50 });
  const events = manager.history.list('tenant-1', 'org-1');
  assert.equal(Object.isFrozen(policy), true);
  assert.equal(Object.isFrozen(policy.rules), true);
  assert.equal(Object.isFrozen(events), true);
  assert.equal(Object.isFrozen(events[0].snapshot), true);
});

test('debug snapshot', () => {
  const manager = setup();
  manager.createPolicy(adminContext, { policyId: 'budget-policy', name: 'Budget cap', category: 'BUDGET', rules: [{ rule: 'maximum workflow cost per execution', limit: 10 }] });
  const decision = manager.evaluate({ ...executionContext, estimatedCost: 50 });
  const snapshot = manager.debug(adminContext);
  assert.equal(snapshot.organization, 'org-1');
  assert.equal(snapshot.policies.length, 1);
  assert.equal(snapshot.rules[0].rule, 'maximum workflow cost per execution');
  assert.equal(snapshot.decision?.id, decision.id);
  assert.equal(snapshot.violations[0].type, 'BUDGET_EXCEEDED');
});

test('forbidden imports', () => {
  const files = ['GovernanceManager.ts', 'GovernanceEvaluator.ts', 'GovernanceHistory.ts', 'GovernanceDebugger.ts', 'GovernanceModel.ts'];
  const forbidden = /from ['"](?:\.\.\/)+(?:platform|workspace|memory|providers|runtime|agent|workflow|collaboration|organization|billing)/;
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), 'src/application/governance', file), 'utf8');
    assert.equal(forbidden.test(source), false, file);
  }
});
