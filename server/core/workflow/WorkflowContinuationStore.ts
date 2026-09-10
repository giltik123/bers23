import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';

export type WorkflowContinuationState =
  | 'READY'
  | 'WAITING_FOR_LOCAL_RESULT'
  | 'RUNNING_INTERNAL'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'UNKNOWN';

export type WorkflowPlanParameterValue = string | number | boolean;
export type WorkflowPlanParameters = Readonly<Record<string, WorkflowPlanParameterValue>>;

export type WorkflowPlanBinding = Readonly<{
  planId: string;
  planRevision: string;
  planDigest: string;
  /** Immutable normalized server-owned plan data. Empty legacy plans omit it. */
  parameters?: WorkflowPlanParameters;
}>;

/** Immutable canonical inputs from which the durable workflow was authorized. */
export type WorkflowInputArtifactBinding = Readonly<{
  artifactId: string;
  kind: string;
  role: string;
  sha256: string;
  parentArtifactIds: readonly string[];
}>;

/**
 * Durable continuation-local binding. `stepId` is the logical workflow step.
 * For legacy workflows it is also the local ticket operation step. Generalized
 * AEE workflows may bind an independent graph node through `continuationStepId`
 * on wait/retry while the authoritative ticket operation step remains in the
 * local-execution ledger.
 */
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
  inputArtifacts: readonly WorkflowInputArtifactBinding[];
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
  inputArtifacts: readonly WorkflowInputArtifactBinding[];
}>;

export type WaitForLocalResultInput = Readonly<{
  executionId: string;
  scope: Scope;
  expectedRevision: number;
  /** Logical continuation step. Omit for legacy stepId === ticket.stepId behavior. */
  continuationStepId?: string;
  /** At the mutation boundary ticket.stepId is the authoritative local operation step. */
  ticket: WorkflowLocalTicketBinding;
}>;

/**
 * Explicit replacement of one failed/expired outstanding local attempt while
 * preserving the workflow execution identity, immutable plan and logical step.
 */
export type RetryLocalResultInput = Readonly<{
  executionId: string;
  scope: Scope;
  expectedRevision: number;
  previousTicketId: string;
  /** Logical continuation step. Omit for legacy stepId === ticket.stepId behavior. */
  continuationStepId?: string;
  /** At the mutation boundary ticket.stepId is the replacement local operation step. */
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
  retryLocalResult(input: RetryLocalResultInput): Promise<WorkflowContinuationSnapshot>;
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
  const parameters = normalizeWorkflowPlanParameters(input.plan?.parameters);
  const plan = Object.freeze({
    planId: requireToken(input.plan?.planId, 'planId'),
    planRevision: requireToken(input.plan?.planRevision, 'planRevision'),
    planDigest: requireSha256(input.plan?.planDigest, 'planDigest'),
    ...(parameters === undefined ? {} : { parameters }),
  });
  const inputArtifacts = normalizeInputArtifactBindings(input.inputArtifacts);
  return Object.freeze({ executionId, clientRequestId, scope, plan, inputArtifacts });
}

export function normalizeWorkflowPlanParameters(value: unknown): WorkflowPlanParameters | undefined {
  if (value === undefined || value === null) return undefined;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('plan.parameters must be an object');
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) return undefined;
  if (entries.length > 16) throw new Error('plan.parameters exceeds the 16-field workflow limit');
  const normalized = entries.map(([rawKey, rawValue]) => {
    const key = rawKey.normalize('NFKC').trim();
    if (key !== rawKey || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(key)) throw new Error(`plan.parameters key is invalid: ${rawKey}`);
    let parameter: WorkflowPlanParameterValue;
    if (typeof rawValue === 'string') {
      parameter = rawValue.normalize('NFKC').trim();
      if (!parameter || Array.from(parameter).length > 256 || /[\u0000-\u001f\u007f]/u.test(parameter)) throw new Error(`plan.parameters.${key} is outside the accepted string contract`);
    } else if (typeof rawValue === 'number') {
      if (!Number.isFinite(rawValue) || !Number.isSafeInteger(rawValue)) throw new Error(`plan.parameters.${key} must be a safe integer`);
      parameter = rawValue;
    } else if (typeof rawValue === 'boolean') {
      parameter = rawValue;
    } else {
      throw new Error(`plan.parameters.${key} must be a string, safe integer or boolean`);
    }
    return [key, parameter] as const;
  }).sort(([left], [right]) => left.localeCompare(right));
  if (new Set(normalized.map(([key]) => key)).size !== normalized.length) throw new Error('plan.parameters keys must be unique after normalization');
  const result = Object.freeze(Object.fromEntries(normalized)) as WorkflowPlanParameters;
  if (Buffer.byteLength(JSON.stringify(result), 'utf8') > 4096) throw new Error('plan.parameters exceeds the 4096-byte workflow limit');
  return result;
}

export function normalizeInputArtifactBindings(values: readonly WorkflowInputArtifactBinding[]): readonly WorkflowInputArtifactBinding[] {
  if (!Array.isArray(values) || values.length < 1) throw new Error('At least one canonical workflow input Artifact binding is required');
  const normalized = values.map((value, index) => {
    if (!value || typeof value !== 'object') throw new Error(`inputArtifacts[${index}] is invalid`);
    const parentArtifactIds = normalizeOptionalArtifactIds(value.parentArtifactIds, `inputArtifacts[${index}].parentArtifactIds`);
    return Object.freeze({
      artifactId: requireToken(value.artifactId, `inputArtifacts[${index}].artifactId`),
      kind: requireToken(value.kind, `inputArtifacts[${index}].kind`),
      role: requireToken(value.role, `inputArtifacts[${index}].role`),
      sha256: requireSha256(value.sha256, `inputArtifacts[${index}].sha256`),
      parentArtifactIds,
    });
  }).sort((a, b) => a.artifactId.localeCompare(b.artifactId));
  if (new Set(normalized.map(value => value.artifactId)).size !== normalized.length) throw new Error('Canonical workflow input Artifact identities must be unique');
  return Object.freeze(normalized);
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

export function normalizeContinuationStepId(value: unknown, fallbackTicketStepId: string): string {
  return value === undefined ? requireToken(fallbackTicketStepId, 'ticket.stepId') : requireToken(value, 'continuationStepId');
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
  return a.planId === b.planId && a.planRevision === b.planRevision && a.planDigest === b.planDigest
    && canonicalPlanParameters(a.parameters) === canonicalPlanParameters(b.parameters);
}

export function sameInputArtifactBindings(a: readonly WorkflowInputArtifactBinding[], b: readonly WorkflowInputArtifactBinding[]): boolean {
  return a.length === b.length && a.every((value, index) => {
    const other = b[index];
    return Boolean(other)
      && value.artifactId === other.artifactId
      && value.kind === other.kind
      && value.role === other.role
      && value.sha256 === other.sha256
      && sameStringSetInOrder(value.parentArtifactIds, other.parentArtifactIds);
  });
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

function canonicalPlanParameters(value: WorkflowPlanParameters | undefined): string {
  return JSON.stringify(normalizeWorkflowPlanParameters(value) ?? {});
}

function normalizeOptionalArtifactIds(values: readonly string[] | undefined, field: string): readonly string[] {
  if (values === undefined) return Object.freeze([]);
  if (!Array.isArray(values)) throw new Error(`${field} must be an array`);
  const normalized = values.map((value, index) => requireToken(value, `${field}[${index}]`));
  if (new Set(normalized).size !== normalized.length) throw new Error(`${field} entries must be unique`);
  return Object.freeze(normalized.sort((left, right) => left.localeCompare(right)));
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
