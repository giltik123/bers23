import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductSessionManager, session } from '../src/application/session/index.ts';

const baseSession = {
  id: 'session-1',
  userId: 'user-1',
  tenantId: 'tenant-1',
  projectId: 'project-1',
  currentExperienceId: 'experience-1',
};

const createManagerWithSession = () => {
  const manager = new ProductSessionManager();
  const projectSession = manager.create(baseSession);
  manager.setExperience(projectSession.id, {
    experienceId: 'experience-1',
    state: 'WAITING_USER',
    pendingDecisions: [{ id: 'decision-1', type: 'CONFIRMATION', message: 'Продолжить?' }],
    executionReference: { executionId: 'exec-1', status: 'running' },
  });
  return { manager, projectSession: manager.inspect(projectSession.id) };
};

test('create session', () => {
  const manager = new ProductSessionManager();
  const created = manager.create(baseSession);

  assert.equal(created.id, 'session-1');
  assert.equal(created.userId, 'user-1');
  assert.equal(created.tenantId, 'tenant-1');
  assert.equal(created.projectId, 'project-1');
  assert.equal(created.currentExperienceId, 'experience-1');
  assert.equal(created.status, 'ACTIVE');
  assert.ok(created.createdAt);
  assert.ok(created.updatedAt);
});

test('restore session', () => {
  const { manager } = createManagerWithSession();
  const restored = manager.restore({ tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1' });

  assert.equal(restored?.id, 'session-1');
  assert.equal(restored?.currentExperienceId, 'experience-1');
});

test('action history', () => {
  const { manager, projectSession } = createManagerWithSession();
  manager.recordAction({
    id: 'action-1',
    sessionId: projectSession.id,
    command: 'Upload image',
    workflow: 'upload-image',
    executionId: 'exec-upload',
    input: { file: 'original.png' },
    output: { assetId: 'image-v1' },
  });
  manager.recordAction({
    id: 'action-2',
    sessionId: projectSession.id,
    command: 'Remove background',
    workflow: 'background-replacement',
    executionId: 'exec-bg',
    input: { assetId: 'image-v1' },
    output: { assetId: 'image-v2' },
  });

  assert.deepEqual(manager.history(projectSession.id).map((action) => action.command), ['Upload image', 'Remove background']);
});

test('immutable history', () => {
  const { manager, projectSession } = createManagerWithSession();
  manager.recordAction({ id: 'action-1', sessionId: projectSession.id, command: 'Upload image', workflow: 'upload-image', executionId: 'exec-upload', input: {}, output: {} });
  const history = manager.history(projectSession.id);

  assert.throws(() => { history.push({ id: 'bad', sessionId: projectSession.id, command: 'Mutate', workflow: 'bad', executionId: 'bad', input: {}, output: {}, timestamp: 'now' }); }, TypeError);
  assert.equal(manager.history(projectSession.id).length, 1);
});

test('asset version chain', () => {
  const { manager } = createManagerWithSession();
  manager.addVersion({ assetId: 'image-v1', parentAssetId: null, operation: 'Upload image', createdAt: '2026-08-05T00:00:00.000Z' });
  manager.addVersion({ assetId: 'image-v2', parentAssetId: 'image-v1', operation: 'Remove background', createdAt: '2026-08-05T00:01:00.000Z' });
  manager.addVersion({ assetId: 'image-v3', parentAssetId: 'image-v2', operation: 'Change clothes', createdAt: '2026-08-05T00:02:00.000Z' });

  assert.deepEqual(manager.versionChain('image-v3').map((version) => version.assetId), ['image-v1', 'image-v2', 'image-v3']);
  assert.deepEqual(manager.versionChain('image-v3').map((version) => version.operation), ['Upload image', 'Remove background', 'Change clothes']);
});

test('undo/redo', () => {
  const { manager, projectSession } = createManagerWithSession();
  manager.recordAction({ id: 'action-1', sessionId: projectSession.id, command: 'Upload image', workflow: 'upload-image', executionId: 'exec-upload', input: {}, output: { assetId: 'image-v1' } });
  manager.recordAction({ id: 'action-2', sessionId: projectSession.id, command: 'background replaced', workflow: 'background-replacement', executionId: 'exec-bg', input: { assetId: 'image-v1' }, output: { assetId: 'image-v2' } });

  const undone = manager.undo(projectSession.id);
  assert.equal(undone?.command, 'background replaced');
  assert.deepEqual(manager.history(projectSession.id).map((action) => action.command), ['Upload image', 'background replaced']);

  const redone = manager.redo(projectSession.id);
  assert.equal(redone?.command, 'background replaced');
});

test('multiple projects isolation', () => {
  const manager = new ProductSessionManager();
  const first = manager.create({ ...baseSession, id: 'session-project-1', projectId: 'project-1' });
  const second = manager.create({ ...baseSession, id: 'session-project-2', projectId: 'project-2' });
  manager.recordAction({ id: 'action-1', sessionId: first.id, command: 'Project 1 action', workflow: 'workflow-1', executionId: 'exec-1', input: {}, output: {} });
  manager.recordAction({ id: 'action-2', sessionId: second.id, command: 'Project 2 action', workflow: 'workflow-2', executionId: 'exec-2', input: {}, output: {} });

  assert.deepEqual(manager.history(first.id).map((action) => action.command), ['Project 1 action']);
  assert.deepEqual(manager.history(second.id).map((action) => action.command), ['Project 2 action']);
});

test('tenant isolation', () => {
  const manager = new ProductSessionManager();
  manager.create({ ...baseSession, id: 'tenant-1-session', tenantId: 'tenant-1' });
  manager.create({ ...baseSession, id: 'tenant-2-session', tenantId: 'tenant-2' });

  assert.equal(manager.restore({ tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1' })?.id, 'tenant-1-session');
  assert.equal(manager.restore({ tenantId: 'tenant-2', userId: 'user-1', projectId: 'project-1' })?.id, 'tenant-2-session');
});

test('debug snapshot', () => {
  const { manager, projectSession } = createManagerWithSession();
  manager.recordAction({ id: 'action-1', sessionId: projectSession.id, command: 'Change clothes', workflow: 'virtual-try-on', executionId: 'exec-1', input: { assetId: 'image-v1' }, output: { assetId: 'image-v2' } });
  manager.addVersion({ assetId: 'image-v1', parentAssetId: null, operation: 'Upload image', createdAt: '2026-08-05T00:00:00.000Z' });
  manager.addVersion({ assetId: 'image-v2', parentAssetId: 'image-v1', operation: 'Change clothes', createdAt: '2026-08-05T00:01:00.000Z' });
  const debug = manager.debug(projectSession.id);

  assert.equal(debug.project.id, projectSession.id);
  assert.deepEqual(debug.commands, ['Change clothes']);
  assert.equal(debug.experiences[0].experienceId, 'experience-1');
  assert.deepEqual(debug.workflows, ['virtual-try-on']);
  assert.deepEqual(debug.executions, ['exec-1']);
  assert.deepEqual([...debug.assets].sort(), ['image-v1', 'image-v2']);
  assert.deepEqual(debug.versions.map((version) => version.assetId), ['image-v1', 'image-v2']);
});

test('recovery restores active session, last experience state, pending decisions, and execution reference', () => {
  const { manager, projectSession } = createManagerWithSession();
  manager.recordAction({ id: 'action-1', sessionId: projectSession.id, command: 'Adjust lighting', workflow: 'lighting-adjustment', executionId: 'exec-light', input: {}, output: { assetId: 'image-v4' } });
  const persisted = manager.persist();
  const restarted = new ProductSessionManager(persisted);
  const restored = restarted.restore({ tenantId: 'tenant-1', userId: 'user-1', projectId: 'project-1' });
  const debug = restarted.debug(restored?.id ?? 'missing');

  assert.equal(restored?.id, projectSession.id);
  assert.equal(debug.experiences[0].state, 'WAITING_USER');
  assert.deepEqual(debug.experiences[0].pendingDecisions, [{ id: 'decision-1', type: 'CONFIRMATION', message: 'Продолжить?' }]);
  assert.deepEqual(debug.experiences[0].executionReference, { executionId: 'exec-1', status: 'running' });
  assert.deepEqual(restarted.history(projectSession.id).map((action) => action.command), ['Adjust lighting']);
});

test('session.debug(id) singleton contract', () => {
  const created = session.create({ id: 'singleton-session', userId: 'singleton-user', tenantId: 'singleton-tenant', projectId: 'singleton-project' });
  const debug = session.debug(created.id);

  assert.equal(debug.project.id, 'singleton-session');
  assert.deepEqual(debug.commands, []);
});
