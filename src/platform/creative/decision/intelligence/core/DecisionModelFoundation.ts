import { clamp, immutable } from "./immutable";
import type { CreativeGoalNode, CreativeWorldState, IntelligenceScope } from "./CreativeCognitionV4";
import type { DecisionModel, DecisionModelCandidate, DecisionModelSample } from "./DecisionModels";

export interface EncodedDecisionFeatures {
  readonly names: readonly string[];
  readonly values: readonly number[];
  readonly version: string;
}

export interface DecisionFeatureEncoder {
  encode(state: CreativeWorldState, goals: readonly CreativeGoalNode[], context: Readonly<Record<string, number>>): EncodedDecisionFeatures;
}

export class HeuristicDecisionFeatureEncoder implements DecisionFeatureEncoder {
  encode(state: CreativeWorldState, goals: readonly CreativeGoalNode[], context: Readonly<Record<string, number>>): EncodedDecisionFeatures {
    const entries: [string, number][] = [];
    Object.entries(state.attributes).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, observation]) => {
      entries.push([`world.${key}.confidence`, clamp(observation!.confidence)]);
      if (typeof observation!.value === "number") entries.push([`world.${key}.value`, clamp(observation!.value)]);
    });
    goals.forEach((goal, index) => entries.push([`goal.${index}.importance`, clamp(goal.importance)]));
    Object.entries(context).sort(([a], [b]) => a.localeCompare(b)).forEach(([key, value]) => entries.push([`context.${key}`, clamp(value)]));
    return immutable({ names: entries.map(([name]) => name), values: entries.map(([, value]) => value), version: "features-v1" });
  }
}

export interface LatentDecisionVector {
  readonly dimensions: readonly number[];
  readonly version: string;
}
export interface DecisionLatentSpace {
  project(features: EncodedDecisionFeatures): LatentDecisionVector;
  similarity(left: LatentDecisionVector, right: LatentDecisionVector): number;
}

export class DeterministicDecisionLatentSpace implements DecisionLatentSpace {
  constructor(private readonly dimensions = 8) {}

  project(features: EncodedDecisionFeatures): LatentDecisionVector {
    const buckets = Array.from({ length: this.dimensions }, () => ({ sum: 0, count: 0 }));
    features.values.forEach((value, index) => { const bucket = buckets[index % this.dimensions]; bucket.sum += value; bucket.count += 1; });
    return immutable({ dimensions: buckets.map(({ sum, count }) => count ? sum / count : 0), version: "latent-v1" });
  }

  similarity(left: LatentDecisionVector, right: LatentDecisionVector): number {
    const length = Math.max(left.dimensions.length, right.dimensions.length);
    const distance = Math.sqrt(Array.from({ length }, (_, index) => ((left.dimensions[index] ?? 0) - (right.dimensions[index] ?? 0)) ** 2)
      .reduce((sum, value) => sum + value, 0) / Math.max(1, length));
    return clamp(1 - distance);
  }
}

export interface DecisionInferenceRequest {
  readonly scope: IntelligenceScope;
  readonly features: EncodedDecisionFeatures;
  readonly candidates: readonly DecisionModelCandidate[];
}
export interface DecisionInferenceResult {
  readonly selected: DecisionModelCandidate;
  readonly ranked: readonly DecisionModelCandidate[];
  readonly scores: Readonly<Record<string, number>>;
  readonly explanation: readonly string[];
  readonly modelVersion: string;
}
export interface DecisionInferenceEngine {
  infer(request: DecisionInferenceRequest): DecisionInferenceResult;
}

export class HeuristicDecisionInferenceEngine implements DecisionInferenceEngine {
  constructor(private readonly model: DecisionModel) {}

  infer(request: DecisionInferenceRequest): DecisionInferenceResult {
    if (!request.candidates.length) throw new Error("Inference requires at least one candidate");
    const ranked = this.model.rank(request.candidates);
    return immutable({ selected: structuredClone(ranked[0]), ranked: structuredClone(ranked),
      scores: Object.fromEntries(ranked.map((candidate) => [candidate.id, this.model.evaluate(candidate)])),
      explanation: [`Model ${this.model.version()} ranked ${ranked.length} candidates`, `Selected ${ranked[0].id}`], modelVersion: this.model.version() });
  }
}

export interface DecisionCheckpoint {
  readonly id: string;
  readonly modelId: string;
  readonly version: string;
  readonly featureVersion: string;
  readonly createdAt: number;
  readonly sampleCount: number;
  readonly compatibleModelVersions: readonly string[];
  readonly metadata: Readonly<Record<string, string | number | boolean>>;
}
export interface DecisionTrainer {
  train(model: DecisionModel, samples: readonly DecisionModelSample[], previous?: DecisionCheckpoint): DecisionCheckpoint;
}

export class HeuristicDecisionTrainer implements DecisionTrainer {
  constructor(private readonly dependencies: { readonly createId: () => string; readonly now: () => number }) {}

  train(model: DecisionModel, samples: readonly DecisionModelSample[], previous?: DecisionCheckpoint): DecisionCheckpoint {
    model.train(samples);
    return immutable({ id: this.dependencies.createId(), modelId: model.version(), version: `${model.version()}-checkpoint-${(previous?.sampleCount ?? 0) + samples.length}`,
      featureVersion: "features-v1", createdAt: this.dependencies.now(), sampleCount: (previous?.sampleCount ?? 0) + samples.length,
      compatibleModelVersions: [model.version()], metadata: { deterministic: true, previous: previous?.id ?? "none" } });
  }
}

export interface BenchmarkScenario {
  readonly id: string;
  readonly candidates: readonly DecisionModelCandidate[];
  readonly expectedWinnerId: string;
  readonly minimumScore?: number;
}
export interface BenchmarkResult {
  readonly modelVersion: string;
  readonly scenarios: number;
  readonly passed: number;
  readonly accuracy: number;
  readonly details: readonly { readonly scenarioId: string; readonly actualWinnerId: string; readonly passed: boolean; readonly score: number }[];
}

export class DecisionEvaluationBenchmark {
  evaluate(model: DecisionModel, scenarios: readonly BenchmarkScenario[]): BenchmarkResult {
    const details = scenarios.map((scenario) => {
      const winner = model.rank(scenario.candidates)[0];
      if (!winner) throw new Error(`Benchmark scenario ${scenario.id} has no candidates`);
      const score = model.evaluate(winner);
      return immutable({ scenarioId: scenario.id, actualWinnerId: winner.id,
        passed: winner.id === scenario.expectedWinnerId && score >= (scenario.minimumScore ?? 0), score });
    });
    const passed = details.filter((detail) => detail.passed).length;
    return immutable({ modelVersion: model.version(), scenarios: scenarios.length, passed,
      accuracy: scenarios.length ? passed / scenarios.length : 0, details });
  }
}

export class DecisionModelRegistry {
  private models: ReadonlyMap<string, DecisionModel> = new Map();
  private activeId?: string;

  register(id: string, model: DecisionModel): void {
    if (!id.trim()) throw new Error("Model id is required");
    this.models = new Map([...this.models, [id, model]]);
    if (!this.activeId) this.activeId = id;
  }

  activate(id: string, checkpoint?: DecisionCheckpoint): DecisionModel {
    const model = this.models.get(id);
    if (!model) throw new Error(`Unknown decision model: ${id}`);
    if (checkpoint && !checkpoint.compatibleModelVersions.includes(model.version())) throw new Error("Checkpoint is not compatible with this model");
    this.activeId = id;
    return model;
  }

  active(): DecisionModel {
    const model = this.activeId ? this.models.get(this.activeId) : undefined;
    if (!model) throw new Error("No active decision model");
    return model;
  }

  list(): readonly { readonly id: string; readonly version: string; readonly active: boolean }[] {
    return immutable([...this.models].map(([id, model]) => ({ id, version: model.version(), active: id === this.activeId }))
      .sort((a, b) => a.id.localeCompare(b.id)));
  }
}
