import type { PlatformContext } from '../PlatformContext';
import { CapabilityMatcher } from './CapabilityMatcher';
import { CapabilityPolicy, type ProviderAvailability } from './CapabilityPolicy';
import { CapabilityResolver } from './CapabilityResolver';
import { createDefaultCapabilityGraph, type CapabilityGraph } from './CapabilityGraph';
import type { RoutingDecision } from './RoutingDecision';
import { RoutingCostEstimator, type RoutingBudget } from './cost/RoutingCostEstimator';
import { RoutingPolicyEngine } from './policy/RoutingPolicyEngine';
import { RoutingRiskAnalyzer } from './risk/RoutingRiskAnalyzer';
import { RoutingValidator } from './validation/RoutingValidator';
import { createRouteVersion } from './versioning/RouteVersion';
import { RoutingDebugger } from './RoutingDebugger';

/** Optional dependencies used to customize capability routing behavior. */
export interface CapabilityRouterOptions {
  readonly graph?: CapabilityGraph;
  readonly resolver?: CapabilityResolver;
  readonly providerAvailability?: ProviderAvailability;
  readonly budget?: RoutingBudget;
  readonly allowHighRisk?: boolean;
  readonly debug?: boolean;
}

/** Main facade for natural-language capability routing and intelligent discovery. */
export class CapabilityRouter {
  private readonly platform: PlatformContext;
  private readonly graph: CapabilityGraph;
  private readonly resolver: CapabilityResolver;
  private readonly matcher: CapabilityMatcher;
  private readonly policy: CapabilityPolicy;
  private readonly validator: RoutingValidator;
  private readonly costEstimator: RoutingCostEstimator;
  private readonly riskAnalyzer = new RoutingRiskAnalyzer();
  private readonly policyEngine = new RoutingPolicyEngine();
  private readonly debugger = new RoutingDebugger();
  private readonly budget: RoutingBudget;
  private readonly allowHighRisk: boolean;
  private readonly debug: boolean;

  constructor(platform: PlatformContext, options: CapabilityRouterOptions = {}) {
    this.platform = platform;
    this.graph = options.graph ?? createDefaultCapabilityGraph();
    this.resolver = options.resolver ?? new CapabilityResolver();
    this.matcher = new CapabilityMatcher(platform, this.graph);
    this.policy = new CapabilityPolicy(platform, this.graph, options.providerAvailability);
    this.validator = new RoutingValidator(platform, this.graph);
    this.costEstimator = new RoutingCostEstimator(this.graph);
    this.budget = options.budget ?? Object.freeze({ tier: 'pro', maxCredits: 100 });
    this.allowHighRisk = options.allowHighRisk ?? false;
    this.debug = options.debug ?? false;
  }

  /** Resolves a request, discovers tools, applies availability policy, and returns an execution route. */
  async route(request: string): Promise<RoutingDecision> {
    const resolution = this.resolver.resolve(request);
    const capabilities = this.graph.expand(resolution.capabilities);
    const match = this.matcher.match(capabilities);
    const policy = await this.policy.apply(capabilities, match);
    const executionOrder = Object.freeze([...this.graph.executionOrder(resolution.capabilities)]);
    const route = createRouteVersion(request, capabilities, policy.providers);
    const cost = this.costEstimator.estimate(capabilities, policy.providers, this.budget);
    const experimentalProvider = policy.providers.some((id) => this.platform.providers.get(id)?.experimental);
    const risk = this.riskAnalyzer.analyze(request, capabilities, experimentalProvider);
    const validation = this.validator.validate({ capabilities, modules: policy.modules, providers: policy.providers });
    const policyEvaluation = this.policyEngine.evaluate({ budget: this.budget, cost, risk, allowHighRisk: this.allowHighRisk });
    const base = {
      request,
      capabilities: Object.freeze([...capabilities]),
      modules: Object.freeze([...policy.modules]),
      providers: Object.freeze([...policy.providers]),
      executionOrder,
      confidence: policy.fallback ? Math.min(resolution.confidence, 0.5) : resolution.confidence,
      fallback: Object.freeze({ required: policy.fallback, reason: policy.reason, unavailableProviders: policy.unavailableProviders }),
      evidence: resolution.evidence,
      route,
      cost,
      risk,
      validation,
      policy: policyEvaluation,
      executable: validation.valid && policyEvaluation.allowed && !policy.fallback,
      alternatives: Object.freeze(policy.fallback ? ['image-edit-preview'] : []),
    } satisfies Omit<RoutingDecision, 'debug'>;
    const decision = Object.freeze(base) as RoutingDecision;
    return this.debug ? Object.freeze({ ...base, debug: this.debugger.create(decision) }) : decision;
  }
}
