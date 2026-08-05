export type GatewayResponseStatus = 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REJECTED';

export interface GatewayResponse {
  readonly requestId: string;
  readonly status: GatewayResponseStatus;
  readonly workflowId?: string;
  readonly executionId?: string;
  readonly result?: unknown;
  readonly cost: { readonly credits: number; readonly providerCostUsd?: number };
  readonly duration: number;
  readonly confidence: number;
  readonly memoryUpdates: readonly unknown[];
  readonly intelligenceSummary: Record<string, unknown>;
  readonly error?: string;
}
