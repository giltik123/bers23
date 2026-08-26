import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';

export type WorkflowContinuationState =
  | 'READY'
  | 'WAITING_FOR_LOCAL_RESULT'
  | 'RUNNING_INTERNAL'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type WorkflowPlanBinding = Readonly<{
  planId: string;
  planRevision: string;
  planDigest: string;
}>;

export type WorkflowLocalTicketBinding = Readonly<{
  stepId: string;
  ticketId: string;
  ticketVersion: string;
  nonce: string;
  expiresAt: string;
}>;

export type WorkflowCompletedStepBinding = Readonly<{
  stepId: string;
  ticketId?: string;
  artifactIds: readonly string[];
}>;

export type WorkflowContinuationSnapshot = Readonly<{
  executionId: string;
  clientRequestId: string;
  scope: Scope;
  plan: WorkflowPlanBinding;
  state: WorkflowContinuationState;
  currentStepId?: string;
  outstandingLocal?: WorkflowLocalTicketBinding;
  completedSteps: readonly WorkflowCompletedStepBinding[];
  terminalArtifactId?: string;
  failureCode?: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
}>;

export type CreateWorkflowContinuationInput = Readonly<{
  executionId: string;
  clientRequestId: string;
  scope: Scope;
  plan: WorkflowPlanBinding;
}>;

export type WaitForLocalResultInput = Readonly<{
  executionId: string;
  scope: Scope;
  expectedRevision: number;
  ticket: WorkflowLocalTicketBinding;
}>;

export type CompleteLocalStepInput = Readonly<{
  executionId: string;
  scope: Scope;
  expectedRevision: number;
  stepId: string;
  ticketId: string;
  artifactIds: readonly string[];
}>;

export type RunInternalStepInput = Readonly<{
  executionId: string;
  scope: Scope;
  expectedRevision: number;
  stepId: string;
}>;

export type CompleteInternalStepInput = Readonly<{
  executionId: string;
  scope: Scope;
  expectedRevision: number;
  stepId: string;
  artifactIds: readonly string[];
}>;

export type TerminalWorkflowInput = Readonly<{
  executionId: string;
  scope: Scope;
  expectedRevision: number;
}>;

export interface WorkflowContinuationStore {
  create(input: CreateWorkflowContinuationInput): Promise<WorkflowContinuationSnapshot>;
  get(executionId: string, scope: Scope): Promise<WorkflowContinuationSnapshot | undefined>;
  getByClientRequestId(scope: Scope, clientRequestId: string): Promise<WorkflowContinuationSnapshot | undefined>;
  waitForLocalResult(input: WaitForLocalResultInput): Promise<WorkflowContinuationSnapshot>;
  completeLocalStep(input: CompleteLocalStepInput): Promise<WorkflowContinuationSnapshot>;
  runInternalStep(input: RunInternalStepInput): Promise<WorkflowContinuationSnapshot>;
  completeInternalStep(input: CompleteInternalStepInput): Promise<WorkflowContinuationSnapshot>;
  succeed(input: TerminalWorkflowInput & Readonly<{ terminalArtifactId: string }>): Promise<WorkflowContinuationSnapshot>;
  fail(input: TerminalWorkflowInput & Readonly<{ failureCode: string }>): Promise<WorkflowContinuationSnapshot>;
  cancel(input: TerminalWorkflowInput): Promise<WorkflowContinuationSnapshot>;
  markUnknown(input: TerminalWorkflowInput & Readonly<{ failureCode: string }>): Promise<WorkflowContinuationSnapshot>;
}

export function normalizeWorkflowContinuationCreate(input: CreateWorkflowContinuationInput): CreateWorkflowContinuationInput {
  const executionId = requireToken(input.executionId, 'executionId');
  const clientRequestId = requireToken(input.clientRequestId, 'clientRequestId');
  const scope = normalizeScope(input.scope);
  const plan = Object.freeze({
    planId: requireToken(input.plan?.planId, 'planId'),
    planRevision: requireToken(input.plan?.planRevision, 'planRevision'),
    planDigest: requireSha256(input.plan?.planDigest, 'planDigest'),
  });
  return Object.freeze({ executionId, clientRequestId, scope, plan });
}

export function normalizeTicketBinding(ticket: WorkflowLocalTicketBinding): WorkflowLocalTicketBinding {
  const expiresAt = requireTimestamp(ticket?.expiresAt, 'ticket.expiresAt');
  return Object.freeze({
    stepId: requireToken(ticket?.stepId, 'ticket.stepId'),
    ticketId: requireToken(ticket?.ticketId, 'ticket.ticketId'),
    ticketVersion: requireToken(ticket?.ticketVersion, 'ticket.ticketVersion'),
    nonce: requireToken(ticket?.nonce, 'ticket.nonce'),
    expiresAt,
  });
}

export function normalizeArtifactIds(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values) || values.length < 1) throw new Error('At least one canonical artifact identity is required');
  const normalized = values.map((value, index) => requireToken(value, `artifactIds[${index}]`));
  if (new Set(normalized).size !== normalized.length) throw new Error('Canonical artifact identities must be unique within a step binding');
  return Object.freeze(normalized);
}

export function normalizeScope(scope: Scope): Scope {
  return Object.freeze({
    tenantId: requireToken(scope?.tenantId, 'scope.tenantId'),
    userId: requireToken(scope?.userId, 'scope.userId'),
    projectId: requireToken(scope?.projectId, 'scope.projectId'),
  });
}

export function sameScope(a: Scope, b: Scope): boolean {
  return a.tenantId === b.tenantId && a.userId === b.userId && a.projectId === b.projectId;
}

export function samePlanBinding(a: WorkflowPlanBinding, b: WorkflowPlanBinding): boolean {
  return a.planId === b.planId && a.planRevision === b.planRevision && a.planDigest === b.planDigest;
}

export function sameStringSetInOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function assertExpectedRevision(actual: number, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0) throw new Error('expectedRevision must be a non-negative safe integer');
  if (actual !== expected) throw Object.assign(new Error(`Workflow continuation revision conflict: expected ${expected}, found ${actual}`), { code: 'WORKFLOW_CONTINUATION_REVISION_CONFLICT' });
}

export function isTerminalWorkflowState(state: WorkflowContinuationState): boolean {
  return state === 'SUCCESS' || state === 'FAILED' || state === 'CANCELLED' || state === 'UNKNOWN';
}

function requireToken(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function requireSha256(value: unknown, field: string): string {
  const normalized = requireToken(value, field).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw new Error(`${field} must be a SHA-256 digest`);
  return normalized;
}

function requireTimestamp(value: unknown, field: string): string {
  const normalized = requireToken(value, field);
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) throw new Error(`${field} must be an ISO timestamp`);
  return new Date(milliseconds).toISOString();
}
