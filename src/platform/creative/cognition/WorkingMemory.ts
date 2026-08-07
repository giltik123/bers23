import { immutable } from './immutable';
import type { AttentionDistribution, ComposedStrategy, Thought, WorkingMemorySnapshot } from './types';

export class WorkingMemory {
  constructor(private readonly capacity = 20) { if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Working memory capacity must be a positive integer'); }
  update(input: { thoughts: readonly Thought[]; attention: AttentionDistribution; hypothesisId?: string; goalId?: string; strategy?: ComposedStrategy; debate?: readonly string[] }): WorkingMemorySnapshot {
    const activeThoughts = [...input.thoughts].sort((a, b) => b.saliency - a.saliency || b.createdAt - a.createdAt || a.id.localeCompare(b.id)).slice(0, this.capacity);
    return immutable({ activeThoughts, attention: input.attention, hypothesisId: input.hypothesisId, goalId: input.goalId, strategy: input.strategy, debate: [...(input.debate ?? [])], capacity: this.capacity });
  }
}
