import type { ExecutionScope } from '../execution';
import { deepFreeze, sameScope } from './immutable';
import type { IntegrationDependencies, TimelineEntry, TimelineLayer } from './types';

export class UnifiedTimeline {
  private entries: readonly TimelineEntry[] = [];
  constructor(private readonly dependencies: IntegrationDependencies) {}

  append(scope: ExecutionScope, layer: TimelineLayer, referenceId: string, status: string, message: string): TimelineEntry {
    const value = deepFreeze({ id: this.dependencies.id(), scope: { ...scope }, layer, referenceId, status, timestamp: this.dependencies.now(), message }) as TimelineEntry;
    this.entries = deepFreeze([...this.entries, value]);
    return value;
  }

  list(scope: ExecutionScope): readonly TimelineEntry[] {
    return deepFreeze(this.entries.filter((item) => sameScope(item.scope, scope)).slice().sort((a, b) => a.timestamp - b.timestamp || a.id.localeCompare(b.id)));
  }
}
