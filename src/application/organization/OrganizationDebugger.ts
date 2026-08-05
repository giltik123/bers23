import type { OrganizationContext, OrganizationPermission, OrganizationRole } from './OrganizationModel';
import type { OrganizationHistoryEvent } from './OrganizationHistory';

export interface OrganizationDebugSnapshot {
  readonly organization: OrganizationContext['organization'];
  readonly teams: OrganizationContext['teams'];
  readonly members: OrganizationContext['members'];
  readonly roles: readonly OrganizationRole[];
  readonly projects: readonly string[];
  readonly permissions: Readonly<Record<string, Readonly<Record<OrganizationPermission, boolean>>>>;
  readonly activity: readonly OrganizationHistoryEvent[];
}

export class OrganizationDebugger {
  debug(context: OrganizationContext, activity: readonly OrganizationHistoryEvent[]): OrganizationDebugSnapshot {
    return Object.freeze({
      organization: context.organization,
      teams: context.teams,
      members: context.members,
      roles: Object.freeze(context.members.map((member) => member.role)),
      projects: context.projects,
      permissions: context.permissions,
      activity: Object.freeze([...activity]),
    });
  }
}
