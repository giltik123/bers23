import { immutable, type InteractionDebugTree, type InteractionRequest, type InteractionResponse } from './InteractionModel';

export class InteractionDebugger {
  explain(request: InteractionRequest, response: InteractionResponse): InteractionDebugTree {
    return immutable({
      userRequest: request,
      detectedIntent: response.detectedIntent,
      selectedWorkflow: response.selectedWorkflow,
      requiredDecisions: [...response.requiredDecisions],
      executionStatus: response.executionStatus,
      result: response.result,
    });
  }
}
