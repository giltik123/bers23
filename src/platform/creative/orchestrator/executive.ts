import { immutable } from './immutable';
import { HeuristicBudgetOptimizationModel, HeuristicConfidenceFusionModel, HeuristicConflictResolutionModel, HeuristicGovernanceModel } from './models';
import type { BudgetOptimizationModel, ConfidenceFusionModel, ConflictResolutionModel, CreativeBudget, GovernanceModel, IntelligenceSignal, OrchestratorResult, Scope, TimelineEvent } from './types';

export class ExecutiveConflictResolver {
  constructor(private readonly model: ConflictResolutionModel = new HeuristicConflictResolutionModel()) {}
  resolve(signals: readonly IntelligenceSignal[]) { return this.model.resolve(signals); }
}

export class ConfidenceArbitration {
  constructor(private readonly model: ConfidenceFusionModel = new HeuristicConfidenceFusionModel()) {}
  arbitrate(signals: readonly IntelligenceSignal[], historicalConfidence = .5) { return this.model.fuse(signals, historicalConfidence); }
}

export class CreativeBudgetGovernor {
  constructor(private readonly model: BudgetOptimizationModel = new HeuristicBudgetOptimizationModel()) {}
  assess(budget: CreativeBudget, complexity: number) { return this.model.assess(budget, complexity); }
}

export class DecisionGovernance {
  constructor(private readonly model: GovernanceModel = new HeuristicGovernanceModel()) {}
  decide(signals: readonly IntelligenceSignal[], complexity: number) { return this.model.govern(signals, complexity); }
}

export class IntelligenceHealthMonitor {
  evaluate(results: readonly OrchestratorResult[]) {
    const confidence = results.length ? results.reduce((sum, item) => sum + item.confidence.global, 0) / results.length : .5;
    const consensus = results.length ? results.reduce((sum, item) => sum + (item.debate.at(-1)?.consensus ?? .5), 0) / results.length : .5;
    const efficiency = results.length ? results.reduce((sum, item) => sum + item.budget.efficiency, 0) / results.length : .5;
    return immutable({ decisionStability: confidence, studioConsistency: consensus, directorQuality: confidence, replayMatch: 1, confidenceDrift: 0, budgetEfficiency: efficiency, consensusQuality: consensus });
  }
}

export class OrchestratorReplay {
  replay(result: OrchestratorResult, scope: Scope): OrchestratorResult {
    if (result.tenantId !== scope.tenantId || result.projectId !== scope.projectId || result.userId !== scope.userId) throw new Error('Orchestrator scope violation');
    return immutable(structuredClone(result));
  }
}

export class UnifiedIntelligenceTimeline {
  build(id: string, at: number, events: readonly Omit<TimelineEvent, 'id' | 'at' | 'sequence'>[]): readonly TimelineEvent[] {
    return immutable(events.map((event, sequence) => ({ ...event, id: `${id}:event:${sequence}`, at, sequence })));
  }
}
