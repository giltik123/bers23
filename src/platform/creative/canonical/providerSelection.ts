import type { CreativeExecutionPlatformDependencies, CreativeOperation, CreativeRequest, ExecutionTarget } from './contracts';
import type { LocalExecutionTicketIssuerPort, LocalExecutionTicketV2IssuerPort } from './localExecution';

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
  /** Stable v1 model-only issuer used by existing segmentation. */
  localExecution?: LocalExecutionTicketIssuerPort;
  /** Explicit v2 issuer used by generic model/tool executor tickets. */
  localExecutionV2?: LocalExecutionTicketV2IssuerPort;
}>;
