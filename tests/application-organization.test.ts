import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OrganizationManager, OrganizationPermissionManager } from '../src/application/organization/index.ts';

const ownerContext = { tenantId: 'tenant-1', organizationId: 'org-1', actorId: 'owner-1' };

function setup() {
  const manager = new OrganizationManager(() => 1000);
  const organization = manager.create({ tenantId: 'tenant-1', organizationId: 'org-1', name: 'Studio', ownerId: 'owner-1', policies: { aiExecution: 'team' } });
  return { manager, organization };
}

test('organization creation', () => {
  const { manager, organization } = setup();
  const context = manager.inspect(ownerContext);
  assert.equal(organization.id, 'org-1');
  assert.equal(context.organization.name, 'Studio');
  assert.equal(context.members[0].role, 'OWNER');
  assert.deepEqual(context.policies, { aiExecution: 'team' });
});

test('team creation', () => {
  const { manager } = setup();
  manager.invite(ownerContext, 'manager-1', 'MANAGER');
  const team = manager.createTeam(ownerContext, { teamId: 'team-1', name: 'Design Team', memberIds: ['owner-1', 'manager-1'], metadata: { region: 'EU' } });
  assert.equal(team.organizationId, 'org-1');
  assert.equal(team.members.length, 2);
  assert.deepEqual(team.metadata, { region: 'EU' });
});

test('member invitation', () => {
  const { manager } = setup();
  const member = manager.invite(ownerContext, 'member-1', 'MEMBER');
  assert.equal(member.role, 'MEMBER');
  assert.equal(manager.inspect(ownerContext).members.length, 2);
  assert.throws(() => manager.invite(ownerContext, 'owner-2', 'OWNER'), /Owner cannot be invited/);
});

test('role permissions', () => {
  const permissions = new OrganizationPermissionManager();
  assert.equal(permissions.canAccessProject('OWNER'), true);
  assert.equal(permissions.canManageTeam('OWNER'), true);
  assert.equal(permissions.canInviteUsers('ADMIN'), true);
  assert.equal(permissions.canModifyOrganization('MANAGER'), false);
  assert.equal(permissions.canViewAnalytics('MANAGER'), true);
  assert.equal(permissions.canAccessProject('MEMBER'), true);
  assert.equal(permissions.canManageTeam('MEMBER'), false);
  assert.equal(permissions.canAccessProject('GUEST'), false);
});

test('project assignment', () => {
  const { manager } = setup();
  manager.createTeam(ownerContext, { teamId: 'team-1', name: 'Design Team' });
  const team = manager.assignProject(ownerContext, 'team-1', 'project-1');
  assert.deepEqual(team.projects, ['project-1']);
  assert.deepEqual(manager.inspect(ownerContext).projects, ['project-1']);
});

test('organization isolation', () => {
  const { manager } = setup();
  manager.create({ tenantId: 'tenant-1', organizationId: 'org-2', name: 'Agency', ownerId: 'owner-2' });
  assert.throws(() => manager.inspect({ tenantId: 'tenant-1', organizationId: 'org-2', actorId: 'owner-1' }), /Permission denied/);
});

test('tenant isolation', () => {
  const { manager } = setup();
  assert.throws(() => manager.inspect({ tenantId: 'tenant-2', organizationId: 'org-1', actorId: 'owner-1' }), /Permission denied/);
});

test('immutable history', () => {
  const { manager } = setup();
  manager.invite(ownerContext, 'member-1', 'MEMBER');
  const events = manager.history.list('tenant-1', 'org-1');
  assert.equal(Object.isFrozen(events), true);
  assert.equal(Object.isFrozen(events[0]), true);
  assert.equal(Object.isFrozen(events[0].snapshot), true);
  assert.deepEqual(events.map((event) => event.type), ['organization.created', 'member.invited']);
});

test('debug snapshot', () => {
  const { manager } = setup();
  manager.invite(ownerContext, 'manager-1', 'MANAGER');
  manager.createTeam(ownerContext, { teamId: 'team-1', name: 'Design Team', memberIds: ['manager-1'] });
  manager.assignProject(ownerContext, 'team-1', 'project-1');
  const snapshot = manager.debug(ownerContext);
  assert.equal(snapshot.organization.id, 'org-1');
  assert.deepEqual(snapshot.roles, ['OWNER', 'MANAGER']);
  assert.deepEqual(snapshot.projects, ['project-1']);
  assert.equal(snapshot.permissions['manager-1']['team.manage'], true);
  assert.deepEqual(snapshot.activity.map((event) => event.type), ['organization.created', 'member.invited', 'team.created', 'project.assigned']);
});

test('forbidden imports', () => {
  const files = ['OrganizationManager.ts', 'OrganizationPermissionManager.ts', 'OrganizationHistory.ts', 'OrganizationDebugger.ts', 'OrganizationModel.ts'];
  const forbidden = /from ['"](?:\.\.\/)+(?:platform|workspace|memory|providers|runtime|agent|workflow|collaboration|billing)/;
  for (const file of files) {
    const source = readFileSync(join(process.cwd(), 'src/application/organization', file), 'utf8');
    assert.equal(forbidden.test(source), false, file);
  }
});
