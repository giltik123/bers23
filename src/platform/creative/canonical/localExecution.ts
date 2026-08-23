import type { ExecutionProvider, RuntimeKind } from '../local-ai/types';
import type { Scope } from '../workflow-engine/types';
import type { CreativeArtifactRole } from './contracts';

export const LOCAL_EXECUTION_TICKET_VERSION = '1' as const;
export const LOCAL_EXECUTION_TICKET_ISSUER = 'CORE' as const;
export const LOCAL_EXECUTION_POLICIES = ['LOCAL_SELECTED', 'LOCAL_ONLY'] as const;
export type LocalExecutionPolicy = typeof LOCAL_EXECUTION_POLICIES[number];

export type LocalExecutionInputBinding = Readonly<{
  artifactId: string;
  kind: string;
  role?: CreativeArtifactRole;
  sha256?: string;
}>;

export type LocalExecutionExpectedOutput = Readonly<{
  kind: string;
  role?: CreativeArtifactRole;
  count: number;
  mimeTypes?: readonly string[];
}>;

export type LocalExecutionTicketIssueRequest = Readonly<{
  requestId: string;
  workflowId: string;
  stepId: string;
  operation: Readonly<{ id: string; version: string; type: string; capability: string }>;
  scope: Scope;
  inputs: readonly LocalExecutionInputBinding[];
  expectedOutputs: readonly LocalExecutionExpectedOutput[];
  policy: LocalExecutionPolicy;
  idempotencyKey: string;
}>;

export interface LocalExecutionTicketIssuerPort {
  issue(input: LocalExecutionTicketIssueRequest): LocalExecutionTicket;
}

/**
 * Server-owned authorization envelope for one narrow on-device operation.
 * The device may execute the computation, but it receives no Project, Artifact,
 * provider or Billing authority from this contract.
 */
export type LocalExecutionTicket = Readonly<{
  ticketId: string;
  version: typeof LOCAL_EXECUTION_TICKET_VERSION;
  issuer: typeof LOCAL_EXECUTION_TICKET_ISSUER;
  requestId: string;
  workflowId: string;
  stepId: string;
  operation: Readonly<{
    id: string;
    version: string;
    type: string;
    capability: string;
  }>;
  scope: Scope;
  inputs: readonly LocalExecutionInputBinding[];
  expectedOutputs: readonly LocalExecutionExpectedOutput[];
  policy: LocalExecutionPolicy;
  idempotencyKey: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
  cost: Readonly<{
    paidCloudCredits: 0;
    providerCalls: 0;
  }>;
}>;

/** Opaque upload handle plus integrity evidence. Never a canonical Artifact ID. */
export type LocalExecutionOutputEvidence = Readonly<{
  uploadId: string;
  kind: string;
  role?: CreativeArtifactRole;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
  width?: number;
  height?: number;
}>;

export type LocalExecutionResult = Readonly<{
  ticketId: string;
  ticketVersion: typeof LOCAL_EXECUTION_TICKET_VERSION;
  requestId: string;
  workflowId: string;
  stepId: string;
  nonce: string;
  model: Readonly<{ modelId: string; version: string }>;
  runtime: RuntimeKind;
  accelerator: ExecutionProvider | 'UNKNOWN';
  outputs: readonly LocalExecutionOutputEvidence[];
  metrics: Readonly<{
    latencyMs: number;
    memoryBytes?: number;
    vramBytes?: number;
    energyEstimate?: number;
  }>;
  benchmarkEvidence?: Readonly<Record<string, number | string | boolean>>;
}>;

export type LocalExecutionAdmissionReason =
  | 'ADMITTED'
  | 'UNKNOWN_TICKET'
  | 'EXPIRED_TICKET'
  | 'REPLAYED_TICKET'
  | 'SCOPE_MISMATCH'
  | 'IDENTITY_MISMATCH'
  | 'FORBIDDEN_CLIENT_AUTHORITY'
  | 'MALFORMED_RESULT'
  | 'OUTPUT_CONTRACT_MISMATCH';

export type LocalExecutionAdmissionDecision =
  | Readonly<{ allowed: true; reasonCode: 'ADMITTED'; ticket: LocalExecutionTicket; result: LocalExecutionResult }>
  | Readonly<{ allowed: false; reasonCode: Exclude<LocalExecutionAdmissionReason, 'ADMITTED'> }>;
