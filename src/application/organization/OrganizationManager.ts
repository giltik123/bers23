import { OrganizationDebugger } from './OrganizationDebugger';
import { OrganizationHistory, immutableSnapshot } from './OrganizationHistory';
import { OrganizationPermissionManager } from './OrganizationPermissionManager';
import type { Organization, OrganizationAccessContext, OrganizationContext, OrganizationMember, OrganizationPermission, OrganizationRole, Team, TeamMember } from './OrganizationModel';
import { organizationPermissionsByRole } from './OrganizationModel';

export class OrganizationManager {
  private organizations = new Map<string, Organization>();
  private members = new Map<string, OrganizationMember[]>();
  private teams = new Map<string, Team[]>();
  readonly history: OrganizationHistory;
  readonly permissions = new OrganizationPermissionManager();
  private readonly debuggerApi = new OrganizationDebugger();
  private sequence = 0;

  constructor(private readonly clock: () => number = Date.now) {
    this.history = new OrganizationHistory(clock);
  }

  create(input: { tenantId: string; organizationId?: string; name: string; ownerId: string; metadata?: Record<string, unknown>; policies?: Record<string, unknown> }): Organization {
    const now = this.clock();
    const organization = Object.freeze({
      id: input.organizationId || `organization-${++this.sequence}`,
      tenantId: input.tenantId,
      name: input.name,
      archived: false,
      metadata: immutableSnapshot(input.metadata || {}),
      policies: immutableSnapshot(input.policies || {}),
      createdAt: now,
      updatedAt: now,
    });
    if (this.organizations.has(this.key(organization.tenantId, organization.id))) throw new Error('Organization already exists');
    this.organizations.set(this.key(organization.tenantId, organization.id), organization);
    const owner = this.createMember(organization.tenantId, organization.id, input.ownerId, 'OWNER', input.ownerId);
    this.members.set(this.key(organization.tenantId, organization.id), [owner]);
    this.teams.set(this.key(organization.tenantId, organization.id), []);
    this.history.record({ tenantId: organization.tenantId, organizationId: organization.id, type: 'organization.created', actorId: input.ownerId, snapshot: { organization, owner } });
    return organization;
  }

  get(context: OrganizationAccessContext): Organization {
    this.requirePermission(context, 'project.access');
    return this.getOrganization(context.tenantId, context.organizationId);
  }

  update(context: OrganizationAccessContext, patch: { name?: string; metadata?: Record<string, unknown>; policies?: Record<string, unknown> }): Organization {
    this.requirePermission(context, 'organization.modify');
    const existing = this.getOrganization(context.tenantId, context.organizationId);
    const updated = Object.freeze({
      ...existing,
      name: patch.name ?? existing.name,
      metadata: patch.metadata ? immutableSnapshot({ ...existing.metadata, ...patch.metadata }) : existing.metadata,
      policies: patch.policies ? immutableSnapshot({ ...existing.policies, ...patch.policies }) : existing.policies,
      updatedAt: this.clock(),
    });
    this.organizations.set(this.key(context.tenantId, context.organizationId), updated);
    if (patch.policies) this.history.record({ tenantId: context.tenantId, organizationId: context.organizationId, type: 'policy.changed', actorId: context.actorId, snapshot: updated.policies });
    return updated;
  }

  archive(context: OrganizationAccessContext): Organization {
    this.requirePermission(context, 'organization.modify');
    const existing = this.getOrganization(context.tenantId, context.organizationId);
    const archived = Object.freeze({ ...existing, archived: true, updatedAt: this.clock() });
    this.organizations.set(this.key(context.tenantId, context.organizationId), archived);
    return archived;
  }

  invite(context: OrganizationAccessContext, userId: string, role: OrganizationRole): OrganizationMember {
    this.requirePermission(context, 'users.invite');
    if (role === 'OWNER') throw new Error('Owner cannot be invited');
    const list = this.getMembers(context.tenantId, context.organizationId);
    if (list.some((member) => member.userId === userId)) throw new Error('Member already exists');
    const member = this.createMember(context.tenantId, context.organizationId, userId, role, context.actorId);
    list.push(member);
    this.history.record({ tenantId: context.tenantId, organizationId: context.organizationId, type: 'member.invited', actorId: context.actorId, snapshot: member });
    return member;
  }

  removeMember(context: OrganizationAccessContext, userId: string): void {
    this.requirePermission(context, 'users.invite');
    const list = this.getMembers(context.tenantId, context.organizationId);
    const member = list.find((candidate) => candidate.userId === userId);
    if (!member) throw new Error('Member not found');
    if (member.role === 'OWNER') throw new Error('Owner cannot be removed');
    this.members.set(this.key(context.tenantId, context.organizationId), list.filter((candidate) => candidate.userId !== userId));
    this.teams.set(this.key(context.tenantId, context.organizationId), this.getTeams(context.tenantId, context.organizationId).map((team) => Object.freeze({ ...team, members: Object.freeze(team.members.filter((teamMember) => teamMember.userId !== userId)), updatedAt: this.clock() })));
    this.history.record({ tenantId: context.tenantId, organizationId: context.organizationId, type: 'member.removed', actorId: context.actorId, snapshot: member });
  }

  updateRole(context: OrganizationAccessContext, userId: string, role: OrganizationRole): OrganizationMember {
    this.requirePermission(context, 'organization.modify');
    if (role === 'OWNER') throw new Error('Owner role cannot be assigned');
    const list = this.getMembers(context.tenantId, context.organizationId);
    const index = list.findIndex((member) => member.userId === userId);
    if (index === -1) throw new Error('Member not found');
    if (list[index].role === 'OWNER') throw new Error('Owner role cannot be changed');
    const updated = Object.freeze({ ...list[index], role, updatedAt: this.clock() });
    list[index] = updated;
    this.history.record({ tenantId: context.tenantId, organizationId: context.organizationId, type: 'role.changed', actorId: context.actorId, snapshot: updated });
    return updated;
  }

  createTeam(context: OrganizationAccessContext, input: { teamId?: string; name: string; memberIds?: string[]; metadata?: Record<string, unknown> }): Team {
    this.requirePermission(context, 'team.manage');
    const organizationMembers = this.getMembers(context.tenantId, context.organizationId);
    const now = this.clock();
    const teamMembers = Object.freeze((input.memberIds || []).map((userId): TeamMember => {
      const member = organizationMembers.find((candidate) => candidate.userId === userId);
      if (!member) throw new Error('Team member must belong to organization');
      return Object.freeze({ userId, role: member.role, assignedAt: now });
    }));
    const team = Object.freeze({
      id: input.teamId || `team-${++this.sequence}`,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      name: input.name,
      members: teamMembers,
      projects: Object.freeze([]),
      metadata: immutableSnapshot(input.metadata || {}),
      createdAt: now,
      updatedAt: now,
    });
    const list = this.getTeams(context.tenantId, context.organizationId);
    if (list.some((existing) => existing.id === team.id)) throw new Error('Team already exists');
    list.push(team);
    this.history.record({ tenantId: context.tenantId, organizationId: context.organizationId, type: 'team.created', actorId: context.actorId, snapshot: team });
    return team;
  }

  assignProject(context: OrganizationAccessContext, teamId: string, projectId: string): Team {
    this.requirePermission(context, 'team.manage');
    const list = this.getTeams(context.tenantId, context.organizationId);
    const index = list.findIndex((team) => team.id === teamId);
    if (index === -1) throw new Error('Team not found');
    const projects = list[index].projects.includes(projectId) ? list[index].projects : Object.freeze([...list[index].projects, projectId]);
    const updated = Object.freeze({ ...list[index], projects, updatedAt: this.clock() });
    list[index] = updated;
    this.history.record({ tenantId: context.tenantId, organizationId: context.organizationId, type: 'project.assigned', actorId: context.actorId, snapshot: { teamId, projectId } });
    return updated;
  }

  inspect(context: OrganizationAccessContext): OrganizationContext {
    this.requirePermission(context, 'project.access');
    const organization = this.getOrganization(context.tenantId, context.organizationId);
    const members = Object.freeze([...this.getMembers(context.tenantId, context.organizationId)]);
    const teams = Object.freeze([...this.getTeams(context.tenantId, context.organizationId)]);
    return Object.freeze({
      organization,
      teams,
      members,
      permissions: Object.freeze(Object.fromEntries(members.map((member) => [member.userId, organizationPermissionsByRole[member.role]]))),
      projects: Object.freeze([...new Set(teams.flatMap((team) => team.projects))]),
      policies: organization.policies,
    });
  }

  debug(context: OrganizationAccessContext) {
    return this.debuggerApi.debug(this.inspect(context), this.history.list(context.tenantId, context.organizationId));
  }

  private requirePermission(context: OrganizationAccessContext, permission: OrganizationPermission): void {
    if (!this.checkPermission(context, permission)) throw new Error(`Permission denied: ${permission}`);
  }

  private checkPermission(context: OrganizationAccessContext, permission: OrganizationPermission): boolean {
    const organization = this.organizations.get(this.key(context.tenantId, context.organizationId));
    if (!organization || organization.archived) return false;
    const member = this.getMembers(context.tenantId, context.organizationId).find((candidate) => candidate.userId === context.actorId);
    return member ? this.permissions.has(member.role, permission) : false;
  }

  private getOrganization(tenantId: string, organizationId: string): Organization {
    const organization = this.organizations.get(this.key(tenantId, organizationId));
    if (!organization) throw new Error('Organization not found');
    return organization;
  }

  private getMembers(tenantId: string, organizationId: string): OrganizationMember[] {
    this.getOrganization(tenantId, organizationId);
    return this.members.get(this.key(tenantId, organizationId)) || [];
  }

  private getTeams(tenantId: string, organizationId: string): Team[] {
    this.getOrganization(tenantId, organizationId);
    return this.teams.get(this.key(tenantId, organizationId)) || [];
  }

  private createMember(tenantId: string, organizationId: string, userId: string, role: OrganizationRole, invitedBy?: string): OrganizationMember {
    const now = this.clock();
    return Object.freeze({ id: `organization-member-${++this.sequence}`, tenantId, organizationId, userId, role, invitedBy, joinedAt: now, updatedAt: now });
  }

  private key(tenantId: string, organizationId: string): string { return `${tenantId}:${organizationId}`; }
}
