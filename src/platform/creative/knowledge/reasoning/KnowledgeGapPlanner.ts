import { deepFreeze } from '../immutable';
import type { CoverageResult, KnowledgeGapPlan } from './types';

export class KnowledgeGapPlanner {
  plan(coverage: CoverageResult): KnowledgeGapPlan {
    const gaps = [
      ...coverage.missing.map((concept) => ({ concept, need: `Need more ${concept} knowledge`, priority: 100 })),
      ...coverage.conflicting.map((concept) => ({ concept, need: `Need conflict resolution for ${concept}`, priority: 80 })),
      ...coverage.weak.map((concept) => ({ concept, need: `Need stronger evidence for ${concept}`, priority: 60 })),
    ].sort((a, b) => b.priority - a.priority || a.concept.localeCompare(b.concept));
    return deepFreeze({ gaps, complete: gaps.length === 0 });
  }
}
