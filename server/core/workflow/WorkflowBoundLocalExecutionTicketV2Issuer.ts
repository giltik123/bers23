import { AsyncLocalStorage } from 'node:async_hooks';
import type {
  LocalExecutionTicketIssueRequestV2,
  LocalExecutionTicketV2,
  LocalExecutionTicketV2IssuerPort,
} from '../../../src/platform/creative/canonical/localExecution.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { LocalExecutionLedgerV2 } from '../localExecution/LocalExecutionLedger.ts';

type DurableReader = Pick<LocalExecutionLedgerV2, 'getByIdempotencyKeyV2'>;
type WorkflowBinding = Readonly<{
  scope: Scope;
  workflowId: string;
  allowedStepIds: readonly string[];
}>;
type NormalizedBinding = Readonly<{
  scope: Scope;
  workflowId: string;
  allowedStepIds: ReadonlySet<string>;
}>;

/**
 * Server-only adapter that lets one already-reviewed local execution remain the
 * ticket authority while a durable workflow owns the ticket's workflowId.
 *
 * Workflow binding is carried only through AsyncLocalStorage for the exact
 * server call tree; browser values cannot select it. Normal deterministic v2
 * issuance is unchanged. After Core restart, an already durable ticket supplies
 * its own workflowId so canonical service reconstruction cannot silently rebind
 * the ticket to a child execution identity.
 */
export class WorkflowBoundLocalExecutionTicketV2Issuer implements LocalExecutionTicketV2IssuerPort {
  private readonly context = new AsyncLocalStorage<NormalizedBinding>();

  constructor(
    private readonly delegate: LocalExecutionTicketV2IssuerPort,
    private readonly durable: DurableReader,
  ) {}

  async withWorkflowBinding<T>(binding: WorkflowBinding, work: () => Promise<T>): Promise<T> {
    const normalized = normalizeBinding(binding);
    const existing = this.context.getStore();
    if (existing) {
      if (!sameBinding(existing, normalized)) throw bindingError('Conflicting nested local workflow binding is forbidden');
      return work();
    }
    return this.context.run(normalized, work);
  }

  async issue(input: LocalExecutionTicketIssueRequestV2): Promise<LocalExecutionTicketV2> {
    const durable = await this.durable.getByIdempotencyKeyV2(input.scope, input.idempotencyKey);
    if (durable) {
      if (durable.requestId !== input.requestId || durable.stepId !== input.stepId) {
        throw bindingError('Durable local ticket idempotency is bound to a different request or step');
      }
      return await this.delegate.issue(Object.freeze({ ...input, workflowId: durable.workflowId }));
    }

    const active = this.context.getStore();
    if (!active) return await this.delegate.issue(input);
    if (!sameScope(active.scope, input.scope)) throw bindingError('Active local workflow binding scope does not match ticket scope');
    if (!active.allowedStepIds.has(input.stepId)) throw bindingError(`Local workflow binding does not admit step ${input.stepId}`);
    return await this.delegate.issue(Object.freeze({ ...input, workflowId: active.workflowId }));
  }
}

function normalizeBinding(binding: WorkflowBinding): NormalizedBinding {
  const scope = normalizeScope(binding.scope);
  const workflowId = token(binding.workflowId, 'workflowId');
  if (!Array.isArray(binding.allowedStepIds) || binding.allowedStepIds.length < 1) throw bindingError('allowedStepIds must contain at least one server-owned workflow step');
  const allowed = binding.allowedStepIds.map((value, index) => token(value, `allowedStepIds[${index}]`));
  if (new Set(allowed).size !== allowed.length) throw bindingError('allowedStepIds must be unique');
  return Object.freeze({ scope, workflowId, allowedStepIds: new Set(allowed) });
}
function sameBinding(a: NormalizedBinding, b: NormalizedBinding): boolean {
  return sameScope(a.scope, b.scope)
    && a.workflowId === b.workflowId
    && a.allowedStepIds.size === b.allowedStepIds.size
    && [...a.allowedStepIds].every(value => b.allowedStepIds.has(value));
}
function sameScope(a: Scope, b: Scope): boolean {
  return a.tenantId === b.tenantId && a.userId === b.userId && a.projectId === b.projectId;
}
function normalizeScope(scope: Scope): Scope {
  return Object.freeze({
    tenantId: token(scope?.tenantId, 'scope.tenantId'),
    userId: token(scope?.userId, 'scope.userId'),
    projectId: token(scope?.projectId, 'scope.projectId'),
  });
}
function token(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw bindingError(`${field} is required`);
  return value.trim();
}
function bindingError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: 'WORKFLOW_LOCAL_TICKET_BINDING_CONFLICT' });
}
