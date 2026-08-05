export type GovernanceEventType =
  | 'policy.created'
  | 'policy.updated'
  | 'policy.removed'
  | 'execution.allowed'
  | 'execution.blocked'
  | 'violation.created';

export interface GovernanceHistoryEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly type: GovernanceEventType;
  readonly actorId: string;
  readonly at: number;
  readonly snapshot: unknown;
}

export function immutableGovernanceSnapshot<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => immutableGovernanceSnapshot(item))) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableGovernanceSnapshot(item)]))) as T;
}

export class GovernanceHistory {
  private events: GovernanceHistoryEvent[] = [];
  private sequence = 0;

  constructor(private readonly clock: () => number = Date.now) {}

  record(input: Omit<GovernanceHistoryEvent, 'id' | 'at'>): GovernanceHistoryEvent {
    const event = Object.freeze({ ...input, id: `governance-event-${++this.sequence}`, at: this.clock(), snapshot: immutableGovernanceSnapshot(input.snapshot) });
    this.events.push(event);
    return event;
  }

  list(tenantId: string, organizationId: string): readonly GovernanceHistoryEvent[] {
    return Object.freeze(this.events.filter((event) => event.tenantId === tenantId && event.organizationId === organizationId));
  }

  clear(): void { this.events = []; this.sequence = 0; }
}
