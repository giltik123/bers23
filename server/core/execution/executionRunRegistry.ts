export const EXECUTION_RUN_CAPABILITIES = Object.freeze(['LOCAL_EXECUTION','CREATIVE_EXECUTION'] as const);
export const EXECUTION_RUN_AUTHORITY_KINDS = Object.freeze(['LOCAL_EXECUTION_TICKET','CREATIVE_EXECUTION'] as const);
export const EXECUTION_RUN_STATUSES = Object.freeze(['QUEUED','RUNNING','SUCCEEDED','FAILED','CANCELLED'] as const);

export type ExecutionRunCapability = (typeof EXECUTION_RUN_CAPABILITIES)[number];
export type ExecutionRunAuthorityKind = (typeof EXECUTION_RUN_AUTHORITY_KINDS)[number];
export type ExecutionRunStatus = (typeof EXECUTION_RUN_STATUSES)[number];

export type ExecutionRunScope = Readonly<{
  tenantId: string;
  userId: string;
  projectId: string;
}>;

export type ExecutionRun = Readonly<{
  runId: string;
  scope: ExecutionRunScope;
  capability: ExecutionRunCapability;
  idempotencyKey: string;
  authorityKind: ExecutionRunAuthorityKind;
  authorityRef: string;
  parentRunId?: string;
  status: ExecutionRunStatus;
  revision: number;
  statusReasonCode?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}>;

export type IssueExecutionRunInput = Readonly<{
  scope: ExecutionRunScope;
  capability: ExecutionRunCapability;
  idempotencyKey: string;
  authorityKind: ExecutionRunAuthorityKind;
  authorityRef: string;
  parentRunId?: string;
}>;

/**
 * `created` is an execution-safety fact, not convenience metadata.
 * Callers must not redispatch a capability merely because an idempotent replay
 * returns a QUEUED run after process restart. Only the transaction that inserted
 * the durable binding receives `created=true`.
 */
export type IssueExecutionRunResult = Readonly<{
  run: ExecutionRun;
  created: boolean;
}>;

export interface ExecutionRunRegistry {
  issue(input: IssueExecutionRunInput): Promise<IssueExecutionRunResult>;
  get(scope: ExecutionRunScope, runId: string): Promise<ExecutionRun | undefined>;
  list(scope: ExecutionRunScope, limit?: number): Promise<readonly ExecutionRun[]>;
  start(scope: ExecutionRunScope, runId: string): Promise<ExecutionRun>;
  succeed(scope: ExecutionRunScope, runId: string): Promise<ExecutionRun>;
  fail(scope: ExecutionRunScope, runId: string, reasonCode: string): Promise<ExecutionRun>;
  cancel(scope: ExecutionRunScope, runId: string, reasonCode: string): Promise<ExecutionRun>;
}
