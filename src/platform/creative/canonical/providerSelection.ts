import type { CreativeExecutionPlatformDependencies, CreativeOperation, CreativeRequest, ExecutionTarget } from './contracts';
import type { LocalExecutionTicketIssuerPort } from './localExecution';

export type ProviderSelectionReasonCode =
  | 'PROVIDER_SELECTED'
  | 'TARGET_BLOCKED'
  | 'UNSUPPORTED_OPERATION'
  | 'UNSUPPORTED_TARGET'
  | 'NO_PROVIDER_AVAILABLE';

export type ProviderSelectionDecision =
  | Readonly<{ allowed: true; reasonCode: 'PROVIDER_SELECTED'; providerId: string; selectionId: string }>
  | Readonly<{ allowed: false; reasonCode: Exclude<ProviderSelectionReasonCode, 'PROVIDER_SELECTED'> }>;

export interface ProviderSelectorPort {
  select(input: Readonly<{ request: CreativeRequest; operation: CreativeOperation; target: ExecutionTarget }>): ProviderSelectionDecision;
}

/** Runtime composition contract: provider choice is mandatory only for PROVIDER routes. */
export type CreativeExecutionPlatformRuntimeDependencies = CreativeExecutionPlatformDependencies & Readonly<{
  providerSelector: ProviderSelectorPort;
  localExecution?: LocalExecutionTicketIssuerPort;
}>;
