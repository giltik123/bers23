import type { DecisionContext as DecisionContextShape } from './types';

export class DecisionContext {
  create(input: DecisionContextShape): DecisionContextShape {
    return Object.freeze({ ...input, availableOperations: Object.freeze([...input.availableOperations]), preferences: input.preferences ? Object.freeze({ styles: Object.freeze([...input.preferences.styles]), workflows: Object.freeze([...input.preferences.workflows]), confidence: input.preferences.confidence }) : undefined, budget: input.budget ? Object.freeze({ ...input.budget }) : undefined, quality: input.quality ? Object.freeze({ ...input.quality }) : undefined, previousDecisions: input.previousDecisions ? Object.freeze([...input.previousDecisions]) : undefined, metadata: input.metadata ? Object.freeze({ ...input.metadata }) : undefined });
  }

  canAccess(context: DecisionContextShape, request: { userId: string; tenantId: string; projectId: string }): boolean {
    return context.userId === request.userId && context.tenantId === request.tenantId && context.projectId === request.projectId;
  }
}
