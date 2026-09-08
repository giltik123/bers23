import type {
  LocalExecutionTicketIssueRequestV2,
  LocalExecutionTicketV2,
  LocalExecutionTicketV2IssuerPort,
} from '../../../src/platform/creative/canonical/localExecution.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { LocalExecutionLedgerV2 } from '../localExecution/LocalExecutionLedger.ts';

type DurableReader = Pick<LocalExecutionLedgerV2, 'getByIdempotencyKeyV2'>;
type WorkflowBinding = Readonly<{ scope: Scope; requestId: string; workflowId: string }>;

/**
 * Server-only adapter that lets one already-reviewed local execution remain the
 * ticket authority while a durable workflow owns the ticket's workflowId.
 *
 * No browser value can reach `withWorkflowBinding`. Normal v2 issuance is byte-
 * for-byte equivalent at the authority level because, without an active server
 * binding, the original workflowId is forwarded unchanged. After Core restart,
 * an already durable ticket supplies its own workflowId so service reconstruction
 * cannot accidentally rebind it to a child execution identity.
 */
export class WorkflowBoundLocalExecutionTicketV2Issuer implements LocalExecutionTicketV2IssuerPort {
  private readonly active = new Map<string, string>();
  private readonly delegate: LocalExecutionTicketV2IssuerPort;
  private readonly durable: DurableReader;

  constructor(delegate: LocalExecutionTicketV2IssuerPort, durable: DurableReader) {
    this.delegate = delegate;
    this.durable = durable;
  }

  async withWorkflowBinding<T>(binding: WorkflowBinding, work: () => Promise<T>): Promise<T> {
    const scope = normalizeScope(binding.scope);
    const requestId = token(binding.requestId, 'requestId');
    const workflowId = token(binding.workflowId, 'workflowId');
    const key = bindingKey(scope, requestId);
    const existing = this.active.get(key);
    if (existing && existing !== workflowId) throw bindingError('Local execution request is already bound to a different active workflow');
    if (existing === workflowId) return work();
    this.active.set(key, workflowId);
    try { return await work(); }
    finally { if (this.active.get(key) === workflowId) this.active.delete(key); }
  }

  async issue(input: LocalExecutionTicketIssueRequestV2): Promise<LocalExecutionTicketV2> {
    const durable = await this.durable.getByIdempotencyKeyV2(input.scope, input.idempotencyKey);
    if (durable) {
      if (durable.requestId !== input.requestId || durable.stepId !== input.stepId) {
        throw bindingError('Durable local ticket idempotency is bound to a different request or step');
      }
      return await this.delegate.issue(Object.freeze({ ...input, workflowId: durable.workflowId }));
    }
    const workflowId = this.active.get(bindingKey(normalizeScope(input.scope), token(input.requestId, 'requestId')))
      ?? token(input.workflowId, 'workflowId');
    return await this.delegate.issue(Object.freeze({ ...input, workflowId }));
  }
}

function bindingKey(scope: Scope, requestId: string): string {
  return JSON.stringify(['workflow-bound-local-v2', scope.tenantId, scope.userId, scope.projectId, requestId]);
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
