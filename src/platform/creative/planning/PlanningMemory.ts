import { deepFreeze, sameScope } from './immutable';
import type { PlanMemoryRecord, PlanningScope } from './types';

export class PlanningMemory {
  private records: readonly PlanMemoryRecord[] = [];

  remember(record: PlanMemoryRecord): PlanMemoryRecord {
    const frozen = deepFreeze({ ...record, scope: { ...record.scope }, errors: [...record.errors], structure: [...record.structure], metrics: { ...record.metrics } }) as PlanMemoryRecord;
    this.records = deepFreeze([...this.records, frozen]);
    return frozen;
  }

  successful(scope: PlanningScope): readonly PlanMemoryRecord[] { return deepFreeze(this.records.filter((item) => sameScope(item.scope, scope) && item.successful)); }
  failed(scope: PlanningScope): readonly PlanMemoryRecord[] { return deepFreeze(this.records.filter((item) => sameScope(item.scope, scope) && !item.successful)); }
  frequentErrors(scope: PlanningScope): readonly { error: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const record of this.failed(scope)) for (const error of record.errors) counts.set(error, (counts.get(error) ?? 0) + 1);
    return deepFreeze([...counts].map(([error, count]) => ({ error, count })).sort((a, b) => b.count - a.count || a.error.localeCompare(b.error)));
  }
  bestStructures(scope: PlanningScope): readonly (readonly string[])[] {
    return deepFreeze(this.successful(scope).slice().sort((a, b) => b.metrics.quality - a.metrics.quality || a.id.localeCompare(b.id)).map((item) => item.structure));
  }
  snapshot(scope: PlanningScope): readonly PlanMemoryRecord[] { return deepFreeze(this.records.filter((item) => sameScope(item.scope, scope))); }
}
