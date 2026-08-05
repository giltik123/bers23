export interface GatewayBudgetRequest { readonly maxCredits?: number; readonly availableCredits?: number; readonly maxDurationMs?: number; }
export interface GatewayPreferences { readonly confirmation?: boolean; readonly quality?: 'draft' | 'balanced' | 'high'; readonly locale?: string; readonly allowedCapabilities?: readonly string[]; readonly allowedWorkflows?: readonly string[]; }
export interface GatewayImageContext { readonly imageUrl?: string; readonly garmentImageUrl?: string; readonly maskUrl?: string; readonly objects?: readonly unknown[]; }

export interface GatewayRequest {
  readonly requestId?: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly prompt: string;
  readonly imageContext?: GatewayImageContext;
  readonly budget?: GatewayBudgetRequest;
  readonly preferences?: GatewayPreferences;
  readonly metadata?: Record<string, unknown>;
}

export interface ApplicationContext {
  readonly request: GatewayRequest;
  readonly memory: Record<string, unknown>;
  readonly intelligence: Record<string, unknown>;
  readonly preferences: GatewayPreferences;
  readonly project: Record<string, unknown>;
  readonly budget: GatewayBudgetRequest;
  readonly executionHistory: readonly unknown[];
}

export interface GatewayPolicyDecision { readonly allowed: boolean; readonly reason?: string; readonly confirmationRequired?: boolean; }
