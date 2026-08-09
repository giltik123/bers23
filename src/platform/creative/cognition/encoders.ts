import { immutable, rounded } from './immutable';
import type { AttentionDistribution, Evidence, Thought } from './types';
import type { AttentionEncoder, CognitivePlan, CognitiveReflection, EvidenceEncoder, HypothesisEncoder, MemoryEncoder, MentalScenario, PlanningEncoder, ReasoningCycle, ReasoningEncoder, ReasoningMacro, ReflectionEncoder, SimulationEncoder, ThoughtEncoder, WorkspaceEncoder, WorkspaceHypothesis, WorkspaceSnapshot } from './v2-types';

const textVector = (value: string): readonly number[] => immutable([rounded(value.length / 100), rounded(new Set(value.toLowerCase()).size / 40), rounded([...value].reduce((sum, character) => sum + character.charCodeAt(0), 0) % 997 / 997)]);
export class HeuristicReasoningEncoder implements ReasoningEncoder { encode(value: readonly ReasoningCycle[]) { return immutable([rounded(value.length / 10), rounded(value.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, value.length))]); } }
export class HeuristicWorkspaceEncoder implements WorkspaceEncoder { encode(value: WorkspaceSnapshot) { return immutable([rounded(value.revision / 100), rounded(value.data.thoughts.length / 20), rounded(value.data.evidence.length / 20), rounded(value.data.hypotheses.length / 10)]); } }
export class HeuristicThoughtEncoder implements ThoughtEncoder { encode(value: Thought) { return immutable([...textVector(value.content), value.saliency]); } }
export class HeuristicHypothesisEncoder implements HypothesisEncoder { encode(value: WorkspaceHypothesis) { return immutable([...textVector(value.statement), value.confidence, value.support, value.contradictions, value.predictedValue, value.survivalScore].map(rounded)); } }
export class HeuristicEvidenceEncoder implements EvidenceEncoder { encode(value: Evidence) { return immutable([...textVector(value.claim), value.strength, value.reliability].map(rounded)); } }
export class HeuristicReflectionEncoder implements ReflectionEncoder { encode(value: CognitiveReflection) { return immutable([value.useful.length, value.unnecessary.length, value.eliminatedHypotheses.length, value.newHypotheses.length, value.verifyLater.length].map((item) => rounded(item / 10))); } }
export class HeuristicPlanningEncoder implements PlanningEncoder { encode(value: CognitivePlan) { return immutable([rounded(value.steps.length / 10), value.confidence]); } }
export class HeuristicSimulationEncoder implements SimulationEncoder { encode(value: MentalScenario) { return immutable([value.quality, value.cost, value.satisfaction, value.risk].map(rounded)); } }
export class HeuristicAttentionEncoder implements AttentionEncoder { encode(value: AttentionDistribution) { return immutable(Object.keys(value).sort().map((key) => rounded(value[key as keyof AttentionDistribution]))); } }
export class HeuristicMemoryEncoder implements MemoryEncoder { encode(value: ReasoningMacro) { return immutable([...textVector(value.pattern), rounded(value.template.length / 10), rounded(value.sourceThoughtIds.length / 20)]); } }
