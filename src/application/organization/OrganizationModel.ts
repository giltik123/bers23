export type OrganizationRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'MEMBER' | 'GUEST';

export type OrganizationPermission = 'project.access' | 'team.manage' | 'users.invite' | 'organization.modify' | 'analytics.view';

export interface Organization {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly archived: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly policies: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface OrganizationMember {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly userId: string;
  readonly role: OrganizationRole;
  readonly invitedBy?: string;
  readonly joinedAt: number;
  readonly updatedAt: number;
}

export interface TeamMember {
  readonly userId: string;
  readonly role: OrganizationRole;
  readonly assignedAt: number;
}

export interface Team {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly name: string;
  readonly members: readonly TeamMember[];
  readonly projects: readonly string[];
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface OrganizationAccessContext {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly actorId: string;
}

export interface OrganizationContext {
  readonly organization: Organization;
  readonly teams: readonly Team[];
  readonly members: readonly OrganizationMember[];
  readonly permissions: Readonly<Record<string, Readonly<Record<OrganizationPermission, boolean>>>>;
  readonly projects: readonly string[];
  readonly policies: Readonly<Record<string, unknown>>;
}

export const organizationPermissionsByRole: Readonly<Record<OrganizationRole, Readonly<Record<OrganizationPermission, boolean>>>> = Object.freeze({
  OWNER: Object.freeze({ 'project.access': true, 'team.manage': true, 'users.invite': true, 'organization.modify': true, 'analytics.view': true }),
  ADMIN: Object.freeze({ 'project.access': true, 'team.manage': true, 'users.invite': true, 'organization.modify': true, 'analytics.view': true }),
  MANAGER: Object.freeze({ 'project.access': true, 'team.manage': true, 'users.invite': true, 'organization.modify': false, 'analytics.view': true }),
  MEMBER: Object.freeze({ 'project.access': true, 'team.manage': false, 'users.invite': false, 'organization.modify': false, 'analytics.view': false }),
  GUEST: Object.freeze({ 'project.access': false, 'team.manage': false, 'users.invite': false, 'organization.modify': false, 'analytics.view': false }),
});
