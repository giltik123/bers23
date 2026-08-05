import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkspaceManager } from '../src/application/workspace/index.ts';

const scope = { userId: 'user-1', tenantId: 'tenant-1', projectId: 'project-1' };
const makeManager = () => {
  const manager = new WorkspaceManager();
  const workspace = manager.create({ ...scope, id: 'workspace-1', name: 'Catalog Workspace', description: 'AI project workspace' });
  return { manager, workspace };
};

test('create workspace', () => {
  const { workspace } = makeManager();
  assert.equal(workspace.id, 'workspace-1');
  assert.equal(workspace.status, 'CREATED');
  assert.deepEqual(workspace.assets, []);
  assert.ok(Object.isFrozen(workspace));
});

test('open workspace', () => {
  const { manager } = makeManager();
  const context = manager.open('workspace-1', scope);
  assert.equal(context.user.id, 'user-1');
  assert.equal(context.tenant.id, 'tenant-1');
  assert.equal(context.project.id, 'project-1');
});

test('tenant isolation', () => {
  const { manager } = makeManager();
  assert.throws(() => manager.open('workspace-1', { ...scope, tenantId: 'tenant-2' }), /access denied/i);
});

test('project isolation', () => {
  const { manager } = makeManager();
  assert.throws(() => manager.open('workspace-1', { ...scope, projectId: 'project-2' }), /access denied/i);
});

test('attach session', () => {
  const { manager } = makeManager();
  const workspace = manager.attachSession('workspace-1', 'session-1', scope);
  assert.equal(workspace.sessionId, 'session-1');
  assert.equal(manager.inspect('workspace-1', scope).session.id, 'session-1');
});

test('asset indexing', () => {
  const { manager } = makeManager();
  manager.addAsset('workspace-1', { id: 'asset-1', type: 'image', workflowId: 'workflow-1', executionId: 'execution-1' }, scope);
  manager.addAsset('workspace-1', { id: 'asset-2', type: 'mask', workflowId: 'workflow-1', executionId: 'execution-2' }, scope);
  assert.equal(manager.assets.findByWorkflow('workspace-1', 'workflow-1', scope).length, 2);
  assert.equal(manager.assets.findByExecution('workspace-1', 'execution-1', scope)[0].id, 'asset-1');
  assert.equal(manager.assets.findByType('workspace-1', 'mask', scope)[0].id, 'asset-2');
  assert.equal(manager.assets.latest('workspace-1', scope)?.id, 'asset-2');
  assert.equal(manager.assets.history('workspace-1', 'asset-1', scope)[0].number, 1);
  assert.throws(() => manager.assets.findByType('workspace-1', 'image', { ...scope, userId: 'user-2' }), /access denied/i);
});

test('workflow timeline', () => {
  const { manager } = makeManager();
  manager.addWorkflow('workspace-1', { id: 'workflow-1', status: 'RUNNING' }, scope);
  manager.addExecution('workspace-1', { id: 'execution-1', workflowId: 'workflow-1', status: 'COMPLETED' }, scope);
  const types = manager.history('workspace-1', scope).map((event) => event.type);
  assert.ok(types.includes('workflow.executed'));
  assert.ok(types.includes('execution.completed'));
});

test('recovery after restart', () => {
  const { manager } = makeManager();
  manager.attachSession('workspace-1', 'session-1', scope);
  manager.addExperience('workspace-1', { id: 'experience-1', status: 'ACTIVE' }, scope);
  manager.addWorkflow('workspace-1', { id: 'workflow-1', status: 'RUNNING' }, scope);
  manager.addExecution('workspace-1', { id: 'execution-1', workflowId: 'workflow-1', status: 'RUNNING' }, scope);
  manager.addAsset('workspace-1', { id: 'asset-1', type: 'image', workflowId: 'workflow-1', executionId: 'execution-1' }, scope);
  const snapshot = manager.snapshot('workspace-1', scope);
  manager.close('workspace-1', scope);
  assert.equal(manager.restoreSnapshot('workspace-1', scope).sessionId, 'session-1');
  const recovered = manager.recover('workspace-1', scope);
  assert.equal(snapshot.activeSession, 'session-1');
  assert.equal(snapshot.activeExperience?.id, 'experience-1');
  assert.equal(snapshot.unfinishedExecution?.id, 'execution-1');
  assert.deepEqual(snapshot.assetReferences, ['asset-1']);
  assert.equal(snapshot.lastWorkflow?.id, 'workflow-1');
  assert.equal(recovered.status, 'CREATED');
});

test('immutable snapshots', () => {
  const { manager } = makeManager();
  const snapshot = manager.snapshot('workspace-1', scope);
  assert.ok(Object.isFrozen(snapshot));
  assert.ok(Object.isFrozen(snapshot.workspace));
  assert.throws(() => { (snapshot as unknown as { activeSession: string }).activeSession = 'mutated'; }, /read only|Cannot assign/i);
});

test('debug tree', () => {
  const { manager } = makeManager();
  manager.attachSession('workspace-1', 'session-1', scope);
  manager.addAsset('workspace-1', { id: 'asset-1', type: 'image', workflowId: 'workflow-1', executionId: 'execution-1' }, scope);
  const tree = manager.debug('workspace-1', scope);
  assert.equal(tree.workspace.id, 'workspace-1');
  assert.equal(tree.project.id, 'project-1');
  assert.equal(tree.session.id, 'session-1');
  assert.equal(tree.assets[0].versions[0].assetId, 'asset-1');
  assert.ok(tree.timeline.some((event) => event.type === 'asset.added'));
  assert.throws(() => manager.debug('workspace-1', { ...scope, tenantId: 'tenant-2' }), /access denied/i);
});

test('archive/restore', () => {
  const { manager } = makeManager();
  assert.equal(manager.archive('workspace-1', scope).status, 'ARCHIVED');
  assert.throws(() => manager.restore('workspace-1', { ...scope, userId: 'user-2' }), /access denied/i);
  assert.equal(manager.restore('workspace-1', scope).status, 'ACTIVE');
});

test('forbidden imports', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const workspacePath = `${process.cwd()}/src/application/workspace`;
  const files = (await readdir(workspacePath)).filter((file) => file.endsWith('.ts'));
  for (const file of files) {
    const source = await readFile(`${workspacePath}/${file}`, 'utf8');
    assert.doesNotMatch(source, /from ['"]\.\.\/\.\.\/(platform|lib|commands|gateway)|from ['"]\.\.\/(commands|gateway)/);
  }
});
