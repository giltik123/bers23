import { clamp, immutable, rounded } from './immutable';
import { HeuristicCuriosityPolicy, HeuristicLearningPolicy, HeuristicSaliencyModel } from './models';
import type { Assumption, BlackboardState, CognitiveDependencies, Contradiction, CreativeHypothesis, CuriosityPolicy, Evidence, Goal, Insight, LearningPolicy, SaliencyModel, SaliencySignals, Surprise, Thought } from './types';

export class SaliencyEngine {
  constructor(private readonly model: SaliencyModel = new HeuristicSaliencyModel()) {}
  score(signals: SaliencySignals): number { return this.model.score(signals); }
}
export class GoalStack {
  order(goals: readonly Goal[]): readonly Goal[] {
    const ids = new Set(goals.map((goal) => goal.id));
    for (const goal of goals) for (const blocker of goal.blockingGoalIds) if (!ids.has(blocker)) throw new Error(`Unknown blocking goal ${blocker}`);
    return immutable([...goals].sort((a, b) => b.priority - a.priority || b.weight - a.weight || (a.deadline ?? Infinity) - (b.deadline ?? Infinity) || a.id.localeCompare(b.id)));
  }
}
export class EvidenceManager {
  effectiveStrength(evidence: Evidence): number { return rounded(evidence.strength * evidence.reliability); }
  forClaim(evidence: readonly Evidence[], claim: string): readonly Evidence[] { return immutable(evidence.filter((item) => item.claim === claim).sort((a, b) => this.effectiveStrength(b) - this.effectiveStrength(a) || a.id.localeCompare(b.id))); }
}
export class HypothesisManager {
  evaluate(hypothesis: CreativeHypothesis, evidence: readonly Evidence[]): CreativeHypothesis {
    const manager = new EvidenceManager(); const support = evidence.filter((item) => hypothesis.evidenceIds.includes(item.id)).reduce((sum, item) => sum + manager.effectiveStrength(item), 0); const counter = evidence.filter((item) => hypothesis.counterEvidenceIds.includes(item.id)).reduce((sum, item) => sum + manager.effectiveStrength(item), 0); const confidence = rounded(hypothesis.confidence * .4 + clamp(.5 + support - counter) * .6);
    return immutable({ ...hypothesis, confidence, verification: support === counter ? 'UNVERIFIED' : support > counter ? 'SUPPORTED' : 'REJECTED' });
  }
}
export class AssumptionTracker {
  validate(assumption: Assumption, supported: boolean): Assumption { return immutable({ ...assumption, status: supported ? 'VALIDATED' : 'INVALIDATED', confidence: supported ? rounded(assumption.confidence + .2) : rounded(assumption.confidence - .4) }); }
}
export class ContradictionEngine {
  detect(thoughts: readonly Thought[], dependencies: CognitiveDependencies): readonly Contradiction[] {
    const conflicts: Contradiction[] = [];
    for (let left = 0; left < thoughts.length; left++) for (let right = left + 1; right < thoughts.length; right++) {
      const a = thoughts[left]; const b = thoughts[right]; const normalizedA = a.content.toLowerCase().replace(/\bneed\b/g, '').trim(); const normalizedB = b.content.toLowerCase().replace(/\b(no|avoid|without|not)\b/g, '').trim();
      if ((/\b(no|avoid|without|not)\b/i.test(b.content) && normalizedA.includes(normalizedB)) || (/\b(no|avoid|without|not)\b/i.test(a.content) && normalizedB.includes(normalizedA))) {
        const rankA = a.signals.confidence + a.saliency * .1;
        const rankB = b.signals.confidence + b.saliency * .1;
        const winner = rankA === rankB ? undefined : rankA > rankB ? a.id : b.id;
        conflicts.push(immutable({ id: dependencies.nextId(), leftThoughtId: a.id, rightThoughtId: b.id, severity: rounded((a.saliency + b.saliency) / 2), resolution: winner ? 'CONFIDENCE' : 'DEFER', winnerId: winner }));
      }
    }
    return immutable(conflicts);
  }
}
export class CuriosityEngine { constructor(private readonly policy: CuriosityPolicy = new HeuristicCuriosityPolicy()) {} explore(state: BlackboardState) { return this.policy.explore(state); } }
export class SurpriseEngine {
  constructor(private readonly threshold = .2) {}
  compare(expected: number, actual: number, dependencies: CognitiveDependencies): Surprise { const difference = rounded(Math.abs(actual - expected)); return immutable({ id: dependencies.nextId(), expected: clamp(expected), actual: clamp(actual), difference, significant: difference > this.threshold }); }
}
export class InsightGenerator { constructor(private readonly policy: LearningPolicy = new HeuristicLearningPolicy()) {} generate(outcomes: readonly { id: string; tags: readonly string[]; success: number }[]): readonly Insight[] { return this.policy.insights(outcomes); } }
