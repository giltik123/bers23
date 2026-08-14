import { immutableClone } from '../local-ai';
import type { ModelBundle } from '../model-distribution';
import { AdaptiveSelectionMemory } from './memory';
import { DEFAULT_ADAPTIVE_POLICY, StatisticalExplorationPolicy, StatisticalPolicyTrainer } from './policy';
import { AdaptiveQualityCalibrator, StatisticalModelRanker, StatisticalOutcomeEvaluator, StatisticalOutcomePredictor, clamp, matrixId } from './statistics';
import type {
  AdaptiveOptions,
  AdaptivePolicy,
  AdaptivePorts,
  BundleAdaptation,
  CalibrationState,
  CreativeAdaptiveSnapshot,
  EvaluatedOutcome,
  ExecutionObservation,
  Experiment,
  LearningConfig,
  MatrixEntry,
  PolicyChange,
  PolicyVersion,
  Recommendation,
  RecommendationRequest,
  SimulationResult,
} from './types';

export const DEFAULT_LEARNING_CONFIG: LearningConfig = Object.freeze({
  minimumEvidence: 20,
  activationEvidence: 40,
  maximumVariance: .08,
  decayHalfLifeMs: 30 * 24 * 60 * 60 * 1_000,
  explorationRate: .1,
  canaryShare: .1,
  rollbackQualityDrop: .03,
  rollbackLatencyIncrease: .2,
  rollbackCostIncrease: .15,
  rollbackFallbackIncrease: .05,
});

export class CreativeAdaptiveAI {
  readonly #memory = new AdaptiveSelectionMemory();
  readonly #config: LearningConfig;
  readonly #observations = new Map<string, ExecutionObservation>();
  readonly #evaluated = new Map<string, EvaluatedOutcome>();
  readonly #versions: PolicyVersion[] = [];
  readonly #experiments: Experiment[] = [];
  readonly #rollbackHistory: PolicyVersion[] = [];
  readonly #timeline: { sequence: number; at: number; event: string }[] = [];
  readonly #evaluator;
  readonly #predictor;
  readonly #trainer;
  readonly #ranker;
  readonly #exploration;
  readonly #calibrator;
  #calibration: CalibrationState = Object.freeze({ qualityBias: 0, latencyMultiplier: 1, energyMultiplier: 1, sampleCount: 0 });
  #activePolicy: PolicyVersion;
  #adaptations = 0;
  #sequence = 0;

  constructor(readonly ports: AdaptivePorts, readonly options: AdaptiveOptions) {
    this.#config = Object.freeze({ ...DEFAULT_LEARNING_CONFIG, ...options.config });
    this.#evaluator = options.evaluator ?? new StatisticalOutcomeEvaluator();
    this.#predictor = options.predictor ?? new StatisticalOutcomePredictor();
    this.#trainer = options.trainer ?? options.policyModel ?? new StatisticalPolicyTrainer();
    this.#ranker = options.ranker ?? new StatisticalModelRanker();
    this.#exploration = options.exploration ?? new StatisticalExplorationPolicy();
    this.#calibrator = options.calibration ?? new AdaptiveQualityCalibrator();
    const privacyRestricted = options.privacyMode === 'LOCAL_ONLY' || options.privacyMode === 'OFFLINE_ONLY' || options.privacyMode === 'PRIVACY_FIRST';
    const policy = immutableClone({
      ...DEFAULT_ADAPTIVE_POLICY,
      ...(privacyRestricted ? { previewTarget: 'LOCAL' as const, finalTarget: 'LOCAL' as const } : {}),
      ...options.initialPolicy,
    });
    this.assertSecurityInvariant(policy);
    this.#activePolicy = this.version(policy, 'ACTIVE', 'Initial policy', 0, 0, null);
    this.#versions.push(this.#activePolicy);
  }

  observe(observation: ExecutionObservation): ExecutionObservation {
    this.assertScope(observation.scope);
    if (this.#observations.has(observation.observationId)) throw new Error('Duplicate observation');
    const safe = immutableClone(observation);
    this.#observations.set(observation.observationId, safe);
    this.event(`execution:observed:${observation.observationId}`);
    return safe;
  }

  evaluate(observationOrId: ExecutionObservation | string): EvaluatedOutcome {
    const observation = typeof observationOrId === 'string'
      ? this.#observations.get(observationOrId)
      : this.observeIfNeeded(observationOrId);
    if (!observation) throw new Error('Unknown observation');
    const existing = this.#evaluated.get(observation.observationId);
    if (existing) return immutableClone(existing);
    const outcome = immutableClone(this.#evaluator.evaluate(observation));
    this.#evaluated.set(observation.observationId, outcome);
    this.#calibration = immutableClone(this.#calibrator.update(this.#calibration, outcome));
    this.event(`outcome:evaluated:${observation.observationId}`);
    return outcome;
  }

  learn(outcomeOrId: EvaluatedOutcome | string): MatrixEntry {
    const outcome = typeof outcomeOrId === 'string' ? this.#evaluated.get(outcomeOrId) : outcomeOrId;
    if (!outcome) throw new Error('Outcome must be evaluated before learning');
    this.assertScope(outcome.observation.scope);
    const entry = this.#memory.record(outcome, this.#config);
    this.event(`evidence:learned:${matrixId(entry)}`);
    return entry;
  }

  recommend(request: RecommendationRequest): Recommendation {
    this.assertScope(request.scope);
    const eligible = request.candidates.filter((candidate) =>
      candidate.trustedModel && candidate.runtimeAllowed && !candidate.quarantined &&
      (candidate.target !== 'CLOUD' || request.cloudAllowed) &&
      (!candidate.outboundNetworkRequired || request.outboundNetworkAllowed));
    const privacyRestricted = this.options.privacyMode === 'LOCAL_ONLY' || this.options.privacyMode === 'OFFLINE_ONLY' || this.options.privacyMode === 'PRIVACY_FIRST';
    const privacySafe = privacyRestricted ? eligible.filter((candidate) => candidate.target !== 'CLOUD') : eligible;
    if (!privacySafe.length) throw new Error('No candidate passes immutable security and privacy boundaries');
    const explore = this.#exploration.explore(request.mode, this.ports.random(), this.#config.explorationRate);
    const ranked = privacySafe.map((candidate) => {
      const entry = this.#memory.get(candidate.key);
      const prediction = this.#calibrator.calibrate(this.#predictor.predict(candidate.key, entry), this.#calibration);
      const score = entry ? this.score(entry) : prediction.quality * 3 + prediction.successProbability * 2 - clamp(prediction.latencyMs / 10_000) - clamp(prediction.cost) - clamp(prediction.energy);
      return { candidate, entry, score };
    }).sort((a, b) => b.score - a.score || matrixId(a.candidate.key).localeCompare(matrixId(b.candidate.key)));
    const selected = explore ? (ranked[1] ?? ranked[0]) : ranked[0];
    const preferredTarget = request.phase === 'PREVIEW' ? this.#activePolicy.policy.previewTarget : this.#activePolicy.policy.finalTarget;
    const preferred = !explore && ranked.find((item) => item.candidate.target === preferredTarget);
    const choice = preferred ?? selected;
    return immutableClone({
      key: choice.candidate.key,
      target: choice.candidate.target,
      phase: request.phase,
      score: choice.score,
      confidence: choice.entry?.confidence ?? 0,
      exploration: explore,
      policyVersion: this.#activePolicy.version,
      explanation: this.explainChoice(choice.entry, explore),
    });
  }

  adapt(): PolicyChange | undefined {
    const evidence = this.#memory.list().filter((entry) =>
      entry.sampleCount >= this.#config.minimumEvidence && entry.variance <= this.#config.maximumVariance);
    if (!evidence.length) return undefined;
    const proposed = immutableClone(this.#trainer.train(this.#activePolicy.policy, evidence));
    this.assertSecurityInvariant(proposed);
    if (JSON.stringify(proposed) === JSON.stringify(this.#activePolicy.policy)) return undefined;
    const count = evidence.reduce((sum, entry) => sum + entry.sampleCount, 0);
    const expectedImpact = evidence.reduce((sum, entry) => sum + entry.confidence * entry.stability, 0) / evidence.length;
    const version = this.version(proposed, 'CANARY', 'Stable device-operation evidence changed ranking or thresholds', count, expectedImpact, this.#activePolicy.version);
    this.#versions.push(version);
    this.#adaptations += 1;
    this.event(`policy:canary:v${version.version}`);
    return immutableClone({ oldPolicy: this.#activePolicy.policy, newPolicy: proposed, reason: version.reason, evidenceCount: count, expectedImpact, version });
  }

  promote(version: number): PolicyVersion {
    const candidate = this.findVersion(version);
    if (candidate.status !== 'CANARY') throw new Error('Only a canary can be promoted');
    const deprecated = { ...this.#activePolicy, status: 'DEPRECATED' as const };
    this.replaceVersion(deprecated);
    const active = { ...candidate, status: 'ACTIVE' as const };
    this.replaceVersion(active);
    this.#activePolicy = active;
    this.event(`policy:promoted:v${version}`);
    return immutableClone(active);
  }

  compare(policyA: number, policyB: number, outcomesA: readonly EvaluatedOutcome[], outcomesB: readonly EvaluatedOutcome[]): Experiment {
    this.findVersion(policyA);
    this.findVersion(policyB);
    const average = (values: readonly EvaluatedOutcome[]) => values.length ? values.reduce((sum, item) => sum + item.utility, 0) / values.length : 0;
    const experiment = immutableClone({
      experimentId: `experiment:${this.#experiments.length + 1}`,
      policyA,
      policyB,
      samplesA: outcomesA.length,
      samplesB: outcomesB.length,
      utilityA: average(outcomesA),
      utilityB: average(outcomesB),
      status: 'COMPLETED' as const,
    });
    this.#experiments.push(experiment);
    this.event(`experiment:completed:${experiment.experimentId}`);
    return experiment;
  }

  rollback(version = this.#activePolicy.version, reason = 'Canary or active policy regressed'): PolicyVersion {
    const current = this.findVersion(version);
    const parent = current.parentVersion === null ? undefined : this.#versions.find((item) => item.version === current.parentVersion);
    if (!parent) throw new Error('No policy rollback point');
    const rolledBack = { ...current, status: 'ROLLED_BACK' as const, reason };
    this.replaceVersion(rolledBack);
    this.#rollbackHistory.push(rolledBack);
    const restored = { ...parent, status: 'ACTIVE' as const };
    this.replaceVersion(restored);
    this.#activePolicy = restored;
    this.event(`policy:rolled-back:v${version}`);
    return immutableClone(restored);
  }

  evaluateCanary(version: number, baseline: readonly EvaluatedOutcome[], canary: readonly EvaluatedOutcome[]): PolicyVersion {
    const baselineMetrics = this.metrics(baseline);
    const canaryMetrics = this.metrics(canary);
    const regressed = baselineMetrics.quality - canaryMetrics.quality > this.#config.rollbackQualityDrop ||
      canaryMetrics.latency > baselineMetrics.latency * (1 + this.#config.rollbackLatencyIncrease) ||
      canaryMetrics.cost > baselineMetrics.cost * (1 + this.#config.rollbackCostIncrease) ||
      canaryMetrics.fallback - baselineMetrics.fallback > this.#config.rollbackFallbackIncrease;
    return regressed ? this.rollback(version, 'Automatic rollback after canary regression') : this.promote(version);
  }

  simulate(request: RecommendationRequest, runs: number): SimulationResult {
    if (!Number.isInteger(runs) || runs <= 0 || runs > 10_000) throw new Error('Simulation runs must be between 1 and 10,000');
    const recommendation = this.recommend(request);
    const entry = this.#memory.get(recommendation.key);
    return immutableClone({
      runs,
      averageUtility: entry ? this.score(entry) : 0,
      predictedCloudSavings: entry?.cloudSavings ?? 0,
      recommended: recommendation,
    });
  }

  adaptBundle(bundle: ModelBundle): BundleAdaptation {
    const modelIds = new Set<string>(bundle.models.map((model) => model.manifest.modelId));
    const ranked = this.#ranker.rank(this.#memory.list().filter((entry) => modelIds.has(entry.modelId)));
    const useful = ranked.filter((entry) => entry.cloudSavings > 0 && entry.successRate >= .6 && entry.acceptanceRate >= .5).map((entry) => entry.modelId);
    const recommended: string[] = useful.length ? [...new Set<string>(useful)] : bundle.models.map((model) => model.manifest.modelId);
    return immutableClone({ original: bundle, recommendedModelIds: recommended, redundantModelIds: [...modelIds].filter((id) => !recommended.includes(id)), reason: 'Device-specific quality, economics, reliability, and acceptance ranking' });
  }

  snapshot(): CreativeAdaptiveSnapshot {
    const matrix = this.#memory.list();
    const rankings: Record<string, readonly string[]> = {};
    for (const entry of matrix) {
      const key = `${entry.deviceClass}:${entry.operation}`;
      rankings[key] = this.#ranker.rank(matrix.filter((item) => item.deviceClass === entry.deviceClass && item.operation === entry.operation)).map((item) => item.modelId);
    }
    return immutableClone({
      scope: this.options.scope,
      deviceMatrix: matrix,
      modelRankings: rankings,
      policyVersions: this.#versions,
      experiments: this.#experiments,
      calibration: this.#calibration,
      confidence: matrix.length ? matrix.reduce((sum, entry) => sum + entry.confidence, 0) / matrix.length : 0,
      learningStatistics: { observations: this.#observations.size, evaluated: this.#evaluated.size, adaptations: this.#adaptations },
      activeCanaries: this.#versions.filter((version) => version.status === 'CANARY'),
      rollbackHistory: this.#rollbackHistory,
      timeline: this.#timeline,
    });
  }

  debug(): Readonly<Record<string, unknown>> {
    return immutableClone({
      chain: ['Execution', 'Outcome', 'Prediction Error', 'Evidence', 'Policy Update', 'Canary', 'Evaluation', 'Promotion / Rejection', 'Current Policy'],
      currentPolicy: this.#activePolicy,
      snapshot: this.snapshot(),
      securityBoundary: 'NON_LEARNABLE',
    });
  }

  private score(entry: MatrixEntry): number {
    return entry.quality * 3 + entry.successRate * 2 + entry.cloudSavings * 1.5 + entry.acceptanceRate -
      clamp(entry.latencyMs / 10_000) - clamp(entry.energy) - clamp(entry.memoryMb / 16_384) - entry.fallbackRate;
  }

  private explainChoice(entry: MatrixEntry | undefined, exploration: boolean): readonly string[] {
    if (!entry) return ['No device-specific evidence; using the current policy baseline.'];
    return [
      `${exploration ? 'Exploration selected' : 'Ranking selected'} ${entry.modelId} on ${entry.deviceClass}.`,
      `After ${entry.sampleCount} runs: quality ${(entry.quality * 100).toFixed(1)}%, latency ${entry.latencyMs.toFixed(0)}ms, memory ${entry.memoryMb.toFixed(0)}MB.`,
      `Confidence ${(entry.confidence * 100).toFixed(0)}%; cloud savings ${(entry.cloudSavings * 100).toFixed(0)}%.`,
    ];
  }

  private metrics(outcomes: readonly EvaluatedOutcome[]) {
    const average = (select: (outcome: EvaluatedOutcome) => number) => outcomes.length ? outcomes.reduce((sum, item) => sum + select(item), 0) / outcomes.length : 0;
    return { quality: average((item) => item.observation.actual.quality), latency: average((item) => item.observation.actual.latencyMs), cost: average((item) => item.observation.actual.cost), fallback: average((item) => Number(item.observation.actual.fallbackUsed)) };
  }

  private assertSecurityInvariant(policy: AdaptivePolicy): void {
    const allowed = ['localQualityThreshold', 'escalationThreshold', 'deviceTierThreshold', 'previewTarget', 'finalTarget', 'bundlePriority', 'modelRanking'];
    if (Object.keys(policy).some((key) => !allowed.includes(key))) throw new Error('Learning cannot change the security boundary');
    if ((this.options.privacyMode === 'LOCAL_ONLY' || this.options.privacyMode === 'OFFLINE_ONLY' || this.options.privacyMode === 'PRIVACY_FIRST') && (policy.previewTarget === 'CLOUD' || policy.finalTarget === 'CLOUD')) throw new Error('Learning cannot increase cloud routing under privacy restrictions');
  }

  private assertScope(scope: AdaptiveOptions['scope']): void {
    if (scope.tenantId !== this.options.scope.tenantId || scope.projectId !== this.options.scope.projectId || scope.userId !== this.options.scope.userId) throw new Error('Cross-scope adaptive learning is forbidden');
  }

  private observeIfNeeded(observation: ExecutionObservation): ExecutionObservation {
    return this.#observations.get(observation.observationId) ?? this.observe(observation);
  }

  private version(policy: AdaptivePolicy, status: PolicyVersion['status'], reason: string, evidenceCount: number, expectedImpact: number, parentVersion: number | null): PolicyVersion {
    return immutableClone({ policyId: 'device-operation-policy', version: this.#versions.length + 1, parentVersion, status, policy, reason, evidenceCount, expectedImpact, createdAt: this.ports.now() });
  }

  private findVersion(version: number): PolicyVersion {
    const result = this.#versions.find((item) => item.version === version);
    if (!result) throw new Error(`Unknown policy version ${version}`);
    return result;
  }

  private replaceVersion(version: PolicyVersion): void {
    const index = this.#versions.findIndex((item) => item.version === version.version);
    this.#versions[index] = immutableClone(version);
  }

  private event(event: string): void {
    this.#timeline.push({ sequence: ++this.#sequence, at: this.ports.now(), event });
  }
}
