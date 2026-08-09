import { clamp, immutable, rounded } from './immutable';
import type { ConstitutionAssessment, ConstitutionalPrinciple, EvolutionDependencies, ObservatorySnapshot, EvolutionScope, ResearchAlternative, ResearchConclusion } from './types';
export class AutonomousResearchLayer {
  constructor(private readonly dependencies: EvolutionDependencies) {}
  research(question: string, count = 20): ResearchConclusion { if (count < 1) throw new Error('Research requires alternatives'); const alternatives: ResearchAlternative[] = Array.from({ length: count }, (_, index) => { const novelty = this.dependencies.random(); const feasibility = clamp(.95 - index * .025); const quality = clamp(.55 + novelty * .3 - index * .005); const cost = clamp(index / Math.max(1, count - 1)); const satisfaction = clamp((quality + feasibility) / 2); const score = rounded(quality * .35 + feasibility * .25 + satisfaction * .3 + (1 - cost) * .1); return immutable({ id: this.dependencies.nextId(), hypothesis: `${question} — alternative ${index + 1}`, feasibility, quality, cost, satisfaction, score }); }); const ranked = alternatives.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)); return immutable({ question, alternatives: ranked, winnerId: ranked[0].id, conclusion: ranked[0].hypothesis }); }
}
export class CreativeConstitution {
  readonly principles: readonly ConstitutionalPrinciple[] = immutable(['BEAUTY_FIRST', 'RESPECT_USER_INTENT', 'MINIMAL_NECESSARY_AI', 'PRESERVE_IDENTITY', 'BRAND_CONSISTENCY', 'NON_DESTRUCTIVE_EDITING', 'EXPLAIN_DECISIONS', 'PREFER_SIMPLICITY']);
  assess(signals: Partial<Record<ConstitutionalPrinciple, boolean>>): ConstitutionAssessment { const satisfied = this.principles.filter((item) => signals[item] !== false); const violations = this.principles.filter((item) => signals[item] === false); return immutable({ compliant: violations.length === 0, score: rounded(satisfied.length / this.principles.length), satisfied, violations }); }
}
export class IntelligenceObservatory {
  constructor(private readonly dependencies: EvolutionDependencies) {}
  snapshot(scope: EvolutionScope, input: Omit<ObservatorySnapshot, keyof EvolutionScope | 'id' | 'at' | 'overallHealth'>): ObservatorySnapshot { const moduleValues = Object.values(input.moduleStates); const moduleHealth = moduleValues.filter((item) => item === 'HEALTHY').length / Math.max(1, moduleValues.length); const overallHealth = rounded((moduleHealth + input.reasoningQuality + input.stability + (1 - input.workingMemoryLoad)) / 4); return immutable({ ...scope, id: this.dependencies.nextId(), at: this.dependencies.now(), ...structuredClone(input), overallHealth }); }
}
