import { immutable } from './immutable';
import type { KernelDependencies, KernelScope, TimelineEvent } from './types';
const sameScope = (left: KernelScope, right: KernelScope) => left.tenantId === right.tenantId && left.projectId === right.projectId && left.userId === right.userId;
export class EventTimeline {
  private readonly events: TimelineEvent[] = [];
  constructor(private readonly dependencies: KernelDependencies) {}
  append(input: KernelScope & { sessionId: string; type: TimelineEvent['type']; parentIds?: readonly string[]; data?: Readonly<Record<string, unknown>> }): TimelineEvent { const sequence = this.events.filter((event) => event.sessionId === input.sessionId && sameScope(event, input)).length; const event = immutable({ tenantId: input.tenantId, projectId: input.projectId, userId: input.userId, sessionId: input.sessionId, id: this.dependencies.nextId(), type: input.type, sequence, createdAt: this.dependencies.now(), parentIds: [...(input.parentIds ?? [])], data: structuredClone(input.data ?? {}) }); this.events.push(event); return event; }
  history(sessionId: string, scope: KernelScope): readonly TimelineEvent[] { return immutable(this.events.filter((event) => event.sessionId === sessionId && sameScope(event, scope)).map((event) => structuredClone(event))); }
  graph(sessionId: string, scope: KernelScope) { const events = this.history(sessionId, scope); return immutable({ nodes: events, edges: events.flatMap((event) => event.parentIds.map((parentId) => ({ from: parentId, to: event.id }))) }); }
}
