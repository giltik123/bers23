import { immutable } from "./immutable";
import type { DecisionIntelligenceDependencies, DecisionLearningSignal as Signal, LearningSignalType } from "./types";

export interface LearningSignalInput { readonly decisionId: string; readonly userId: string; readonly tenantId: string; readonly projectId: string; readonly type: LearningSignalType }

export class DecisionLearningSignalCollector {
  private signals: readonly Signal[] = immutable([]);
  constructor(private readonly dependencies: DecisionIntelligenceDependencies) {}

  record(input: LearningSignalInput): Signal {
    const signal = immutable({ ...input, id: this.dependencies.createId(), createdAt: this.dependencies.now() });
    this.signals = immutable([...this.signals, signal]);
    return signal;
  }

  list(decisionId: string, userId: string, tenantId: string, projectId: string): readonly Signal[] {
    return immutable(this.signals.filter((signal) => signal.decisionId === decisionId && signal.userId === userId
      && signal.tenantId === tenantId && signal.projectId === projectId).map((signal) => ({ ...signal })));
  }
}
