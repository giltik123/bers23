import type { OrganizationPermission, OrganizationRole } from './OrganizationModel';
import { organizationPermissionsByRole } from './OrganizationModel';

export class OrganizationPermissionManager {
  has(role: OrganizationRole, permission: OrganizationPermission): boolean { return organizationPermissionsByRole[role][permission]; }
  canAccessProject(role: OrganizationRole): boolean { return this.has(role, 'project.access'); }
  canManageTeam(role: OrganizationRole): boolean { return this.has(role, 'team.manage'); }
  canInviteUsers(role: OrganizationRole): boolean { return this.has(role, 'users.invite'); }
  canModifyOrganization(role: OrganizationRole): boolean { return this.has(role, 'organization.modify'); }
  canViewAnalytics(role: OrganizationRole): boolean { return this.has(role, 'analytics.view'); }
}
