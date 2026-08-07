import { clamp, deepFreeze } from '../immutable';
import type { EvidenceItem, EvidenceSet } from './types';

export class EvidenceAccumulator {
  accumulate(
    groups: readonly (readonly EvidenceItem[])[],
    conflicts: readonly (readonly [string, string])[] = [],
  ): EvidenceSet {
    const byId = new Map<string, EvidenceItem>();
    for (const item of groups.flat()) {
      const current = byId.get(item.id);
      if (!current || item.confidence * item.support > current.confidence * current.support) {
        byId.set(item.id, deepFreeze({
          ...item,
          confidence: clamp(item.confidence),
          support: Math.max(0, item.support),
        }) as EvidenceItem);
      }
    }
    const items = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
    const totalSupport = items.reduce((sum, item) => sum + item.support, 0);
    const confidence = items.length === 0
      ? 0
      : items.reduce((sum, item) => sum + item.confidence * (item.support + 1), 0)
        / items.reduce((sum, item) => sum + item.support + 1, 0);
    return deepFreeze({
      items,
      confidence: clamp(confidence * Math.max(0, 1 - conflicts.length * 0.1)),
      support: totalSupport,
      conflicts: conflicts.map((pair) => [...pair] as [string, string]),
    });
  }
}
