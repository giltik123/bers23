import { deepFreeze, sameScope } from './immutable';
import type { ExecutionMemoryRecord, ExecutionScope } from './types';

export class ExecutionMemory {
  private records: readonly ExecutionMemoryRecord[] = [];

  remember(record: ExecutionMemoryRecord): ExecutionMemoryRecord {
    const value = deepFreeze({ ...record, scope: { ...record.scope }, errors: [...record.errors], verification: [...record.verification] }) as ExecutionMemoryRecord;
    this.records = deepFreeze([...this.records, value]);
    return value;
  }

  successful(scope: ExecutionScope): readonly ExecutionMemoryRecord[] { return deepFreeze(this.records.filter((item) => sameScope(item.scope, scope) && item.successful)); }
  failed(scope: ExecutionScope): readonly ExecutionMemoryRecord[] { return deepFreeze(this.records.filter((item) => sameScope(item.scope, scope) && !item.successful)); }
  snapshot(scope: ExecutionScope): readonly ExecutionMemoryRecord[] { return deepFreeze(this.records.filter((item) => sameScope(item.scope, scope))); }
}
