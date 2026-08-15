import { DecisionDatasetBuilder } from './DecisionDatasetBuilder';
import { DecisionModelEvaluator } from './DecisionModelEvaluator';
import { DecisionModelRegistry } from './DecisionModelRegistry';
import { DecisionTrainerV1 } from './DecisionTrainerV1';
import { DECISION_BENCHMARK_V1 } from './benchmark';
import { immutable } from './immutable';
import { HeuristicBaselineModel, TabularDecisionModelV1 } from './TabularDecisionModelV1';
import { DecisionModelV2 } from './DecisionModelV2';
import { DecisionModelDistiller } from './DecisionModelDistiller';
import { LocalVisualEncoder, CloudVisualEncoder } from './VisualFeatureEncoder';
import { MultimodalDecisionModel } from './MultimodalDecisionModel';
import type { DecisionCandidate, DecisionConstraints, DecisionContext, DecisionDatasetRecord, DecisionHistoryFeatures, DecisionModelV1 } from './types';
import type { CalibrationObservation } from './DecisionCalibrationV2';
import type { DecisionRepresentationInput, ListwiseExample, PairwiseExample } from './v2-types';
import type { CloudVisualFeatureRequest, LocalImageInput, MultimodalDecisionInput } from './visual-types';
export class CreativeDecisionModel {
  private active: DecisionModelV1; private shadowModel?: DecisionModelV1; private shadowV2?: DecisionModelV2; private readonly shadowLog: unknown[] = [];
  constructor(model: DecisionModelV1 = new HeuristicBaselineModel(), readonly registry = new DecisionModelRegistry(), readonly trainer = new DecisionTrainerV1(), readonly evaluator = new DecisionModelEvaluator(), readonly datasetBuilder = new DecisionDatasetBuilder(), readonly v2 = new DecisionModelV2(), readonly distiller = new DecisionModelDistiller(), readonly multimodal = new MultimodalDecisionModel(), readonly localVisualEncoder = new LocalVisualEncoder(), readonly cloudVisualEncoder = new CloudVisualEncoder()) { this.active = model; }
  encode(input: DecisionRepresentationInput) { return this.v2.encode(input); }
  predict(context: DecisionContext, candidate: DecisionCandidate, history: Partial<DecisionHistoryFeatures> = {}) { const result = this.active.predict(context, candidate, history); if (this.shadowModel) this.shadowLog.push(immutable({ timestamp: context.timestamp ?? 0, active: result, shadow: this.shadowModel.predict(context, candidate, history) })); if (this.shadowV2) this.shadowLog.push(immutable({ timestamp: context.timestamp ?? 0, mode: 'MODEL_SHADOW', active: result, v2: this.shadowV2.predict({ context, candidate, history }) })); return result; }
  rank(context: DecisionContext, candidates: readonly DecisionCandidate[], history: Partial<DecisionHistoryFeatures> = {}, constraints: DecisionConstraints = {}) { const result = this.active.rank(context, candidates, history, constraints); if (this.shadowModel) this.shadowLog.push(immutable({ timestamp: context.timestamp ?? 0, active: result, shadow: this.shadowModel.rank(context, candidates, history, constraints) })); return result; }
  evaluate(records: readonly DecisionDatasetRecord[], model: DecisionModelV1 = this.active) { return this.evaluator.evaluate(model, records); }
  explain(context: DecisionContext, candidate: DecisionCandidate, history: Partial<DecisionHistoryFeatures> = {}) { return this.active.explain(context, candidate, history); }
  benchmark(candidate: DecisionCandidate) { return immutable(DECISION_BENCHMARK_V1.map((context) => this.active.predict(context, candidate))); }
  train(records: readonly DecisionDatasetRecord[], version = 'v1') { return this.trainer.train(records, version); }
  validate(records: readonly DecisionDatasetRecord[]) { return this.trainer.validate(records); }
  register(model: DecisionModelV1 = this.active) { return this.registry.register(model.version()); }
  promote(model: DecisionModelV1) { const entry = this.registry.promote(model.version().modelVersion); this.active = model; return entry; }
  rollback(version: string, fallback: DecisionModelV1 = new HeuristicBaselineModel()) { const entry = this.registry.rollback(version); this.active = fallback; return entry; }
  rankPairwise(context: DecisionContext, a: DecisionCandidate, b: DecisionCandidate, options: Omit<DecisionRepresentationInput, 'context' | 'candidate'> = {}) { return this.v2.rankPairwise(context, a, b, options); }
  predictList(example: Omit<ListwiseExample, 'relevance'>, options: Omit<DecisionRepresentationInput, 'context' | 'candidate'> = {}) { return this.v2.predictList(example, options); }
  counterfactual(selected: DecisionRepresentationInput, alternative: DecisionCandidate) { return this.v2.counterfactual(selected, alternative); }
  calibrate(observations: readonly CalibrationObservation[]) { return this.v2.calibration.fit(observations); }
  learnPairwise(examples: readonly PairwiseExample[]) { this.v2.trainPairwise(examples); return this.v2.ranker.snapshot(); }
  learnListwise(examples: readonly ListwiseExample[]) { this.v2.trainListwise(examples); return this.v2.ranker.snapshot(); }
  distill(inputs: readonly DecisionRepresentationInput[], studentVersion?: string) { return this.distiller.distill(this.v2.ranker, inputs.map((input) => this.v2.encode(input)), studentVersion); }
  shadow(model: DecisionModelV1 | DecisionModelV2) { if (model instanceof DecisionModelV2) this.shadowV2 = model; else this.shadowModel = model; return immutable({ mode: 'MODEL_SHADOW' as const, modelVersion: model.version().modelVersion }); }
  compareVersions(records: readonly DecisionDatasetRecord[]) { const baseline = this.evaluator.evaluate(new HeuristicBaselineModel(), records); const active = this.evaluator.evaluate(this.active, records); return immutable({ baseline, active, deltas: this.evaluator.compare(baseline, active), v2: this.v2.version() }); }
  encodeVisualLocal(input: LocalImageInput) { return this.localVisualEncoder.encode(input); }
  encodeVisualCloud(input: CloudVisualFeatureRequest) { return this.cloudVisualEncoder.encode(input); }
  predictMultimodal(input: MultimodalDecisionInput) { return this.multimodal.predict(input); }
  rankMultimodal(input: Omit<MultimodalDecisionInput, 'candidate'>, candidates: readonly DecisionCandidate[]) { return this.multimodal.rank(input, candidates); }
  visualCounterfactual(input: MultimodalDecisionInput, alternative: DecisionCandidate) { return this.multimodal.counterfactual(input, alternative); }
  snapshot() { return immutable({ active: this.active.version(), shadow: this.shadowModel?.version(), shadowV2: this.shadowV2?.version(), v2: this.v2.version(), multimodal: this.multimodal.version, visualEncoders: [this.localVisualEncoder.version, this.cloudVisualEncoder.version], registry: this.registry.list(), shadowDecisions: [...this.shadowLog] }); }
  debug() { return this.snapshot(); }
}
export { TabularDecisionModelV1 };
