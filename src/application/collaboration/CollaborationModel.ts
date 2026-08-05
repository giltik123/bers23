export type CollaborationRole = 'OWNER' | 'ADMIN' | 'EDITOR' | 'REVIEWER' | 'VIEWER';

export type CollaborationPermission = 'view' | 'edit' | 'execute' | 'approve' | 'members';

export interface CollaborationMember {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly userId: string;
  readonly role: CollaborationRole;
  readonly invitedBy?: string;
  readonly joinedAt: number;
  readonly updatedAt: number;
}

export interface CollaborationProject {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly ownerId: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface CollaborationContext {
  readonly tenantId: string;
  readonly projectId: string;
  readonly userId: string;
}

export interface CollaborationAccessContext {
  readonly tenantId: string;
  readonly projectId: string;
  readonly actorId: string;
}

export const collaborationPermissionsByRole: Readonly<Record<CollaborationRole, Readonly<Record<CollaborationPermission, boolean>>>> = Object.freeze({
  OWNER: Object.freeze({ view: true, edit: true, execute: true, approve: true, members: true }),
  ADMIN: Object.freeze({ view: true, edit: true, execute: true, approve: true, members: true }),
  EDITOR: Object.freeze({ view: true, edit: true, execute: true, approve: false, members: false }),
  REVIEWER: Object.freeze({ view: true, edit: false, execute: false, approve: true, members: false }),
  VIEWER: Object.freeze({ view: true, edit: false, execute: false, approve: false, members: false }),
});

export function canView(role: CollaborationRole): boolean { return collaborationPermissionsByRole[role].view; }
export function canEdit(role: CollaborationRole): boolean { return collaborationPermissionsByRole[role].edit; }
export function canExecute(role: CollaborationRole): boolean { return collaborationPermissionsByRole[role].execute; }
export function canApprove(role: CollaborationRole): boolean { return collaborationPermissionsByRole[role].approve; }
export function canManageMembers(role: CollaborationRole): boolean { return collaborationPermissionsByRole[role].members; }

export function hasCollaborationPermission(role: CollaborationRole, permission: CollaborationPermission): boolean {
  return collaborationPermissionsByRole[role][permission];
}
