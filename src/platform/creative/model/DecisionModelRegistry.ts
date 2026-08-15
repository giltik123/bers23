import { immutable } from './immutable';
import type { ModelMetadata, ModelMetrics, ModelStatus, RegisteredModel } from './types';
export interface RollbackThresholds { qualityLoss: number; acceptanceLoss: number; costIncrease: number; regretIncrease: number }
export class DecisionModelRegistry {
  private readonly models = new Map<string, RegisteredModel>();
  constructor(private readonly thresholds: RollbackThresholds = { qualityLoss: .02, acceptanceLoss: .02, costIncrease: .05, regretIncrease: .02 }) {}
  register(metadata: ModelMetadata): RegisteredModel { if (this.models.has(metadata.modelVersion)) throw new Error(`Model ${metadata.modelVersion} already registered`); const entry = immutable({ ...metadata, status: 'CANDIDATE' as const, canaryShare: 0 }); this.models.set(metadata.modelVersion, entry); return entry; }
  get(version: string): RegisteredModel | undefined { return this.models.get(version); }
  list(): readonly RegisteredModel[] { return immutable([...this.models.values()]); }
  private update(version: string, status: ModelStatus, canaryShare = 0): RegisteredModel { const current = this.models.get(version); if (!current) throw new Error(`Unknown model ${version}`); const next = immutable({ ...current, status, canaryShare }); this.models.set(version, next); return next; }
  canary(version: string, share = .1): RegisteredModel { if (share <= 0 || share >= 1) throw new Error('Canary share must be between zero and one'); return this.update(version, 'CANARY', share); }
  promote(version: string): RegisteredModel { for (const item of this.models.values()) if (item.status === 'ACTIVE') this.update(item.modelVersion, 'DEPRECATED'); return this.update(version, 'ACTIVE', 1); }
  reject(version: string): RegisteredModel { return this.update(version, 'REJECTED'); }
  rollback(version: string): RegisteredModel { return this.update(version, 'ROLLED_BACK'); }
  shouldRollback(baseline: Partial<ModelMetrics>, candidate: Partial<ModelMetrics>): boolean { return (baseline.qualityPredictionError ?? 0) + this.thresholds.qualityLoss < (candidate.qualityPredictionError ?? 0) || (baseline.acceptancePrediction ?? 0) - this.thresholds.acceptanceLoss > (candidate.acceptancePrediction ?? 0) || (baseline.costPredictionError ?? 0) + this.thresholds.costIncrease < (candidate.costPredictionError ?? 0) || (baseline.decisionRegret ?? 0) + this.thresholds.regretIncrease < (candidate.decisionRegret ?? 0); }
  route(version: string, stableKey: string): boolean { const model = this.models.get(version); if (!model || model.status === 'CANDIDATE' || model.status === 'REJECTED' || model.status === 'ROLLED_BACK') return false; if (model.status === 'ACTIVE') return true; let hash = 0; for (const char of stableKey) hash = (hash * 31 + char.charCodeAt(0)) >>> 0; return hash / 4294967296 < model.canaryShare; }
}
