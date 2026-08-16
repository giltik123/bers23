import { DecisionDatasetBuilder } from './DecisionDatasetBuilder';
import { DecisionModelEvaluator } from './DecisionModelEvaluator';
import { DecisionModelRegistry } from './DecisionModelRegistry';
import { DecisionTrainerV1 } from './DecisionTrainerV1';
import { DECISION_BENCHMARK_V1 } from './benchmark';
import { immutable } from './immutable';
import { HeuristicBaselineModel, TabularDecisionModelV1 } from './TabularDecisionModelV1';
import type { DecisionCandidate, DecisionConstraints, DecisionContext, DecisionDatasetRecord, DecisionHistoryFeatures, DecisionModelV1 } from './types';
export class CreativeDecisionModel {
  private active: DecisionModelV1; private shadowModel?: DecisionModelV1; private readonly shadowLog: unknown[] = [];
  constructor(model: DecisionModelV1 = new HeuristicBaselineModel(), readonly registry = new DecisionModelRegistry(), readonly trainer = new DecisionTrainerV1(), readonly evaluator = new DecisionModelEvaluator(), readonly datasetBuilder = new DecisionDatasetBuilder()) { this.active = model; }
  predict(context: DecisionContext, candidate: DecisionCandidate, history: Partial<DecisionHistoryFeatures> = {}) { const result = this.active.predict(context, candidate, history); if (this.shadowModel) this.shadowLog.push(immutable({ timestamp: context.timestamp ?? 0, active: result, shadow: this.shadowModel.predict(context, candidate, history) })); return result; }
  rank(context: DecisionContext, candidates: readonly DecisionCandidate[], history: Partial<DecisionHistoryFeatures> = {}, constraints: DecisionConstraints = {}) { const result = this.active.rank(context, candidates, history, constraints); if (this.shadowModel) this.shadowLog.push(immutable({ timestamp: context.timestamp ?? 0, active: result, shadow: this.shadowModel.rank(context, candidates, history, constraints) })); return result; }
  evaluate(records: readonly DecisionDatasetRecord[], model: DecisionModelV1 = this.active) { return this.evaluator.evaluate(model, records); }
  explain(context: DecisionContext, candidate: DecisionCandidate, history: Partial<DecisionHistoryFeatures> = {}) { return this.active.explain(context, candidate, history); }
  benchmark(candidate: DecisionCandidate) { return immutable(DECISION_BENCHMARK_V1.map((context) => this.active.predict(context, candidate))); }
  train(records: readonly DecisionDatasetRecord[], version = 'v1') { return this.trainer.train(records, version); }
  validate(records: readonly DecisionDatasetRecord[]) { return this.trainer.validate(records); }
  register(model: DecisionModelV1 = this.active) { return this.registry.register(model.version()); }
  promote(model: DecisionModelV1) { const entry = this.registry.promote(model.version().modelVersion); this.active = model; return entry; }
  rollback(version: string, fallback: DecisionModelV1 = new HeuristicBaselineModel()) { const entry = this.registry.rollback(version); this.active = fallback; return entry; }
  shadow(model: DecisionModelV1) { this.shadowModel = model; return immutable({ mode: 'MODEL_SHADOW' as const, modelVersion: model.version().modelVersion }); }
  snapshot() { return immutable({ active: this.active.version(), shadow: this.shadowModel?.version(), registry: this.registry.list(), shadowDecisions: [...this.shadowLog] }); }
  debug() { return this.snapshot(); }
}
export { TabularDecisionModelV1 };
