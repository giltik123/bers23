import { immutable } from './immutable';
import type { BlackboardChannel, BlackboardEntry, BlackboardSnapshot, KernelDependencies, KernelScope } from './types';

const sameScope = (left: KernelScope, right: KernelScope) => left.tenantId === right.tenantId && left.projectId === right.projectId && left.userId === right.userId;

export class UnifiedBlackboard {
  private readonly entries: BlackboardEntry[] = [];
  constructor(private readonly dependencies: KernelDependencies) {}

  write(input: KernelScope & { sessionId: string; channel: BlackboardChannel; author: string; key: string; value: unknown }): BlackboardEntry {
    const revision = this.entries.filter((entry) => entry.sessionId === input.sessionId && sameScope(entry, input)).length + 1;
    const entry = immutable({ ...input, id: this.dependencies.nextId(), value: structuredClone(input.value), revision, createdAt: this.dependencies.now() });
    this.entries.push(entry);
    return entry;
  }

  read(sessionId: string, scope: KernelScope, channel?: BlackboardChannel): readonly BlackboardEntry[] {
    return immutable(this.entries.filter((entry) => entry.sessionId === sessionId && sameScope(entry, scope) && (!channel || entry.channel === channel)).map((entry) => structuredClone(entry)));
  }

  latest(sessionId: string, scope: KernelScope, key: string): BlackboardEntry | undefined {
    return this.read(sessionId, scope).filter((entry) => entry.key === key).at(-1);
  }

  snapshot(sessionId: string, scope: KernelScope, revision?: number): BlackboardSnapshot {
    const entries = this.read(sessionId, scope).filter((entry) => revision === undefined || entry.revision <= revision);
    return immutable({ sessionId, revision: entries.at(-1)?.revision ?? 0, entries });
  }
}
