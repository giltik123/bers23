import { AdaptiveDebate, CognitiveLoadEstimator, ExecutivePlanner, ExpertReliabilityModel, ExpertSelector, ResourcePlanner } from './components';
import { ExecutiveMemory } from './ExecutiveMemory';
import { immutable } from './immutable';
import { HeuristicBudgetOptimizationModel, HeuristicConfidenceFusionModel, HeuristicConflictResolutionModel, HeuristicExecutivePolicyModel, HeuristicExecutionSchedulingModel, HeuristicExpertSelectionModel, HeuristicGovernanceModel, HeuristicOrchestratorLearningModel } from './models';
import type { BudgetOptimizationModel, ConfidenceFusionModel, ConflictResolutionModel, Dependencies, ExecutivePolicyModel, ExecutionSchedulingModel, ExpertSelectionModel, GovernanceModel, OrchestratorLearningModel, OrchestratorRequest, OrchestratorResult, TimelineEvent } from './types';

export interface OrchestratorModels { executive?: ExecutivePolicyModel; expertSelection?: ExpertSelectionModel; conflict?: ConflictResolutionModel; confidence?: ConfidenceFusionModel; budget?: BudgetOptimizationModel; scheduling?: ExecutionSchedulingModel; governance?: GovernanceModel; learning?: OrchestratorLearningModel }

export class CreativeOrchestrator {
  private readonly memory = new ExecutiveMemory();
  private readonly load = new CognitiveLoadEstimator();
  private readonly planner: ExecutivePlanner;
  private readonly selector: ExpertSelector;
  private readonly reliability = new ExpertReliabilityModel();
  private readonly debate = new AdaptiveDebate();
  private readonly conflict: ConflictResolutionModel;
  private readonly confidence: ConfidenceFusionModel;
  private readonly budget: BudgetOptimizationModel;
  private readonly governance: GovernanceModel;
  private readonly learning: OrchestratorLearningModel;

  constructor(private readonly dependencies: Dependencies, models: OrchestratorModels = {}) {
    this.planner = new ExecutivePlanner(new ResourcePlanner(models.executive ?? new HeuristicExecutivePolicyModel()), models.scheduling ?? new HeuristicExecutionSchedulingModel());
    this.selector = new ExpertSelector(models.expertSelection ?? new HeuristicExpertSelectionModel());
    this.conflict = models.conflict ?? new HeuristicConflictResolutionModel(); this.confidence = models.confidence ?? new HeuristicConfidenceFusionModel(); this.budget = models.budget ?? new HeuristicBudgetOptimizationModel(); this.governance = models.governance ?? new HeuristicGovernanceModel(); this.learning = models.learning ?? new HeuristicOrchestratorLearningModel();
  }

  orchestrate(input: OrchestratorRequest): OrchestratorResult {
    this.validate(input); const request = immutable(structuredClone(input)); const id = this.dependencies.id(); const at = this.dependencies.now();
    const complexity = this.load.estimate(request.prompt, request.goals); const plan = this.planner.create(id, request.mode ?? 'BALANCED', complexity, request.budget);
    const experts = this.selector.select(request.prompt, request.context?.domain, complexity); const weights = this.reliability.score(experts.experts, request.expertHistory ?? [], request.context?.domain);
    const signals = request.signals ?? []; const debate = this.debate.run(weights, this.signalConsensus(signals)); const conflict = this.conflict.resolve(signals);
    const confidence = this.confidence.fuse(signals, request.historicalConfidence ?? .5); const budget = this.budget.assess(request.budget, complexity); const governance = this.governance.govern(signals, complexity);
    const finalStrategy = conflict.strategy === 'AI' && !budget.aiWorthwhile ? 'LOCAL' : conflict.strategy;
    const labels = ['Prompt', 'Intent', 'Goals', 'Executive Planner', 'Expert Selection', 'Execution Graph', 'Director', 'Decision', 'Studio Debate', 'Conflict Resolver', 'Confidence Arbitration', 'Budget Governor', 'Final Strategy'];
    const timeline: readonly TimelineEvent[] = immutable(labels.map((type, sequence) => ({ id: `${id}:event:${sequence}`, at, sequence, type, detail: type === 'Final Strategy' ? finalStrategy : 'planned' })));
    const result: OrchestratorResult = immutable({ id, tenantId: request.tenantId, projectId: request.projectId, userId: request.userId, plan, experts, debate, conflict, confidence, budget, governance, finalStrategy, timeline, explanation: { steps: immutable([...labels, 'Expected Quality', 'Expected Cost', 'Expected Satisfaction', 'Global Confidence']), expectedQuality: Number((.5 + complexity / 250).toFixed(3)), expectedCost: finalStrategy === 'AI' ? request.budget.aiUnitCost ?? 1 : 0, expectedSatisfaction: request.goals?.satisfaction ?? confidence.global, globalConfidence: confidence.global } });
    this.memory.record({ id: this.dependencies.id(), tenantId: request.tenantId, projectId: request.projectId, userId: request.userId, strategyKey: this.learning.strategyKey(result), success: confidence.global >= .6, at });
    return result;
  }

  replay(result: OrchestratorResult, scope: { tenantId: string; projectId: string; userId: string }): OrchestratorResult { this.assertScope(result, scope); return immutable(structuredClone(result)); }
  history(scope: { tenantId: string; projectId: string; userId: string }) { return this.memory.history(scope); }
  health(scope: { tenantId: string; projectId: string; userId: string }) { const history = this.memory.history(scope); return immutable({ samples: history.length, strategySuccess: history.length ? history.filter((x) => x.success).length / history.length : .5, confidenceDrift: 0, budgetEfficiency: .5, status: history.some((x) => !x.success) ? 'WATCH' : 'HEALTHY' }); }
  private signalConsensus(signals: readonly { strategy: string }[]): number | undefined { if (!signals.length) return undefined; const count = Math.max(...[...new Set(signals.map((x) => x.strategy))].map((strategy) => signals.filter((x) => x.strategy === strategy).length)); return count / signals.length; }
  private validate(input: OrchestratorRequest): void { if (!input.tenantId || !input.projectId || !input.userId) throw new Error('tenantId, projectId and userId are required'); if (!input.prompt.trim()) throw new Error('prompt is required'); if (input.budget.total < 0 || input.budget.spent < 0) throw new Error('budget values cannot be negative'); }
  private assertScope(result: OrchestratorResult, scope: { tenantId: string; projectId: string; userId: string }): void { if (result.tenantId !== scope.tenantId || result.projectId !== scope.projectId || result.userId !== scope.userId) throw new Error('Orchestrator scope violation'); }
}
