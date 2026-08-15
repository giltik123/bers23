import { immutable, round, stableHash } from './immutable';

export type V2LifecycleState = 'TRAINING' | 'VALIDATING' | 'SHADOW' | 'CANARY' | 'ACTIVE' | 'DEGRADED' | 'ROLLBACK' | 'RETIRED';

export interface VersionLineageV2 {
  readonly datasetVersion: string;
  readonly featureSchemaVersion: string;
  readonly encoderVersion: string;
  readonly trainingConfigVersion: string;
  readonly modelVersion: string;
  readonly calibrationVersion: string;
  readonly benchmarkVersion: string;
  readonly parentModel?: string;
}

export interface ProductBenchmarkMetrics {
  readonly safety: number;
  readonly ranking: number;
  readonly acceptance: number;
  readonly satisfaction: number;
  readonly unnecessaryAI: number;
  readonly calibrationError: number;
  readonly privacyViolations: number;
  readonly cost: number;
  readonly latency: number;
  readonly quality: number;
  readonly regret: number;
  readonly cloudAvoidance: number;
  readonly oodSafety: number;
  readonly stability: number;
}

export interface GovernedModelV2 {
  readonly lineage: VersionLineageV2;
  readonly state: V2LifecycleState;
  readonly metrics?: ProductBenchmarkMetrics;
  readonly canaryShare: number;
  readonly stateChangedAt: number;
}

export interface PromotionAssessment {
  readonly allowed: boolean;
  readonly failures: readonly string[];
}

export class DecisionGovernanceV2 {
  private readonly models = new Map<string, GovernedModelV2>();
  constructor(private readonly now: () => number = () => Date.now()) {}

  register(lineage: VersionLineageV2): GovernedModelV2 {
    if (this.models.has(lineage.modelVersion)) throw new Error(`Duplicate model ${lineage.modelVersion}`);
    const model = immutable({ lineage: immutable({ ...lineage }), state: 'TRAINING' as const, canaryShare: 0, stateChangedAt: this.now() });
    this.models.set(lineage.modelVersion, model);
    return model;
  }

  transition(version: string, state: V2LifecycleState, metrics?: ProductBenchmarkMetrics, canaryShare = 0): GovernedModelV2 {
    const current = this.models.get(version);
    if (!current) throw new Error(`Unknown model ${version}`);
    if (state === 'CANARY' && (canaryShare <= 0 || canaryShare >= 1)) throw new Error('Invalid canary share');
    const next = immutable({ ...current, state, metrics: metrics ?? current.metrics, canaryShare: state === 'ACTIVE' ? 1 : canaryShare, stateChangedAt: this.now() });
    this.models.set(version, next);
    return next;
  }

  assessPromotion(baseline: ProductBenchmarkMetrics, candidate: ProductBenchmarkMetrics): PromotionAssessment {
    const failures: string[] = [];
    if (candidate.safety < baseline.safety) failures.push('SAFETY_REGRESSION');
    if (candidate.ranking <= baseline.ranking) failures.push('RANKING_NOT_IMPROVED');
    if (candidate.acceptance < baseline.acceptance) failures.push('ACCEPTANCE_REGRESSION');
    if (candidate.unnecessaryAI > baseline.unnecessaryAI) failures.push('UNNECESSARY_AI_REGRESSION');
    if (candidate.calibrationError > baseline.calibrationError) failures.push('CALIBRATION_REGRESSION');
    if (candidate.privacyViolations > 0) failures.push('PRIVACY_VIOLATION');
    return immutable({ allowed: failures.length === 0, failures });
  }

  promote(version: string, baseline: ProductBenchmarkMetrics, candidate: ProductBenchmarkMetrics): GovernedModelV2 {
    const assessment = this.assessPromotion(baseline, candidate);
    if (!assessment.allowed) throw new Error(`Promotion blocked: ${assessment.failures.join(', ')}`);
    for (const model of this.models.values()) if (model.state === 'ACTIVE') this.transition(model.lineage.modelVersion, 'RETIRED');
    return this.transition(version, 'ACTIVE', candidate);
  }

  route(version: string, stableRequestId: string): boolean {
    const model = this.models.get(version);
    if (!model || !['CANARY', 'ACTIVE'].includes(model.state)) return false;
    return model.state === 'ACTIVE' || round(stableHash(stableRequestId)) < model.canaryShare;
  }

  snapshot(): readonly GovernedModelV2[] { return immutable([...this.models.values()]); }
}
