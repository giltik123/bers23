export type OrganizationEventType =
  | 'organization.created'
  | 'member.invited'
  | 'member.removed'
  | 'role.changed'
  | 'team.created'
  | 'project.assigned'
  | 'policy.changed';

export interface OrganizationHistoryEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly type: OrganizationEventType;
  readonly actorId: string;
  readonly at: number;
  readonly snapshot: unknown;
}

export function immutableSnapshot<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => immutableSnapshot(item))) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableSnapshot(item)]))) as T;
}

export class OrganizationHistory {
  private events: OrganizationHistoryEvent[] = [];
  private sequence = 0;

  constructor(private readonly clock: () => number = Date.now) {}

  record(input: Omit<OrganizationHistoryEvent, 'id' | 'at'>): OrganizationHistoryEvent {
    const event = Object.freeze({ ...input, id: `organization-event-${++this.sequence}`, at: this.clock(), snapshot: immutableSnapshot(input.snapshot) });
    this.events.push(event);
    return event;
  }

  list(tenantId: string, organizationId: string): readonly OrganizationHistoryEvent[] {
    return Object.freeze(this.events.filter((event) => event.tenantId === tenantId && event.organizationId === organizationId));
  }

  clear(): void { this.events = []; this.sequence = 0; }
}
