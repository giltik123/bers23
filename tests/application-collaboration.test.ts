import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CollaborationManager, canApprove, canEdit, canExecute, canManageMembers, canView } from '../src/application/collaboration/index.ts';

const ownerContext = { tenantId: 'tenant-1', projectId: 'project-1', actorId: 'owner-1' };

function setup() {
  const manager = new CollaborationManager(() => 1000);
  const project = manager.createProject({ tenantId: 'tenant-1', projectId: 'project-1', name: 'AI Campaign', ownerId: 'owner-1' });
  return { manager, project };
}

test('project collaboration creation', () => {
  const { manager, project } = setup();
  assert.equal(project.id, 'project-1');
  assert.equal(manager.listMembers(ownerContext).at(0)?.role, 'OWNER');
});

test('invite member', () => {
  const { manager } = setup();
  const member = manager.invite(ownerContext, 'editor-1', 'EDITOR');
  assert.equal(member.role, 'EDITOR');
  assert.equal(manager.listMembers(ownerContext).length, 2);
});

test('remove member', () => {
  const { manager } = setup();
  manager.invite(ownerContext, 'viewer-1', 'VIEWER');
  manager.removeMember(ownerContext, 'viewer-1');
  assert.equal(manager.listMembers(ownerContext).some((member) => member.userId === 'viewer-1'), false);
});

test('role changes', () => {
  const { manager } = setup();
  manager.invite(ownerContext, 'reviewer-1', 'REVIEWER');
  const updated = manager.updateRole(ownerContext, 'reviewer-1', 'ADMIN');
  assert.equal(updated.role, 'ADMIN');
});

test('permission checks', () => {
  assert.equal(canView('OWNER'), true);
  assert.equal(canEdit('OWNER'), true);
  assert.equal(canExecute('OWNER'), true);
  assert.equal(canApprove('OWNER'), true);
  assert.equal(canManageMembers('OWNER'), true);
  assert.equal(canView('REVIEWER'), true);
  assert.equal(canEdit('REVIEWER'), false);
  assert.equal(canExecute('REVIEWER'), false);
  assert.equal(canApprove('REVIEWER'), true);
  assert.equal(canManageMembers('REVIEWER'), false);
});

test('shared context', () => {
  const { manager } = setup();
  manager.shareWorkflow(ownerContext, { workflowId: 'workflow-1' });
  manager.shareAsset(ownerContext, { assetId: 'asset-1' });
  const decision = manager.createDecision(ownerContext, { title: 'Use SAM3' });
  manager.approveDecision(ownerContext, decision.id);
  const snapshot = manager.sharedContext.inspect('tenant-1', 'project-1');
  assert.equal(snapshot.workflowHistory.length, 1);
  assert.equal(snapshot.assets.length, 1);
  assert.equal(snapshot.decisions[0].value.approved, true);
});

test('activity history', () => {
  const { manager } = setup();
  manager.invite(ownerContext, 'reviewer-1', 'REVIEWER');
  manager.updateRole(ownerContext, 'reviewer-1', 'VIEWER');
  assert.deepEqual(manager.history.list('tenant-1', 'project-1').map((event) => event.type), ['member.joined', 'member.joined', 'role.changed']);
});

test('tenant isolation', () => {
  const { manager } = setup();
  assert.equal(manager.checkPermission({ tenantId: 'tenant-2', projectId: 'project-1', actorId: 'owner-1' }, 'view'), false);
  assert.throws(() => manager.listMembers({ tenantId: 'tenant-2', projectId: 'project-1', actorId: 'owner-1' }), /Permission denied/);
});

test('member access and role permissions guard shared context', () => {
  const { manager } = setup();
  manager.invite(ownerContext, 'reviewer-1', 'REVIEWER');
  const reviewerContext = { tenantId: 'tenant-1', projectId: 'project-1', actorId: 'reviewer-1' };
  const decision = manager.createDecision(ownerContext, { title: 'Approve copy' });
  assert.throws(() => manager.shareAsset(reviewerContext, { assetId: 'blocked' }), /Permission denied: edit/);
  assert.throws(() => manager.shareWorkflow(reviewerContext, { workflowId: 'blocked' }), /Permission denied: execute/);
  assert.equal(manager.approveDecision(reviewerContext, decision.id).value.approved, true);
});

test('project isolation', () => {
  const { manager } = setup();
  manager.createProject({ tenantId: 'tenant-1', projectId: 'project-2', name: 'Other', ownerId: 'owner-2' });
  assert.equal(manager.checkPermission({ tenantId: 'tenant-1', projectId: 'project-2', actorId: 'owner-1' }, 'view'), false);
});

test('immutable snapshots', () => {
  const { manager } = setup();
  const asset = manager.shareAsset(ownerContext, { assetId: 'asset-1', tags: ['hero'] });
  assert.equal(Object.isFrozen(asset), true);
  assert.equal(Object.isFrozen(asset.value), true);
  assert.equal(Object.isFrozen(manager.history.list('tenant-1', 'project-1')[1].snapshot), true);
});

test('debug snapshot', () => {
  const { manager } = setup();
  manager.invite(ownerContext, 'reviewer-1', 'REVIEWER');
  const snapshot = manager.debug(ownerContext);
  assert.equal(snapshot.project.id, 'project-1');
  assert.equal(snapshot.members.length, 2);
  assert.equal(snapshot.permissions['reviewer-1'].approve, true);
  assert.ok(Array.isArray(snapshot.sharedContext.activity));
});

test('forbidden imports', () => {
  const files = ['CollaborationManager.ts', 'SharedContextManager.ts', 'CollaborationHistory.ts', 'CollaborationDebugger.ts', 'CollaborationModel.ts'];
  const forbidden = /from ['"](?:\.\.\/)+(?:platform|workspace|memory|providers|runtime|agent|workflow)/;
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), 'src/application/collaboration', file), 'utf8');
    assert.equal(forbidden.test(source), false, file);
  }
});
