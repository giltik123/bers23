import { immutable } from "./immutable";
import { AdaptivePersonas, OnlineWeightAdapter } from "./AdaptivePersonas";
import { ConfidenceEstimator } from "./ConfidenceEstimator";
import { ConstraintSolver } from "./ConstraintSolver";
import { DecisionEvaluator } from "./DecisionEvaluator";
import { DecisionMemory } from "./DecisionMemory";
import { DecisionReplay } from "./DecisionReplay";
import { DecisionTournament, UtilityPairwiseComparison } from "./DecisionTournament";
import { ExplainabilityTree } from "./ExplainabilityTree";
import { GoalDetector } from "./GoalEngine";
import { MetaDecisionEngine } from "./MetaDecisionEngine";
import { RiskAnalyzer } from "./RiskAnalyzer";
import { UncertaintyResolver } from "./DecisionUncertainty";
import { UtilityOptimizer, WeightedUtilityFunction } from "./UtilityOptimizer";
import type { AdaptiveWeights, ConfidenceEvidence, CoreDebugSnapshot, CoreDecisionContext, CoreDependencies, DecisionConstraint, DecisionEpisode, GoalContext, RiskScore } from "./types";

export class CreativeDecisionCore {
  readonly memory = new DecisionMemory(); readonly evaluator = new DecisionEvaluator();
  private readonly replays = new DecisionReplay(this.memory);
  private readonly goals: GoalDetector; private readonly constraints = new ConstraintSolver(); private readonly personas = new AdaptivePersonas();
  private readonly confidence = new ConfidenceEstimator(); private readonly risk = new RiskAnalyzer(); private readonly uncertainty = new UncertaintyResolver();
  private readonly optimizer = new UtilityOptimizer(new WeightedUtilityFunction(), this.constraints); private readonly tournament = new DecisionTournament(new UtilityPairwiseComparison());
  private readonly meta = new MetaDecisionEngine(); private readonly explanations = new ExplainabilityTree(); private readonly learning = new OnlineWeightAdapter();
  constructor(private readonly dependencies: CoreDependencies) { this.goals = new GoalDetector(dependencies); }
  analyzeGoal(prompt: string): GoalContext { return this.goals.detect(prompt); }
  solveConstraints(constraints: readonly DecisionConstraint[]) { return this.constraints.solve(constraints); }
  generateCandidates(context: CoreDecisionContext, goal = this.analyzeGoal(context.prompt)) { return immutable(this.dependencies.generateCandidates(context, goal).map((candidate) => structuredClone(candidate))); }
  optimize(context: CoreDecisionContext, candidates = this.generateCandidates(context)) { const goal = this.analyzeGoal(context.prompt); const graph = this.solveConstraints(context.constraints ?? []);
    const persona = this.personas.select(goal.primaryGoal.category, context.persona); return this.optimizer.optimize(candidates, graph, persona.weights); }
  rank(context: CoreDecisionContext, candidates = this.generateCandidates(context)) { const optimized = this.optimize(context, candidates); return this.tournament.run(optimized.feasibleCandidates, optimized.scores); }
  estimateConfidence(evidence: ConfidenceEvidence) { return this.confidence.estimate(evidence); }
  estimateRisk(candidate: Parameters<RiskAnalyzer["analyze"]>[0], features: readonly string[], budget?: number): RiskScore { return this.risk.analyze(candidate, features, budget); }
  evaluate(...args: Parameters<DecisionEvaluator["evaluate"]>) { return this.evaluator.evaluate(...args); }
  replay(id: string, scope: Parameters<DecisionMemory["replay"]>[1]) { return this.replays.replay(id, scope); }
  remember(episode: DecisionEpisode) { return this.memory.remember(episode); }
  adaptWeights(state: AdaptiveWeights, reaction: "ACCEPTED" | "REJECTED", components: Parameters<OnlineWeightAdapter["adapt"]>[2]) { return this.learning.adapt(state, reaction, components); }
  debug(context: CoreDecisionContext, evidence: ConfidenceEvidence, learningState: AdaptiveWeights, accepted = 0, rejected = 0): CoreDebugSnapshot {
    const goal = this.analyzeGoal(context.prompt); const constraints = this.solveConstraints(context.constraints ?? []); const extractedFeatures = immutable([...this.dependencies.extractFeatures(context.prompt)]);
    const candidates = this.generateCandidates(context, goal); const persona = this.personas.select(goal.primaryGoal.category, context.persona);
    const optimization = this.optimizer.optimize(candidates, constraints, persona.weights); const tournament = this.tournament.run(optimization.feasibleCandidates, optimization.scores);
    const selectedDecision = tournament.winner; const confidence = this.confidence.estimate(evidence); const risk = this.risk.analyze(selectedDecision, extractedFeatures,
      context.constraints?.find(({ kind }) => kind === "BUDGET")?.value as number | undefined);
    const gap = optimization.scores.length > 1 ? Math.abs(optimization.scores[0].utility - optimization.scores[1].utility) : 1;
    const uncertainty = this.uncertainty.resolve(confidence, risk, gap); const metaDecision = this.meta.decide({ uncertainty, risk,
      estimatedCost: selectedDecision.estimatedCost, budget: context.constraints?.find(({ kind }) => kind === "BUDGET")?.value as number | undefined,
      localQualitySufficient: selectedDecision.mode === "LOCAL" && selectedDecision.expectedQuality >= goal.primaryGoal.qualityTarget });
    const dominates = (left: typeof selectedDecision, right: typeof selectedDecision) => left.expectedQuality >= right.expectedQuality
      && left.estimatedCost <= right.estimatedCost && left.estimatedLatencyMs <= right.estimatedLatencyMs && left.risk <= right.risk
      && left.successProbability >= right.successProbability && (left.expectedQuality > right.expectedQuality || left.estimatedCost < right.estimatedCost
        || left.estimatedLatencyMs < right.estimatedLatencyMs || left.risk < right.risk || left.successProbability > right.successProbability);
    const paretoFrontier = optimization.feasibleCandidates.filter((candidate, index, all) => !all.some((other, otherIndex) => index !== otherIndex && dominates(other, candidate)));
    const snapshot = immutable({ prompt: context.prompt, goal, constraints, extractedFeatures, candidates, paretoFrontier,
      utilityScores: optimization.scores, tournament, selectedDecision, confidence, risk, expectedCost: selectedDecision.estimatedCost,
      expectedQuality: selectedDecision.expectedQuality, expectedSatisfaction: Math.round((selectedDecision.expectedQuality * .6 + selectedDecision.preferenceMatch * .4) * 100),
      metaDecision, learningStatistics: this.learning.statistics(learningState, accepted, rejected) });
    return snapshot;
  }
  explain(snapshot: CoreDebugSnapshot) { return this.explanations.build(snapshot); }
}
