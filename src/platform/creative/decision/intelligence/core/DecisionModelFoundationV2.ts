import { clamp, immutable } from "./immutable";
import type { CognitiveDependencies, CognitiveScope } from "./CreativeCognitiveV5";

export interface DecisionRepresentation { readonly version: string; readonly dimensions: readonly number[]; readonly metadata: Readonly<Record<string, string | number | boolean>> }
export interface DecisionEncoder<Input = Readonly<Record<string, number>>> { encode(input: Input): DecisionRepresentation }
export interface DecisionDecoder<Output = Readonly<Record<string, number>>> { decode(representation: DecisionRepresentation): Output }
export interface DecisionPolicy<Candidate = Readonly<{ id: string; representation: DecisionRepresentation }>> { select(candidates: readonly Candidate[]): Candidate }
export interface DecisionReward<Outcome = Readonly<Record<string, number>>> { reward(outcome: Outcome): number }
export interface DecisionLoss { loss(predicted: number, actual: number): number }
export interface DecisionReplayEntry<Input = unknown, Outcome = unknown> extends CognitiveScope { readonly id: string; readonly input: Input; readonly outcome: Outcome; readonly createdAt: number }
export interface DecisionReplayBuffer<Input = unknown, Outcome = unknown> { add(scope: CognitiveScope, input: Input, outcome: Outcome): DecisionReplayEntry<Input, Outcome>; sample(scope: CognitiveScope, limit: number): readonly DecisionReplayEntry<Input, Outcome>[] }
export interface DecisionModelEvaluator<Candidate = unknown> { evaluate(candidate: Candidate): number }
export interface DecisionInferenceSession<Candidate = unknown> extends CognitiveScope { readonly id: string; readonly candidates: readonly Candidate[]; readonly selected: Candidate; readonly modelVersion: string; readonly createdAt: number }

export class HeuristicDecisionEncoder implements DecisionEncoder {
  encode(input: Readonly<Record<string, number>>): DecisionRepresentation { const entries = Object.entries(input).sort(([a], [b]) => a.localeCompare(b)); return immutable({ version: "representation-v2", dimensions: entries.map(([, value]) => clamp(value)), metadata: { features: entries.map(([key]) => key).join(","), deterministic: true } }); }
}
export class HeuristicDecisionDecoder implements DecisionDecoder {
  decode(representation: DecisionRepresentation): Readonly<Record<string, number>> { const names = String(representation.metadata.features ?? "").split(",").filter(Boolean); return immutable(Object.fromEntries(representation.dimensions.map((value, index) => [names[index] ?? `dimension-${index}`, value]))); }
}
export class HeuristicDecisionPolicy implements DecisionPolicy {
  select<T extends Readonly<{ id: string; representation: DecisionRepresentation }>>(candidates: readonly T[]): T { const selected = [...candidates].sort((a, b) => average(b.representation.dimensions) - average(a.representation.dimensions) || a.id.localeCompare(b.id))[0]; if (!selected) throw new Error("Policy requires at least one candidate"); return selected; }
}
export class HeuristicDecisionReward implements DecisionReward { reward(outcome: Readonly<Record<string, number>>): number { const quality = outcome.quality ?? .5, satisfaction = outcome.satisfaction ?? .5, cost = outcome.cost ?? 0; return clamp(quality * .45 + satisfaction * .45 + (1 - clamp(cost)) * .1); } }
export class AbsoluteDecisionLoss implements DecisionLoss { loss(predicted: number, actual: number): number { return Math.abs(clamp(predicted) - clamp(actual)); } }
export class InMemoryDecisionReplayBuffer<Input = unknown, Outcome = unknown> implements DecisionReplayBuffer<Input, Outcome> {
  private entries: readonly DecisionReplayEntry<Input, Outcome>[] = immutable([]);
  constructor(private readonly dependencies: CognitiveDependencies) {}
  add(scope: CognitiveScope, input: Input, outcome: Outcome): DecisionReplayEntry<Input, Outcome> { const entry = immutable({ ...scope, id: this.dependencies.createId(), input: structuredClone(input), outcome: structuredClone(outcome), createdAt: this.dependencies.now() }); this.entries = immutable([...this.entries, entry]); return entry; }
  sample(scope: CognitiveScope, limit: number): readonly DecisionReplayEntry<Input, Outcome>[] { return immutable(this.entries.filter((entry) => entry.userId === scope.userId && entry.tenantId === scope.tenantId && entry.projectId === scope.projectId).slice(-Math.max(0, limit)).map((entry) => structuredClone(entry))); }
}
export class HeuristicDecisionInferenceSessionFactory {
  constructor(private readonly dependencies: CognitiveDependencies, private readonly policy: DecisionPolicy, private readonly modelVersion = "heuristic-v2") {}
  create<T extends Readonly<{ id: string; representation: DecisionRepresentation }>>(scope: CognitiveScope, candidates: readonly T[]): DecisionInferenceSession<T> { return immutable({ ...scope, id: this.dependencies.createId(), candidates: structuredClone(candidates), selected: structuredClone(this.policy.select(candidates) as T), modelVersion: this.modelVersion, createdAt: this.dependencies.now() }); }
}
const average = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
