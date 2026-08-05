export interface CommandBudgetContext { readonly availableCredits?: number; readonly estimatedCredits?: number; }
export interface CommandInputContext { readonly imageUrl?: string; readonly garmentImageUrl?: string; readonly projectId?: string; readonly tenantId?: string; readonly userId?: string; }
export interface CommandPolicyContext { readonly allowedCapabilities?: readonly string[]; readonly confirmation?: boolean; readonly plan?: string; }

export interface CommandContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly input?: CommandInputContext;
  readonly budget?: CommandBudgetContext;
  readonly policy?: CommandPolicyContext;
  readonly preferences?: Record<string, unknown>;
  readonly metadata?: Record<string, unknown>;
}
