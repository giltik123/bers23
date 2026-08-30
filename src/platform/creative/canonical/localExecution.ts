import type { ExecutionProvider, RuntimeKind } from '../local-ai/types';
import type { Scope } from '../workflow-engine/types';
import type { CreativeArtifactRole } from './contracts';

export const LOCAL_EXECUTION_TICKET_VERSION = '1' as const;
export const LOCAL_EXECUTION_TICKET_V2_VERSION = '2' as const;
export const LOCAL_EXECUTION_TICKET_ISSUER = 'CORE' as const;
export const LOCAL_EXECUTION_POLICIES = ['LOCAL_SELECTED', 'LOCAL_ONLY'] as const;
export type LocalExecutionPolicy = typeof LOCAL_EXECUTION_POLICIES[number];
export type LocalExecutionModelBinding = Readonly<{ modelId: string; version: string }>;
export type LocalExecutionModelExecutorBinding = Readonly<{ kind: 'MODEL'; modelId: string; version: string }>;
export type LocalExecutionToolExecutorBinding = Readonly<{ kind: 'DETERMINISTIC_TOOL'; toolId: string; version: string }>;
export type LocalExecutionExecutorBinding = LocalExecutionModelExecutorBinding | LocalExecutionToolExecutorBinding;
export type LocalExecutionParameters = Readonly<Record<string, unknown>>;
export type LocalExecutionRuntime = RuntimeKind | 'BROWSER_JS';

/** Canonical Project Artifact input. This v1/v2 surface remains Project-only. */
export type LocalExecutionInputBinding = Readonly<{
  artifactId: string;
  kind: string;
  role?: CreativeArtifactRole;
  sha256?: string;
}>;

/** Server-owned managed Garment image input. Never aliases a Project Artifact ID. */
export type LocalExecutionManagedGarmentViewInputBinding = Readonly<{
  authority: 'MANAGED_GARMENT';
  kind: 'GARMENT_VIEW';
  garmentId: string;
  viewId: string;
  contentSha256: string;
  contentType: 'image/png';
  encoding: 'PNG_RGBA8_LOSSLESS';
  width: number;
  height: number;
}>;

export type LocalExecutionManagedGarmentParametricRepresentationInputBinding = Readonly<{
  authority: 'MANAGED_GARMENT';
  kind: 'GARMENT_REPRESENTATION';
  garmentId: string;
  representationId: string;
  tier: 'PARAMETRIC';
  format: 'BERS_PARAMETRIC_V1';
  contentType: 'application/vnd.bers.garment-parametric+json';
  contentSha256: string;
  basisViewId: string;
  generatorId: string;
  generatorVersion: string;
  validatorId: string;
  validatorVersion: string;
}>;

export type LocalExecutionManagedGarmentFull3dRepresentationInputBinding = Readonly<{
  authority: 'MANAGED_GARMENT';
  kind: 'GARMENT_REPRESENTATION';
  garmentId: string;
  representationId: string;
  tier: 'FULL_3D';
  format: 'GLB_2_0';
  contentType: 'model/gltf-binary';
  contentSha256: string;
  basisViewId: string;
  generatorId: string;
  generatorVersion: string;
  validatorId: string;
  validatorVersion: string;
}>;

export type LocalExecutionManagedGarmentRepresentationInputBinding =
  | LocalExecutionManagedGarmentParametricRepresentationInputBinding
  | LocalExecutionManagedGarmentFull3dRepresentationInputBinding;

export type LocalExecutionManagedGarmentInputBinding =
  | LocalExecutionManagedGarmentViewInputBinding
  | LocalExecutionManagedGarmentRepresentationInputBinding;

export type LocalExecutionExpectedOutput = Readonly<{
  kind: string;
  role?: CreativeArtifactRole;
  count: number;
  mimeTypes?: readonly string[];
  width?: number;
  height?: number;
}>;

type LocalExecutionTicketIssueBase = Readonly<{
  requestId: string;
  workflowId: string;
  stepId: string;
  operation: Readonly<{ id: string; version: string; type: string; capability: string; parameters?: LocalExecutionParameters }>;
  scope: Scope;
  inputs: readonly LocalExecutionInputBinding[];
  expectedOutputs: readonly LocalExecutionExpectedOutput[];
  policy: LocalExecutionPolicy;
  idempotencyKey: string;
}>;

/** Existing model-only v1 issuance contract. */
export type LocalExecutionTicketIssueRequest = LocalExecutionTicketIssueBase;

/**
 * Explicit v2 issuance contract for model OR deterministic-tool executors.
 * `managedInputs` is a separate authority namespace; `inputs` remains Project Artifact-only.
 */
export type LocalExecutionTicketIssueRequestV2 = LocalExecutionTicketIssueBase & Readonly<{
  ticketVersion: typeof LOCAL_EXECUTION_TICKET_V2_VERSION;
  managedInputs?: readonly LocalExecutionManagedGarmentInputBinding[];
}>;

export interface LocalExecutionTicketIssuerPort {
  issue(input: LocalExecutionTicketIssueRequest): LocalExecutionTicket | Promise<LocalExecutionTicket>;
}

export interface LocalExecutionTicketV2IssuerPort {
  issue(input: LocalExecutionTicketIssueRequestV2): LocalExecutionTicketV2 | Promise<LocalExecutionTicketV2>;
}

/**
 * Server-owned authorization envelope for one narrow on-device model operation.
 * Retained as v1 for durable compatibility with already-issued model tickets.
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
    parameters?: LocalExecutionParameters;
  }>;
  scope: Scope;
  inputs: readonly LocalExecutionInputBinding[];
  expectedOutputs: readonly LocalExecutionExpectedOutput[];
  allowedModels: readonly LocalExecutionModelBinding[];
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

/** V2 keeps Project inputs intact and adds an optional, explicitly separate managed authority namespace. */
export type LocalExecutionTicketV2 = Readonly<{
  ticketId: string;
  version: typeof LOCAL_EXECUTION_TICKET_V2_VERSION;
  issuer: typeof LOCAL_EXECUTION_TICKET_ISSUER;
  requestId: string;
  workflowId: string;
  stepId: string;
  operation: Readonly<{
    id: string;
    version: string;
    type: string;
    capability: string;
    parameters?: LocalExecutionParameters;
  }>;
  scope: Scope;
  inputs: readonly LocalExecutionInputBinding[];
  managedInputs?: readonly LocalExecutionManagedGarmentInputBinding[];
  expectedOutputs: readonly LocalExecutionExpectedOutput[];
  allowedExecutors: readonly LocalExecutionExecutorBinding[];
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

export type AnyLocalExecutionTicket = LocalExecutionTicket | LocalExecutionTicketV2;

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

/** Existing v1 model-backed result contract. */
export type LocalExecutionResult = Readonly<{
  ticketId: string;
  ticketVersion: typeof LOCAL_EXECUTION_TICKET_VERSION;
  requestId: string;
  workflowId: string;
  stepId: string;
  nonce: string;
  model: LocalExecutionModelBinding;
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

/** V2 result reports exactly one executor instead of fabricating a model for deterministic tools. */
export type LocalExecutionResultV2 = Readonly<{
  ticketId: string;
  ticketVersion: typeof LOCAL_EXECUTION_TICKET_V2_VERSION;
  requestId: string;
  workflowId: string;
  stepId: string;
  nonce: string;
  executor: LocalExecutionExecutorBinding;
  runtime: LocalExecutionRuntime;
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

export type AnyLocalExecutionResult = LocalExecutionResult | LocalExecutionResultV2;

export type LocalExecutionAdmissionReason =
  | 'ADMITTED'
  | 'UNKNOWN_TICKET'
  | 'EXPIRED_TICKET'
  | 'REPLAYED_TICKET'
  | 'CONFLICTING_REPLAY'
  | 'IN_PROGRESS'
  | 'SCOPE_MISMATCH'
  | 'IDENTITY_MISMATCH'
  | 'MODEL_MISMATCH'
  | 'EXECUTOR_MISMATCH'
  | 'FORBIDDEN_CLIENT_AUTHORITY'
  | 'MALFORMED_RESULT'
  | 'OUTPUT_CONTRACT_MISMATCH';

export type LocalExecutionAdmissionDecision =
  | Readonly<{ allowed: true; reasonCode: 'ADMITTED'; ticket: LocalExecutionTicket; result: LocalExecutionResult }>
  | Readonly<{ allowed: false; reasonCode: Exclude<LocalExecutionAdmissionReason, 'ADMITTED'> }>;

export type LocalExecutionAdmissionDecisionV2 =
  | Readonly<{ allowed: true; reasonCode: 'ADMITTED'; ticket: LocalExecutionTicketV2; result: LocalExecutionResultV2 }>
  | Readonly<{ allowed: false; reasonCode: Exclude<LocalExecutionAdmissionReason, 'ADMITTED'> }>;

export type AnyLocalExecutionAdmissionDecision = LocalExecutionAdmissionDecision | LocalExecutionAdmissionDecisionV2;
