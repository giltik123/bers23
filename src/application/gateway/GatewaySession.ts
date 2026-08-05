import type { ApplicationContext, GatewayRequest } from './GatewayRequest';
import type { GatewayResponse } from './GatewayResponse';

export type GatewaySessionState = 'CREATED' | 'AUTHORIZING' | 'CONTEXT_BUILDING' | 'AGENT_PROCESSING' | 'WORKFLOW_EXECUTION' | 'FINALIZING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';

export interface GatewaySessionSnapshot {
  readonly requestId: string;
  readonly state: GatewaySessionState;
  readonly request: GatewayRequest;
  readonly context?: ApplicationContext;
  readonly agentDecision?: unknown;
  readonly workflow?: unknown;
  readonly executionGraph?: unknown;
  readonly providers: readonly string[];
  readonly cost: { readonly credits: number; readonly providerCostUsd?: number };
  readonly timeline: readonly { readonly state: GatewaySessionState; readonly at: number; readonly message?: string }[];
  readonly errors: readonly string[];
  readonly response?: GatewayResponse;
}

export class GatewaySession {
  readonly requestId: string;
  readonly request: GatewayRequest;
  readonly abortController = new AbortController();
  private stateValue: GatewaySessionState = 'CREATED';
  private contextValue?: ApplicationContext;
  private agentDecisionValue?: unknown;
  private workflowValue?: unknown;
  private executionGraphValue?: unknown;
  private providersValue: string[] = [];
  private costValue = { credits: 0, providerCostUsd: 0 };
  private timelineValue: Array<{ state: GatewaySessionState; at: number; message?: string }> = [{ state: 'CREATED', at: Date.now() }];
  private errorsValue: string[] = [];
  private responseValue?: GatewayResponse;

  constructor(requestId: string, request: GatewayRequest) { this.requestId = requestId; this.request = request; }
  get state() { return this.stateValue; }
  transition(state: GatewaySessionState, message?: string): void { this.stateValue = state; this.timelineValue.push({ state, at: Date.now(), message }); }
  setContext(context: ApplicationContext): void { this.contextValue = context; }
  setAgentDecision(decision: unknown): void { this.agentDecisionValue = decision; }
  setWorkflow(workflow: unknown): void { this.workflowValue = workflow; }
  setExecutionGraph(graph: unknown): void { this.executionGraphValue = graph; }
  setProviders(providers: readonly string[]): void { this.providersValue = [...providers]; }
  setCost(cost: { credits?: number; providerCostUsd?: number }): void { this.costValue = { credits: cost.credits ?? 0, providerCostUsd: cost.providerCostUsd ?? 0 }; }
  addError(error: string): void { this.errorsValue.push(error); }
  setResponse(response: GatewayResponse): void { this.responseValue = response; }
  pause(): void { if (!['COMPLETED', 'FAILED', 'CANCELLED'].includes(this.stateValue)) this.transition('PAUSED'); }
  resume(): void { if (this.stateValue === 'PAUSED') this.transition('WORKFLOW_EXECUTION'); }
  cancel(): void { this.abortController.abort(); this.transition('CANCELLED'); }
  inspect(): GatewaySessionSnapshot { return Object.freeze({ requestId: this.requestId, state: this.stateValue, request: this.request, context: this.contextValue, agentDecision: this.agentDecisionValue, workflow: this.workflowValue, executionGraph: this.executionGraphValue, providers: Object.freeze([...this.providersValue]), cost: Object.freeze({ ...this.costValue }), timeline: Object.freeze([...this.timelineValue]), errors: Object.freeze([...this.errorsValue]), response: this.responseValue }); }
}
