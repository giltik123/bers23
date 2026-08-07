import { clamp, immutable } from './immutable';
import { HeuristicExecutivePolicyModel, HeuristicExpertSelectionModel } from './models';
import type { CreativeBudget, DebateRound, ExecutivePlan, ExecutivePolicyModel, ExecutionSchedulingModel, ExpertHistory, ExpertKind, ExpertSelection, ExpertSelectionModel, IntelligenceKind, OperatingMode, ReliabilityScore } from './types';

export class CognitiveLoadEstimator {
  estimate(prompt: string, goals: { quality?: number; tags?: readonly string[] } = {}): number {
    const text = prompt.toLowerCase();
    if (/^\s*(brightness|яркость)\s*$/.test(text)) return 2;
    let score = Math.min(45, text.split(/\s+/).filter(Boolean).length * 3);
    if (/campaign|кампан|luxury|fashion|research|стратег|бренд/.test(text)) score += 42;
    if (/replace|генера|создай|simulate|вариант/.test(text)) score += 20;
    score += Math.round((goals.quality ?? 0) * 10) + Math.min(10, (goals.tags?.length ?? 0) * 2);
    return Math.min(100, Math.max(1, score));
  }
}

export class ResourcePlanner {
  constructor(private readonly policy: ExecutivePolicyModel = new HeuristicExecutivePolicyModel()) {}
  plan(mode: OperatingMode, complexity: number, budget: CreativeBudget): readonly IntelligenceKind[] { return this.policy.select({ mode, complexity, budget }); }
}

export class ExecutivePlanner {
  constructor(private readonly resources: ResourcePlanner, private readonly scheduler: ExecutionSchedulingModel) {}
  create(id: string, mode: OperatingMode, complexity: number, budget: CreativeBudget): ExecutivePlan {
    const enabled = this.resources.plan(mode, complexity, budget);
    return immutable({ mode, complexity, enabled, graph: this.scheduler.schedule(id, enabled, complexity) });
  }
}

export class ExpertSelector {
  constructor(private readonly model: ExpertSelectionModel = new HeuristicExpertSelectionModel()) {}
  select(prompt: string, domain: string | undefined, complexity: number): ExpertSelection { return this.model.select(prompt, domain, complexity); }
}

export class ExpertReliabilityModel {
  score(experts: readonly ExpertKind[], history: readonly ExpertHistory[], domain?: string): readonly ReliabilityScore[] {
    return immutable(experts.map((expert) => {
      const record = history.find((item) => item.expert === expert);
      const domainConfidence = clamp(record?.domains?.[domain ?? ''] ?? .5);
      if (!record) return { expert, score: .5, domainConfidence };
      const accuracy = (record.successes + 1) / (record.successes + record.failures + 2);
      return { expert, score: Number(clamp(accuracy * .5 + clamp(record.usefulness) * .3 + domainConfidence * .2).toFixed(4)), domainConfidence };
    }));
  }
}

export class AdaptiveDebate {
  run(weights: readonly ReliabilityScore[], initialConsensus?: number, maxRounds = 2): readonly DebateRound[] {
    const average = weights.length ? weights.reduce((sum, item) => sum + item.score, 0) / weights.length : .5;
    let consensus = clamp(initialConsensus ?? average);
    const rounds: DebateRound[] = [];
    for (let round = 1; round <= Math.max(1, maxRounds); round++) {
      const action = consensus >= .7 || round === maxRounds ? 'STOP' : 'CONTINUE';
      rounds.push(immutable({ round, consensus: Number(consensus.toFixed(3)), weights, action }));
      if (action === 'STOP') break;
      consensus = clamp(consensus + .15 * average);
    }
    return immutable(rounds);
  }
}

export class StrategyScheduler extends ExecutivePlanner {}
