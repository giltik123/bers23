import { immutable } from './immutable';
import type { Scope } from './types';

export interface ExecutiveMemoryEntry extends Scope { id: string; strategyKey: string; success: boolean; at: number }

export class ExecutiveMemory {
  private readonly entries: ExecutiveMemoryEntry[] = [];
  record(entry: ExecutiveMemoryEntry): void { this.entries.push(immutable({ ...entry })); }
  history(scope: Scope): readonly ExecutiveMemoryEntry[] { return immutable(this.entries.filter((item) => item.tenantId === scope.tenantId && item.projectId === scope.projectId && item.userId === scope.userId).slice()); }
  successRate(scope: Scope, strategyKey: string): number { const records = this.history(scope).filter((item) => item.strategyKey === strategyKey); return records.length ? records.filter((item) => item.success).length / records.length : .5; }
}
