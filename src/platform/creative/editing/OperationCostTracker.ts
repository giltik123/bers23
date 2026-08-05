import type { CreativeOperation } from './CreativeOperation';

export interface OperationCostSummary {
  readonly localEdits: number;
  readonly aiEdits: number;
  readonly creditsUsed: number;
}

export class OperationCostTracker {
  summarize(operations: readonly CreativeOperation[]): OperationCostSummary {
    return Object.freeze({
      localEdits: operations.filter((operation) => operation.source === 'LOCAL' && operation.status === 'APPLIED').length,
      aiEdits: operations.filter((operation) => operation.source === 'AI' && operation.status === 'APPLIED').length,
      creditsUsed: operations.filter((operation) => operation.status === 'APPLIED').reduce((total, operation) => total + operation.cost, 0),
    });
  }
}
