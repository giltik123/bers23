import type { CreativeExecutionPlatformDependencies, CreativeOperation, CreativeRequest, ExecutionTarget } from './contracts';

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

/** Runtime composition contract: provider choice is mandatory and downstream of advisory planning. */
export type CreativeExecutionPlatformRuntimeDependencies = CreativeExecutionPlatformDependencies & Readonly<{
  providerSelector: ProviderSelectorPort;
}>;
