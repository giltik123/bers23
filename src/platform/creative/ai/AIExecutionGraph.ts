import { deepFreeze } from './immutable';
import type { AIGraphSnapshot, AIOperation } from './types';

export class AIExecutionGraph {
  readonly snapshot: AIGraphSnapshot;
  constructor(operations: readonly AIOperation[]) {
    const ids = new Set<string>();
    operations.forEach((op) => { if (!op.id || ids.has(op.id)) throw new Error(`Duplicate or empty operation id: ${op.id}`); ids.add(op.id); });
    operations.forEach((op) => (op.dependencies ?? []).forEach((id) => { if (!ids.has(id)) throw new Error(`Unknown dependency "${id}" for "${op.id}".`); }));
    const order = topological(operations);
    const byLevel = new Map<number, string[]>(); const levels = new Map<string, number>();
    order.forEach((id) => { const op = operations.find((item) => item.id === id)!; const level = Math.max(0, ...(op.dependencies ?? []).map((dep) => (levels.get(dep) ?? 0) + 1)); levels.set(id, level); byLevel.set(level, [...(byLevel.get(level) ?? []), id]); });
    this.snapshot = deepFreeze({ operations: operations.map((op) => ({ ...op, dependencies: [...(op.dependencies ?? [])] })), order, groups: [...byLevel.values()] });
  }
  ready(completed: ReadonlySet<string>, running: ReadonlySet<string> = new Set()): readonly AIOperation[] { return this.snapshot.operations.filter((op) => !completed.has(op.id) && !running.has(op.id) && (op.dependencies ?? []).every((id) => completed.has(id))); }
  dependants(id: string): readonly string[] { return this.snapshot.operations.filter((op) => op.dependencies?.includes(id)).map((op) => op.id); }
}
function topological(ops: readonly AIOperation[]): string[] { const pending = new Map(ops.map((op) => [op.id, new Set(op.dependencies ?? [])])); const out: string[] = []; while (pending.size) { const ready = [...pending].filter(([, deps]) => deps.size === 0).map(([id]) => id).sort(); if (!ready.length) throw new Error('AI execution graph contains a cycle.'); ready.forEach((id) => { out.push(id); pending.delete(id); pending.forEach((deps) => deps.delete(id)); }); } return out; }
