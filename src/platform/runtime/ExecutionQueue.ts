import type { ExecutionPlan } from '../execution/ExecutionPlan';

export interface ExecutionQueueItem { readonly id: string; readonly plan: ExecutionPlan; readonly priority: number; readonly enqueuedAt: string; }

/** Stable priority queue for execution plans. */
export class ExecutionQueue {
  private readonly items: ExecutionQueueItem[] = [];
  enqueue(item: ExecutionQueueItem): void {
    if (this.items.some((candidate) => candidate.id === item.id)) throw new Error(`Execution "${item.id}" is already queued.`);
    this.items.push(Object.freeze({ ...item }));
    this.items.sort((left, right) => right.priority - left.priority || left.enqueuedAt.localeCompare(right.enqueuedAt));
  }
  dequeue(): ExecutionQueueItem | undefined { return this.items.shift(); }
  remove(id: string): boolean { const index = this.items.findIndex((item) => item.id === id); if (index < 0) return false; this.items.splice(index, 1); return true; }
  peek(): ExecutionQueueItem | undefined { return this.items[0]; }
  getAll(): readonly ExecutionQueueItem[] { return Object.freeze([...this.items]); }
  get size(): number { return this.items.length; }
}
