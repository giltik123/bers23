export type CollaborationEventType =
  | 'member.joined'
  | 'member.removed'
  | 'role.changed'
  | 'asset.shared'
  | 'workflow.shared'
  | 'decision.created'
  | 'decision.approved';

export interface CollaborationHistoryEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly type: CollaborationEventType;
  readonly actorId: string;
  readonly at: number;
  readonly snapshot: unknown;
}

function immutableClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => immutableClone(item))) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableClone(item)]))) as T;
}

export class CollaborationHistory {
  private events: CollaborationHistoryEvent[] = [];
  private sequence = 0;
  constructor(private readonly clock: () => number = Date.now) {}

  record(input: Omit<CollaborationHistoryEvent, 'id' | 'at'>): CollaborationHistoryEvent {
    const event = Object.freeze({ ...input, id: `collab-event-${++this.sequence}`, at: this.clock(), snapshot: immutableClone(input.snapshot) });
    this.events.push(event);
    return event;
  }

  list(tenantId: string, projectId: string): readonly CollaborationHistoryEvent[] {
    return Object.freeze(this.events.filter((event) => event.tenantId === tenantId && event.projectId === projectId));
  }

  clear(): void { this.events = []; this.sequence = 0; }
}
