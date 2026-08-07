import { immutable } from './immutable';
import type { Thought, ThoughtGraphSnapshot, ThoughtRelation } from './types';

export class ThoughtGraph {
  static build(thoughts: readonly Thought[], relations: readonly ThoughtRelation[]): ThoughtGraphSnapshot {
    const ids = new Set(thoughts.map((thought) => thought.id));
    if (ids.size !== thoughts.length) throw new Error('Thought IDs must be unique');
    for (const relation of relations) {
      if (!ids.has(relation.from) || !ids.has(relation.to)) throw new Error('Thought relation references an unknown thought');
    }
    return immutable({ thoughts: [...thoughts].sort((a, b) => b.saliency - a.saliency || a.id.localeCompare(b.id)), relations: [...relations] });
  }
}
