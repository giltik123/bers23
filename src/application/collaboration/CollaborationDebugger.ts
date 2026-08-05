import type { CollaborationPermission, CollaborationProject } from './CollaborationModel';
import { collaborationPermissionsByRole } from './CollaborationModel';
import type { SharedContextSnapshot } from './SharedContextManager';
import type { CollaborationHistoryEvent } from './CollaborationHistory';

export interface CollaborationDebugSnapshot {
  readonly project: CollaborationProject;
  readonly members: readonly unknown[];
  readonly roles: readonly string[];
  readonly permissions: Readonly<Record<string, Readonly<Record<CollaborationPermission, boolean>>>>;
  readonly sharedContext: SharedContextSnapshot;
  readonly activity: readonly CollaborationHistoryEvent[];
}

export class CollaborationDebugger {
  debug(input: { project: CollaborationProject; members: readonly { readonly userId: string; readonly role: keyof typeof collaborationPermissionsByRole }[]; sharedContext: SharedContextSnapshot; activity: readonly CollaborationHistoryEvent[] }): CollaborationDebugSnapshot {
    return Object.freeze({
      project: input.project,
      members: Object.freeze([...input.members]),
      roles: Object.freeze(input.members.map((member) => member.role)),
      permissions: Object.freeze(Object.fromEntries(input.members.map((member) => [member.userId, collaborationPermissionsByRole[member.role]]))),
      sharedContext: input.sharedContext,
      activity: Object.freeze([...input.activity]),
    });
  }
}
