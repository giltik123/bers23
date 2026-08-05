import assert from 'node:assert/strict';
import test from 'node:test';
import { StateManager } from '../src/application/state/index.ts';

const scope = { userId: 'user-1', tenantId: 'tenant-1', projectId: 'project-1' };

const makeManager = () => {
  const manager = new StateManager();
  const state = manager.create({ ...scope, id: 'state-1', workspaceId: 'workspace-1' });
  return { manager, state };
};

test('create state', () => {
  const { state } = makeManager();

  assert.equal(state.id, 'state-1');
  assert.equal(state.status, 'INITIALIZING');
  assert.equal(state.workspaceId, 'workspace-1');
  assert.deepEqual(state.activeAssets, []);
  assert.ok(Object.isFrozen(state));
});

test('lifecycle transitions', () => {
  const { manager } = makeManager();

  assert.equal(manager.transition('state-1', 'READY', scope).status, 'READY');
  assert.equal(manager.transition('state-1', 'PROCESSING', scope).status, 'PROCESSING');
  assert.equal(manager.transition('state-1', 'WAITING_USER', scope).status, 'WAITING_USER');
  assert.equal(manager.transition('state-1', 'PROCESSING', scope).status, 'PROCESSING');
  assert.equal(manager.transition('state-1', 'COMPLETED', scope).status, 'COMPLETED');
});

test('invalid transition rejection', () => {
  const { manager } = makeManager();

  manager.transition('state-1', 'READY', scope);
  manager.transition('state-1', 'PROCESSING', scope);
  manager.transition('state-1', 'COMPLETED', scope);

  assert.throws(() => manager.transition('state-1', 'PROCESSING', scope), /Invalid application state transition/);

  const failed = manager.create({ ...scope, id: 'state-failed' });
  assert.equal(failed.status, 'INITIALIZING');
  manager.transition('state-failed', 'FAILED', scope);
  assert.throws(() => manager.transition('state-failed', 'READY', scope), /Invalid application state transition/);
});

test('workspace binding', () => {
  const { manager } = makeManager();
  const updated = manager.update('state-1', { workspaceId: 'workspace-2' }, scope);

  assert.equal(updated.workspaceId, 'workspace-2');
  assert.equal(manager.inspect('state-1', scope).workspaceId, 'workspace-2');
});

test('session binding', () => {
  const { manager } = makeManager();
  const updated = manager.update('state-1', { sessionId: 'session-1', experienceId: 'experience-1' }, scope);

  assert.equal(updated.sessionId, 'session-1');
  assert.equal(updated.experienceId, 'experience-1');
});

test('decision flow', () => {
  const { manager } = makeManager();

  manager.transition('state-1', 'READY', scope);
  manager.transition('state-1', 'PROCESSING', scope);
  const decision = manager.requestDecision('state-1', 'Confirm catalog image workflow', scope, { risk: 'medium' });

  assert.equal(decision.status, 'pending');
  assert.equal(manager.load('state-1', scope).status, 'WAITING_USER');
  assert.equal(manager.listPending('state-1', scope).length, 1);
  assert.equal(manager.approveDecision('state-1', decision.id, scope).status, 'approved');
  assert.equal(manager.listPending('state-1', scope).length, 0);

  const rejected = manager.requestDecision('state-1', 'Reject unsafe output', scope);
  assert.equal(manager.rejectDecision('state-1', rejected.id, scope).status, 'rejected');

  const expired = manager.requestDecision('state-1', 'User timeout', scope);
  assert.equal(manager.expireDecision('state-1', expired.id, scope).status, 'expired');
});

test('snapshot immutability', () => {
  const { manager } = makeManager();

  manager.update('state-1', {
    currentCommand: 'command-1',
    currentWorkflow: 'workflow-1',
    currentExecution: 'execution-1',
    activeAssets: ['asset-1'],
    progress: { step: 'rendering', percent: 50 },
  }, scope);
  const snapshot = manager.snapshot('state-1', scope);

  assert.equal(snapshot.workflow.id, 'workflow-1');
  assert.equal(snapshot.execution.id, 'execution-1');
  assert.deepEqual(snapshot.assets, ['asset-1']);
  assert.equal(snapshot.progress.percent, 50);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.state));
  assert.throws(() => { (snapshot as unknown as { assets: string[] }).assets = []; }, /read only|Cannot assign/i);
});

test('recovery', () => {
  const { manager } = makeManager();

  manager.transition('state-1', 'READY', scope);
  manager.transition('state-1', 'PROCESSING', scope);
  const decision = manager.requestDecision('state-1', 'Confirm execution', scope);
  manager.update('state-1', {
    currentWorkflow: 'workflow-1',
    currentExecution: 'execution-1',
    activeAssets: ['asset-1'],
    progress: { step: 'executing', percent: 65 },
  }, scope);
  const snapshot = manager.snapshot('state-1', scope);
  manager.update('state-1', { currentWorkflow: 'workflow-2', currentExecution: 'execution-2', activeAssets: ['asset-2'] }, scope);

  const restored = manager.restore('state-1', scope);
  assert.equal(restored.currentWorkflow, 'workflow-1');
  assert.equal(restored.currentExecution, 'execution-1');
  assert.deepEqual(restored.activeAssets, ['asset-1']);
  assert.equal(restored.progress.percent, 65);
  assert.equal(restored.pendingDecisions[0].id, decision.id);
  assert.deepEqual(snapshot.decisions.map((item) => item.id), [decision.id]);

  const recovered = manager.recover('state-1', scope);
  assert.equal(recovered.currentWorkflow, 'workflow-1');
});

test('debug tree', () => {
  const { manager } = makeManager();

  manager.update('state-1', {
    sessionId: 'session-1',
    experienceId: 'experience-1',
    currentCommand: 'command-1',
    currentWorkflow: 'workflow-1',
    currentExecution: 'execution-1',
    activeAssets: ['asset-1'],
  }, scope);
  const tree = manager.debug('state-1', scope);

  assert.equal(tree.applicationState.id, 'state-1');
  assert.equal(tree.user.id, 'user-1');
  assert.equal(tree.project.id, 'project-1');
  assert.equal(tree.workspace.id, 'workspace-1');
  assert.equal(tree.session.id, 'session-1');
  assert.equal(tree.command.id, 'command-1');
  assert.equal(tree.experience.id, 'experience-1');
  assert.equal(tree.workflow.id, 'workflow-1');
  assert.equal(tree.execution.id, 'execution-1');
  assert.deepEqual(tree.assets, ['asset-1']);
  assert.ok(tree.timeline.some((event) => event.type === 'command.received'));
});

test('tenant isolation', () => {
  const { manager } = makeManager();

  assert.throws(() => manager.load('state-1', { ...scope, tenantId: 'tenant-2' }), /access denied/i);
  assert.throws(() => manager.debug('state-1', { ...scope, projectId: 'project-2' }), /access denied/i);
  manager.snapshot('state-1', scope);
  assert.throws(() => manager.restore('state-1', { ...scope, userId: 'user-2' }), /access denied/i);
});

test('forbidden imports', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const statePath = `${process.cwd()}/src/application/state`;
  const files = (await readdir(statePath)).filter((file) => file.endsWith('.ts'));

  for (const file of files) {
    const source = await readFile(`${statePath}/${file}`, 'utf8');
    assert.doesNotMatch(
      source,
      /from ['"]\.\.\/(workspace|commands|gateway)|from ['"]\.\.\/\.\.\/(platform|lib)/,
    );
  }
});
