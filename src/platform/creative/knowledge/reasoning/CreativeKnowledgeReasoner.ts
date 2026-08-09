import type { CreativeKnowledgeSystem } from '../CreativeKnowledgeSystem';
import { deepFreeze } from '../immutable';
import type { KnowledgeDependencies } from '../types';
import { KnowledgeContradictionResolver } from './KnowledgeContradictionResolver';
import { KnowledgeCoverageAnalyzer } from './KnowledgeCoverageAnalyzer';
import { KnowledgeExplainability } from './KnowledgeExplainability';
import { KnowledgeGapPlanner } from './KnowledgeGapPlanner';
import { KnowledgeInferenceEngine } from './KnowledgeInferenceEngine';
import { KnowledgePlanner } from './KnowledgePlanner';
import { KnowledgeQuery } from './KnowledgeQuery';
import { KnowledgeRanker } from './KnowledgeRanker';
import { KnowledgeSimulation, type KnowledgeSimulationInput } from './KnowledgeSimulation';
import { SemanticReasoner } from './SemanticReasoner';
import type {
  ContradictionCandidate,
  KnowledgeInference,
  KnowledgeReasoningSnapshot,
  ReasoningRequest,
} from './types';

export interface CreativeKnowledgeReasonerOptions {
  readonly knowledge: CreativeKnowledgeSystem;
  readonly dependencies: KnowledgeDependencies;
}

export class CreativeKnowledgeReasoner {
  readonly semantic: SemanticReasoner;
  readonly queries: KnowledgeQuery;
  readonly ranking = new KnowledgeRanker();
  private readonly inferenceEngine: KnowledgeInferenceEngine;
  private readonly planner: KnowledgePlanner;
  private readonly simulation = new KnowledgeSimulation();
  private readonly explainability = new KnowledgeExplainability();
  private readonly coverageAnalyzer: KnowledgeCoverageAnalyzer;
  private readonly gapPlanner = new KnowledgeGapPlanner();
  private readonly contradictionResolver = new KnowledgeContradictionResolver();
  private lastInference?: KnowledgeInference;
  private lastSnapshot?: KnowledgeReasoningSnapshot;

  constructor(private readonly options: CreativeKnowledgeReasonerOptions) {
    if (!options?.knowledge || !options.dependencies?.id || !options.dependencies?.now) {
      throw new Error('CreativeKnowledgeReasoner requires knowledge, id and now dependencies');
    }
    this.inferenceEngine = new KnowledgeInferenceEngine(options.knowledge, options.dependencies);
    this.planner = new KnowledgePlanner(options.knowledge, this.inferenceEngine, options.dependencies);
    this.semantic = new SemanticReasoner(options.knowledge);
    this.queries = new KnowledgeQuery(options.knowledge);
    this.coverageAnalyzer = new KnowledgeCoverageAnalyzer(options.knowledge);
  }

  reason(request: ReasoningRequest): KnowledgeInference {
    return this.infer(request);
  }

  plan(request: ReasoningRequest) {
    return this.planner.plan(request);
  }

  infer(request: ReasoningRequest): KnowledgeInference {
    this.lastInference = this.inferenceEngine.infer(request);
    return this.lastInference;
  }

  forward(request: ReasoningRequest) {
    return this.infer(request);
  }

  backward(request: ReasoningRequest) {
    return this.inferenceEngine.backward(request);
  }

  simulate(input?: KnowledgeSimulationInput) {
    const value = input ?? (this.lastInference ? { inference: this.lastInference } : undefined);
    if (!value) throw new Error('No inference available for simulation');
    return this.simulation.simulate(value);
  }

  validate(request: ReasoningRequest) {
    return deepFreeze({
      valid: Boolean(request.scope?.tenantId && request.scope?.projectId && request.scope?.userId && request.goal.trim()),
      issues: this.options.knowledge.validator().validate(
        this.options.knowledge.graph(),
        this.options.knowledge.ontology(),
        this.options.knowledge.rules().rules(),
        request.scope,
      ),
    });
  }

  explain(inference: KnowledgeInference = this.requiredInference()) {
    return this.explainability.explain(inference);
  }

  coverage(request: ReasoningRequest) {
    return this.coverageAnalyzer.analyze([
      request.goal,
      ...request.facts.map((item) => typeof item === 'string' ? item : item.concept),
    ], request.scope);
  }

  debug(inference: KnowledgeInference = this.requiredInference()) {
    return deepFreeze({
      scope: inference.scope,
      goal: inference.goal,
      facts: inference.facts,
      activatedRules: inference.activatedRules,
      evidence: inference.evidence,
      path: inference.knowledgePath,
      tree: inference.inferenceTree,
      confidence: inference.confidence,
      alternatives: inference.alternatives,
    });
  }

  resolveContradictions(candidates: readonly ContradictionCandidate[]) {
    return this.contradictionResolver.resolve(candidates);
  }

  snapshot(request?: ReasoningRequest): KnowledgeReasoningSnapshot {
    const inference = request ? this.infer(request) : this.requiredInference();
    const coverage = request
      ? this.coverage(request)
      : this.coverageAnalyzer.analyze([inference.goal, ...inference.knowledgePath], inference.scope);
    const candidates = inference.conclusions.map((item, index) => ({
      id: `conclusion:${index}`,
      value: item.concept,
      confidence: item.confidence,
      support: inference.evidence.support,
      priority: 0,
    }));
    const detected = this.contradictionResolver.detect(candidates);
    const contradictions = detected.map(([left, right]) => this.contradictionResolver.resolve(candidates.filter((item) => item.id === left || item.id === right)));
    this.lastSnapshot = deepFreeze({
      id: this.options.dependencies.id(),
      scope: { ...inference.scope },
      facts: inference.facts,
      rules: this.options.knowledge.rules().rules(),
      activatedRules: inference.activatedRules,
      inferenceTree: inference.inferenceTree,
      recommendations: inference.conclusions.map((item) => item.concept),
      confidence: inference.confidence,
      coverage,
      contradictions,
      gaps: this.gapPlanner.plan(coverage),
      createdAt: this.options.dependencies.now(),
    });
    return this.lastSnapshot;
  }

  private requiredInference(): KnowledgeInference {
    if (!this.lastInference) throw new Error('No inference available');
    return this.lastInference;
  }
}
