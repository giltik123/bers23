import type { RoutingCostEstimate } from './cost/RoutingCostEstimator';
import type { RoutingPolicyResult } from './policy/RoutingPolicyEngine';
import type { RiskScore } from './risk/RoutingRiskAnalyzer';
import type { RouteVersion } from './versioning/RouteVersion';
import type { RoutingValidationResult } from './validation/RoutingValidator';
import type { RoutingDebugTrace } from './RoutingDebugger';

/** Provider fallback details attached to a routing decision. */
export interface RoutingFallback { readonly required: boolean; readonly reason?: string; readonly unavailableProviders: readonly string[]; }

/** Immutable intelligent-discovery result returned by CapabilityRouter. */
export interface RoutingDecision {
  readonly request: string;
  readonly capabilities: readonly string[];
  readonly modules: readonly string[];
  readonly providers: readonly string[];
  readonly executionOrder: readonly string[];
  readonly confidence: number;
  readonly fallback: RoutingFallback;
  readonly evidence: readonly string[];
  readonly route: RouteVersion;
  readonly cost: RoutingCostEstimate;
  readonly risk: RiskScore;
  readonly validation: RoutingValidationResult;
  readonly policy: RoutingPolicyResult;
  readonly executable: boolean;
  readonly alternatives: readonly string[];
  readonly debug?: RoutingDebugTrace;
}
