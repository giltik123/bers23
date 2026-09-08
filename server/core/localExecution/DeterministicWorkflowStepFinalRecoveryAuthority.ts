import type { CreativeArtifactRole } from '../../../src/platform/creative/canonical/contracts.ts';
import {
  ORTHOGONAL_TRANSFORM_TOOL_DEFINITION,
  RESIZE_TOOL_DEFINITION,
  type DeterministicToolDefinition,
} from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import {
  normalizeOrthogonalTransformMode,
  orthogonalTransformOutputGeometry,
  type OrthogonalTransformMode,
} from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { normalizeResizeDimensions } from '../../../src/platform/creative/deterministic/Resize.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { PostgresImageArtifactStore, StoredFinalImage } from '../artifacts/postgresImageArtifactStore.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';

type RecoveryLedger = Pick<LocalExecutionLedgerV2, 'getV2' | 'getFinalization'>;
type FinalReader = Pick<PostgresImageArtifactStore, 'loadFinalByExecution'>;

type CanonicalSourceBinding = Readonly<{
  artifactId: string;
  role: Extract<CreativeArtifactRole, 'ORIGINAL' | 'COMPOSITE'>;
  sha256: string;
  storageId: string;
  width: number;
  height: number;
}>;

type DurableTicketBinding = Readonly<{
  ticketId: string;
  ticketVersion: '2';
  nonce: string;
  expiresAt: string;
}>;

type RecoveryCommon = Readonly<{
  projectId: string;
  workflowId: string;
  executionId: string;
  idempotencyKey: string;
  ticket: DurableTicketBinding;
  source: CanonicalSourceBinding;
}>;

export type DeterministicWorkflowStepRecoveryBinding =
  | (RecoveryCommon & Readonly<{ operation: 'ORTHOGONAL_TRANSFORM'; mode: OrthogonalTransformMode }>)
  | (RecoveryCommon & Readonly<{ operation: 'RESIZE'; width: number; height: number }>);

export type DeterministicWorkflowStepRecoveryResult =
  | Readonly<{ status: 'PENDING'; executionId: string }>
  | Readonly<{ status: 'FAILED'; executionId: string }>
  | Readonly<{ status: 'UNKNOWN'; executionId: string }>
  | Readonly<{ status: 'SUCCESS'; executionId: string; artifactId: string }>;

export type DeterministicWorkflowStepFinalRecoveryDependencies = Readonly<{
  admission: RecoveryLedger;
  images: FinalReader;
  issueFinalId: (storageId: string, scope: AuthenticatedScope & { projectId: string }) => string;
}>;

/**
 * Read-only terminal reconciliation for deterministic workflow steps.
 *
 * The caller is a server-owned durable workflow, not browser transport. The
 * binding must come from WorkflowContinuation + canonical Artifact authority.
 * This authority never issues a ticket, executes pixels, accepts an upload,
 * claims/commits a ticket, advances a workflow or mutates a Project.
 */
export class DeterministicWorkflowStepFinalRecoveryAuthority {
  private readonly dependencies: DeterministicWorkflowStepFinalRecoveryDependencies;

  constructor(dependencies: DeterministicWorkflowStepFinalRecoveryDependencies) {
    this.dependencies = dependencies;
  }

  async recover(input: DeterministicWorkflowStepRecoveryBinding, auth: AuthenticatedScope): Promise<DeterministicWorkflowStepRecoveryResult> {
    const binding = normalizeBinding(input);
    const scope = Object.freeze({ ...normalizeAuth(auth), projectId: binding.projectId });
    const ticket = await this.dependencies.admission.getV2(binding.ticket.ticketId);
    if (!ticket) throw recoveryError(409, 'deterministic_workflow_recovery_ticket_unavailable', 'Durable deterministic workflow ticket is unavailable');
    assertExactTicket(ticket, binding, scope);

    const finalization = await this.dependencies.admission.getFinalization(ticket.ticketId);
    if (!finalization) return Object.freeze({ status: 'PENDING', executionId: binding.executionId });
    if (finalization.status === 'FAILED') return Object.freeze({ status: 'FAILED', executionId: binding.executionId });
    if (finalization.status === 'UNKNOWN') return Object.freeze({ status: 'UNKNOWN', executionId: binding.executionId });

    const stored = await this.dependencies.images.loadFinalByExecution(binding.executionId, scope);
    if (!stored) throw recoveryError(409, 'deterministic_workflow_recovery_final_unavailable', 'Committed deterministic workflow FINAL is unavailable');
    assertExactStoredFinal(stored, binding, scope);
    const artifactId = this.dependencies.issueFinalId(stored.storageId, scope);
    return Object.freeze({ status: 'SUCCESS', executionId: binding.executionId, artifactId });
  }
}

function normalizeBinding(input: DeterministicWorkflowStepRecoveryBinding): DeterministicWorkflowStepRecoveryBinding {
  if (!input || typeof input !== 'object') throw bindingError('Recovery binding is required');
  const common = Object.freeze({
    projectId: token(input.projectId, 'projectId'),
    workflowId: token(input.workflowId, 'workflowId'),
    executionId: token(input.executionId, 'executionId'),
    idempotencyKey: token(input.idempotencyKey, 'idempotencyKey'),
    ticket: Object.freeze({
      ticketId: token(input.ticket?.ticketId, 'ticket.ticketId'),
      ticketVersion: input.ticket?.ticketVersion === '2' ? '2' as const : invalid<'2'>('ticket.ticketVersion must be 2'),
      nonce: token(input.ticket?.nonce, 'ticket.nonce'),
      expiresAt: timestamp(input.ticket?.expiresAt, 'ticket.expiresAt'),
    }),
    source: Object.freeze({
      artifactId: token(input.source?.artifactId, 'source.artifactId'),
      role: sourceRole(input.source?.role),
      sha256: sha256(input.source?.sha256, 'source.sha256'),
      storageId: token(input.source?.storageId, 'source.storageId'),
      width: positiveInteger(input.source?.width, 'source.width'),
      height: positiveInteger(input.source?.height, 'source.height'),
    }),
  });
  if (input.operation === 'ORTHOGONAL_TRANSFORM') {
    let mode: OrthogonalTransformMode;
    try { mode = normalizeOrthogonalTransformMode(input.mode); }
    catch (error) { throw bindingError(error instanceof Error ? error.message : 'Orthogonal-transform mode is invalid'); }
    return Object.freeze({ ...common, operation: input.operation, mode });
  }
  if (input.operation === 'RESIZE') {
    try {
      const target = normalizeResizeDimensions({ width: input.width, height: input.height }, common.source.width, common.source.height);
      return Object.freeze({ ...common, operation: input.operation, width: target.width, height: target.height });
    } catch (error) { throw bindingError(error instanceof Error ? error.message : 'Resize dimensions are invalid'); }
  }
  throw bindingError('Only ORTHOGONAL_TRANSFORM and RESIZE workflow recovery are admitted');
}

function assertExactTicket(
  ticket: Awaited<ReturnType<RecoveryLedger['getV2']>> & {},
  binding: DeterministicWorkflowStepRecoveryBinding,
  scope: AuthenticatedScope & { projectId: string },
): void {
  const definition = definitionFor(binding.operation);
  if (ticket.version !== binding.ticket.ticketVersion || ticket.issuer !== 'CORE' || ticket.ticketId !== binding.ticket.ticketId
    || ticket.nonce !== binding.ticket.nonce || new Date(ticket.expiresAt).toISOString() !== binding.ticket.expiresAt) {
    throw mismatch('Durable ticket identity does not match WorkflowContinuation binding');
  }
  if (ticket.scope.tenantId !== scope.tenantId || ticket.scope.userId !== scope.userId || ticket.scope.projectId !== scope.projectId) {
    throw recoveryError(403, 'deterministic_workflow_recovery_scope_mismatch', 'Durable deterministic ticket is outside authenticated Project scope');
  }
  if (ticket.workflowId !== binding.workflowId || ticket.requestId !== binding.executionId || ticket.idempotencyKey !== binding.idempotencyKey) {
    throw mismatch('Durable ticket workflow/request/idempotency identity does not match server workflow binding');
  }
  if (ticket.policy !== 'LOCAL_ONLY' || ticket.cost.providerCalls !== 0 || ticket.cost.paidCloudCredits !== 0) {
    throw mismatch('Deterministic workflow ticket contains forbidden provider or paid-credit authority');
  }
  if (ticket.managedInputs?.length) throw mismatch('Deterministic workflow step cannot consume managed inputs');
  if (ticket.stepId !== definition.operation.id || ticket.operation.id !== definition.operation.id
    || ticket.operation.type !== definition.operation.type || ticket.operation.version !== definition.operation.version
    || ticket.operation.capability !== definition.capability) {
    throw mismatch('Durable ticket operation/capability does not match admitted deterministic workflow step');
  }
  if (canonicalJson(ticket.allowedExecutors) !== canonicalJson([definition.executor])) {
    throw mismatch('Durable ticket executor does not match admitted deterministic tool');
  }
  const expectedInput = Object.freeze({ artifactId: binding.source.artifactId, kind: 'image', role: binding.source.role, sha256: binding.source.sha256 });
  if (canonicalJson(ticket.inputs) !== canonicalJson([expectedInput])) {
    throw mismatch('Durable ticket source Artifact identity/integrity does not match server workflow binding');
  }
  const expectedParameters = binding.operation === 'ORTHOGONAL_TRANSFORM'
    ? Object.freeze({ sourceArtifactId: binding.source.artifactId, mode: binding.mode, ...definition.parameters.exact })
    : Object.freeze({ sourceArtifactId: binding.source.artifactId, width: binding.width, height: binding.height, ...definition.parameters.exact });
  if (canonicalJson(ticket.operation.parameters ?? {}) !== canonicalJson(expectedParameters)) {
    throw mismatch('Durable ticket deterministic parameters do not match server workflow binding');
  }
  const geometry = outputGeometry(binding);
  const expectedOutput = Object.freeze({ kind: 'image', role: 'COMPOSITE', count: 1, mimeTypes: Object.freeze(['image/png']), width: geometry.width, height: geometry.height });
  if (canonicalJson(ticket.expectedOutputs) !== canonicalJson([expectedOutput])) {
    throw mismatch('Durable ticket output geometry does not match server workflow binding');
  }
}

function assertExactStoredFinal(
  stored: StoredFinalImage,
  binding: DeterministicWorkflowStepRecoveryBinding,
  scope: AuthenticatedScope & { projectId: string },
): void {
  const definition = definitionFor(binding.operation);
  const geometry = outputGeometry(binding);
  const same = stored.tenantId === scope.tenantId
    && stored.userId === scope.userId
    && stored.projectId === scope.projectId
    && stored.executionId === binding.executionId
    && stored.operationId === definition.operation.id
    && stored.role === 'COMPOSITE'
    && stored.lifecycle === 'FINAL'
    && stored.width === geometry.width
    && stored.height === geometry.height
    && stored.encoding === 'PNG_RGBA8_LOSSLESS'
    && stored.contentType === 'image/png'
    && stored.sourceImageStorageId === binding.source.storageId
    && stored.maskStorageId === undefined
    && stored.producerOperation === definition.lineage.producerOperation;
  if (!same) throw recoveryError(409, 'deterministic_workflow_recovery_lineage_mismatch', 'Committed deterministic FINAL does not match durable workflow ticket/source lineage');
}

function definitionFor(operation: DeterministicWorkflowStepRecoveryBinding['operation']): DeterministicToolDefinition {
  return operation === 'ORTHOGONAL_TRANSFORM' ? ORTHOGONAL_TRANSFORM_TOOL_DEFINITION : RESIZE_TOOL_DEFINITION;
}

function outputGeometry(binding: DeterministicWorkflowStepRecoveryBinding): Readonly<{ width: number; height: number }> {
  if (binding.operation === 'ORTHOGONAL_TRANSFORM') return orthogonalTransformOutputGeometry(binding.source.width, binding.source.height, binding.mode);
  return Object.freeze({ width: binding.width, height: binding.height });
}

function normalizeAuth(auth: AuthenticatedScope): AuthenticatedScope {
  return Object.freeze({ tenantId: token(auth?.tenantId, 'auth.tenantId'), userId: token(auth?.userId, 'auth.userId') });
}
function sourceRole(value: unknown): CanonicalSourceBinding['role'] {
  if (value !== 'ORIGINAL' && value !== 'COMPOSITE') throw bindingError('source.role must be ORIGINAL or COMPOSITE');
  return value;
}
function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw bindingError(`${field} must be a positive safe integer`);
  return Number(value);
}
function sha256(value: unknown, field: string): string {
  const normalized = token(value, field).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) throw bindingError(`${field} must be a SHA-256 digest`);
  return normalized;
}
function timestamp(value: unknown, field: string): string {
  const normalized = token(value, field);
  const milliseconds = Date.parse(normalized);
  if (!Number.isFinite(milliseconds)) throw bindingError(`${field} must be an ISO timestamp`);
  return new Date(milliseconds).toISOString();
}
function token(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw bindingError(`${field} is required`);
  return value.trim();
}
function invalid<T>(message: string): T { throw bindingError(message); }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)]));
}
function bindingError(message: string): Error & { status: number; code: string } {
  return recoveryError(500, 'deterministic_workflow_recovery_binding_invalid', message);
}
function mismatch(message: string): Error & { status: number; code: string } {
  return recoveryError(409, 'deterministic_workflow_recovery_ticket_mismatch', message);
}
function recoveryError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
