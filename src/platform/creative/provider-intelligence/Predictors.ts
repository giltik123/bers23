import { clamp } from './immutable';
import type { ProviderCapability, ProviderHealthMetrics } from './types';
export class QualityPredictor { predict(capability: ProviderCapability, health: ProviderHealthMetrics): number { return clamp(capability.quality * .75 + capability.stability * .1 + health.successRate * .1 + health.availability * .05 - health.degradationTrend * .1); } }
export class LatencyPredictor { predict(capability: ProviderCapability, health: ProviderHealthMetrics): number { const historical = health.sampleCount ? health.averageLatencyMs : capability.latencyMs; return Math.max(0, Math.round(capability.latencyMs * .6 + historical * .4 + capability.latencyMs * health.retryFrequency * .1)); } }
