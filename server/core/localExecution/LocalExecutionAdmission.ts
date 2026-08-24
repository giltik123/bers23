import type {
  AnyLocalExecutionAdmissionDecision,
  AnyLocalExecutionResult,
  AnyLocalExecutionTicket,
  LocalExecutionAdmissionReason,
  LocalExecutionExecutorBinding,
  LocalExecutionExpectedOutput,
  LocalExecutionOutputEvidence,
  LocalExecutionResult,
  LocalExecutionResultV2,
  LocalExecutionTicket,
  LocalExecutionTicketV2,
} from '../../../src/platform/creative/canonical/localExecution.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { LocalExecutionFinalization } from './LocalExecutionLedger.ts';

const SHA256 = /^[a-f0-9]{64}$/i;
const MODEL_RUNTIMES = new Set(['ONNX_RUNTIME', 'WEBGPU', 'WASM', 'NNAPI', 'DIRECTML', 'CUDA', 'METAL', 'VULKAN']);
const V2_RUNTIMES = new Set([...MODEL_RUNTIMES, 'BROWSER_JS']);
const ACCELERATORS = new Set(['webgpu', 'wasm', 'cuda', 'dml', 'coreml', 'cpu', 'nnapi', 'UNKNOWN']);
const POLICIES = new Set(['LOCAL_SELECTED', 'LOCAL_ONLY']);
const FORBIDDEN_RESULT_KEYS = new Set([
  'artifactId',
  'canonicalArtifactId',
  'canonicalResultArtifactId',
  'tenantId',
  'projectId',
  'userId',
  'credits',
  'billing',
  'billingStatus',
  'transactionStatus',
  'provider',
  'providerId',
  'verification',
  'verificationPassed',
  'serverVerification',
]);

/**
 * Server-side replay/scope/output admission boundary for versioned on-device execution.
 * This class deliberately has no provider runtime or Billing dependency.
 */
export class LocalExecutionAdmissionRegistry {
  readonly #tickets = new Map<string, AnyLocalExecutionTicket>();
  readonly #consumed = new Set<string>();
  readonly #claimed = new Set<string>();
  readonly #idempotency = new Map<string, string>();
  readonly #finalizations = new Map<string, LocalExecutionFinalization>();

  issue(ticket: AnyLocalExecutionTicket): AnyLocalExecutionTicket {
    assertTicket(ticket);
    const stored = immutableTicket(ticket);
    const idempotencyLookup = scopedIdempotencyKey(stored.scope, stored.idempotencyKey);
    const existingByIdempotency = this.#idempotency.get(idempotencyLookup);
    if (existingByIdempotency) {
      const existing = this.#tickets.get(existingByIdempotency);
      if (!existing) throw new Error('Local execution idempotency registry is inconsistent');
      if (!sameTicketBinding(existing, stored)) throw new Error('Local execution idempotency key already bound to another execution');
      return existing;
    }
    const existing = this.#tickets.get(stored.ticketId);
    if (existing) {
      if (!sameTicketBinding(existing, stored) || existing.idempotencyKey !== stored.idempotencyKey) throw new Error('Local execution ticket ID already bound');
      return existing;
    }
    this.#tickets.set(stored.ticketId, stored);
    this.#idempotency.set(idempotencyLookup, stored.ticketId);
    return stored;
  }

  get(ticketId: string): AnyLocalExecutionTicket | undefined { return this.#tickets.get(ticketId); }
  getByIdempotencyKey(scope: Scope, idempotencyKey: string): AnyLocalExecutionTicket | undefined {
    const ticketId = this.#idempotency.get(scopedIdempotencyKey(scope, idempotencyKey));
    return ticketId ? this.#tickets.get(ticketId) : undefined;
  }
  getFinalization(ticketId: string): LocalExecutionFinalization | undefined { return this.#finalizations.get(ticketId); }

  /** Claim prevents concurrent duplicate finalization while canonical persistence is in progress. */
  claim(input: Readonly<{ ticketId: string; result: unknown; callerScope: Scope; now: number }>): AnyLocalExecutionAdmissionDecision {
    const decision = this.#validate(input);
    if (!decision.allowed) return decision;
    if (this.#claimed.has(decision.ticket.ticketId)) return denied('IN_PROGRESS');
    this.#claimed.add(decision.ticket.ticketId);
    return decision;
  }

  commit(ticketId: string, status: 'SUCCESS' | 'FAILED' = 'SUCCESS'): Promise<void> {
    this.#commit(ticketId, status);
    return Promise.resolve();
  }

  release(ticketId: string): Promise<void> {
    this.#claimed.delete(ticketId);
    return Promise.resolve();
  }

  admit(input: Readonly<{ ticketId: string; result: unknown; callerScope: Scope; now: number }>): AnyLocalExecutionAdmissionDecision {
    const decision = this.claim(input);
    if (decision.allowed) this.#commit(decision.ticket.ticketId, 'SUCCESS');
    return decision;
  }

  #commit(ticketId: string, status: 'SUCCESS' | 'FAILED'): void {
    if (!this.#claimed.delete(ticketId)) throw new Error('Local execution ticket has no active admission claim');
    if (this.#consumed.has(ticketId)) throw new Error('Local execution ticket is already consumed');
    this.#consumed.add(ticketId);
    this.#finalizations.set(ticketId, Object.freeze({ status }));
  }

  #validate(input: Readonly<{ ticketId: string; result: unknown; callerScope: Scope; now: number }>): AnyLocalExecutionAdmissionDecision {
    const ticket = this.#tickets.get(input.ticketId);
    if (!ticket) return denied('UNKNOWN_TICKET');
    if (this.#consumed.has(ticket.ticketId)) return denied('REPLAYED_TICKET');
    if (this.#claimed.has(ticket.ticketId)) return denied('IN_PROGRESS');
    if (!sameScope(ticket.scope, input.callerScope)) return denied('SCOPE_MISMATCH');
    if (input.now >= ticket.expiresAt) return denied('EXPIRED_TICKET');
    if (containsForbiddenAuthority(input.result)) return denied('FORBIDDEN_CLIENT_AUTHORITY');

    if (ticket.version === '1') return validateV1(ticket, input.result);
    return validateV2(ticket, input.result);
  }
}

function validateV1(ticket: LocalExecutionTicket, raw: unknown): AnyLocalExecutionAdmissionDecision {
  if (!isLocalExecutionResultV1(raw)) return denied('MALFORMED_RESULT');
  const result = raw;
  if (!sameResultIdentity(ticket, result)) return denied('IDENTITY_MISMATCH');
  if (!ticket.allowedModels.some(model => model.modelId === result.model.modelId && model.version === result.model.version)) return denied('MODEL_MISMATCH');
  if (!outputsMatch(ticket.expectedOutputs, result.outputs)) return denied('OUTPUT_CONTRACT_MISMATCH');
  return Object.freeze({ allowed: true, reasonCode: 'ADMITTED', ticket, result: immutableResultV1(result) });
}

function validateV2(ticket: LocalExecutionTicketV2, raw: unknown): AnyLocalExecutionAdmissionDecision {
  if (!isLocalExecutionResultV2(raw)) return denied('MALFORMED_RESULT');
  const result = raw;
  if (!sameResultIdentity(ticket, result)) return denied('IDENTITY_MISMATCH');
  if (!ticket.allowedExecutors.some(executor => sameExecutor(executor, result.executor))) return denied('EXECUTOR_MISMATCH');
  if (result.executor.kind === 'MODEL' && result.runtime === 'BROWSER_JS') return denied('MALFORMED_RESULT');
  if (!outputsMatch(ticket.expectedOutputs, result.outputs)) return denied('OUTPUT_CONTRACT_MISMATCH');
  return Object.freeze({ allowed: true, reasonCode: 'ADMITTED', ticket, result: immutableResultV2(result) });
}

function assertTicket(ticket: AnyLocalExecutionTicket): void {
  if (ticket.issuer !== 'CORE' || (ticket.version !== '1' && ticket.version !== '2')) throw new Error('Invalid local execution ticket authority');
  if (!ticket.ticketId || !ticket.requestId || !ticket.workflowId || !ticket.stepId || !ticket.operation.id || !ticket.operation.version || !ticket.operation.type || !ticket.operation.capability) throw new Error('Incomplete local execution ticket identity');
  if (!ticket.scope.tenantId || !ticket.scope.projectId || !ticket.scope.userId) throw new Error('Incomplete local execution ticket scope');
  if (!POLICIES.has(ticket.policy)) throw new Error('Invalid local execution policy');
  if (!ticket.idempotencyKey || !ticket.nonce) throw new Error('Local execution ticket requires idempotency and nonce');
  if (!Number.isFinite(ticket.issuedAt) || !Number.isFinite(ticket.expiresAt) || ticket.expiresAt <= ticket.issuedAt) throw new Error('Invalid local execution ticket lifetime');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw new Error('Local execution ticket cannot authorize cloud cost');
  if (ticket.version === '1') {
    if (!Array.isArray(ticket.allowedModels) || ticket.allowedModels.length === 0 || ticket.allowedModels.some(model => !model.modelId || !model.version)) throw new Error('Local execution v1 ticket requires approved model bindings');
  } else {
    if (!Array.isArray(ticket.allowedExecutors) || ticket.allowedExecutors.length === 0 || ticket.allowedExecutors.some(executor => !validExecutor(executor))) throw new Error('Local execution v2 ticket requires approved executor bindings');
  }
  if (ticket.operation.parameters !== undefined && (!ticket.operation.parameters || typeof ticket.operation.parameters !== 'object' || Array.isArray(ticket.operation.parameters))) throw new Error('Invalid local execution operation parameters');
  for (const input of ticket.inputs) if (input.sha256 !== undefined && !SHA256.test(input.sha256)) throw new Error('Invalid input artifact SHA-256');
  for (const expected of ticket.expectedOutputs) {
    if (!Number.isInteger(expected.count) || expected.count < 1) throw new Error('Invalid expected local output count');
    if (expected.width !== undefined && (!Number.isInteger(expected.width) || expected.width < 1)) throw new Error('Invalid expected local output width');
    if (expected.height !== undefined && (!Number.isInteger(expected.height) || expected.height < 1)) throw new Error('Invalid expected local output height');
  }
}

function immutableTicket(ticket: AnyLocalExecutionTicket): AnyLocalExecutionTicket {
  const parameters = ticket.operation.parameters === undefined ? undefined : deepFreeze(structuredClone(ticket.operation.parameters));
  const common = {
    ...ticket,
    operation: Object.freeze({ ...ticket.operation, parameters }),
    scope: Object.freeze({ ...ticket.scope }),
    inputs: Object.freeze(ticket.inputs.map(input => Object.freeze({ ...input }))),
    expectedOutputs: Object.freeze(ticket.expectedOutputs.map(output => Object.freeze({ ...output, mimeTypes: output.mimeTypes ? Object.freeze([...output.mimeTypes]) : undefined }))),
    cost: Object.freeze({ paidCloudCredits: 0 as const, providerCalls: 0 as const }),
  };
  if (ticket.version === '1') return Object.freeze({ ...common, version: '1' as const, allowedModels: Object.freeze(ticket.allowedModels.map(model => Object.freeze({ ...model }))) }) as LocalExecutionTicket;
  return Object.freeze({ ...common, version: '2' as const, allowedExecutors: Object.freeze(ticket.allowedExecutors.map(executor => Object.freeze({ ...executor }))) }) as LocalExecutionTicketV2;
}

function sameTicketBinding(a: AnyLocalExecutionTicket, b: AnyLocalExecutionTicket): boolean {
  if (a.version !== b.version) return false;
  const common = a.requestId === b.requestId && a.workflowId === b.workflowId && a.stepId === b.stepId && sameScope(a.scope, b.scope) &&
    a.operation.id === b.operation.id && a.operation.version === b.operation.version && a.operation.type === b.operation.type && a.operation.capability === b.operation.capability &&
    canonicalJson(a.operation.parameters ?? {}) === canonicalJson(b.operation.parameters ?? {}) &&
    a.policy === b.policy && canonicalJson(a.inputs) === canonicalJson(b.inputs) && canonicalJson(a.expectedOutputs) === canonicalJson(b.expectedOutputs);
  if (!common) return false;
  if (a.version === '1' && b.version === '1') return canonicalJson(a.allowedModels) === canonicalJson(b.allowedModels);
  if (a.version === '2' && b.version === '2') return canonicalJson(a.allowedExecutors) === canonicalJson(b.allowedExecutors);
  return false;
}

function scopedIdempotencyKey(scope: Scope, idempotencyKey: string): string {
  return canonicalJson([scope.tenantId, scope.userId, scope.projectId, idempotencyKey]) ?? '';
}
function canonicalJson(value: unknown): string | undefined { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)]));
}

function immutableResultV1(result: LocalExecutionResult): LocalExecutionResult {
  return Object.freeze({
    ...result,
    model: Object.freeze({ ...result.model }),
    outputs: Object.freeze(result.outputs.map(output => Object.freeze({ ...output }))),
    metrics: Object.freeze({ ...result.metrics }),
    benchmarkEvidence: result.benchmarkEvidence ? Object.freeze({ ...result.benchmarkEvidence }) : undefined,
  });
}

function immutableResultV2(result: LocalExecutionResultV2): LocalExecutionResultV2 {
  return Object.freeze({
    ...result,
    executor: Object.freeze({ ...result.executor }),
    outputs: Object.freeze(result.outputs.map(output => Object.freeze({ ...output }))),
    metrics: Object.freeze({ ...result.metrics }),
    benchmarkEvidence: result.benchmarkEvidence ? Object.freeze({ ...result.benchmarkEvidence }) : undefined,
  });
}

function sameScope(a: Scope, b: Scope): boolean { return a.tenantId === b.tenantId && a.projectId === b.projectId && a.userId === b.userId; }

function denied(reasonCode: Exclude<LocalExecutionAdmissionReason, 'ADMITTED'>): AnyLocalExecutionAdmissionDecision {
  return Object.freeze({ allowed: false, reasonCode });
}

function containsForbiddenAuthority(value: unknown, seen = new Set<object>()): boolean {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some(item => containsForbiddenAuthority(item, seen));
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_RESULT_KEYS.has(key)) return true;
    if (containsForbiddenAuthority(child, seen)) return true;
  }
  return false;
}

function isLocalExecutionResultV1(value: unknown): value is LocalExecutionResult {
  if (!commonResultShape(value)) return false;
  const result = value as Partial<LocalExecutionResult>;
  if (result.ticketVersion !== '1') return false;
  if (!result.model || !nonEmptyString(result.model.modelId) || !nonEmptyString(result.model.version)) return false;
  if (!nonEmptyString(result.runtime) || !MODEL_RUNTIMES.has(result.runtime)) return false;
  return validMetricsAndOutputs(result);
}

function isLocalExecutionResultV2(value: unknown): value is LocalExecutionResultV2 {
  if (!commonResultShape(value)) return false;
  const result = value as Partial<LocalExecutionResultV2>;
  if (result.ticketVersion !== '2') return false;
  if (!result.executor || !validExecutor(result.executor)) return false;
  if (!nonEmptyString(result.runtime) || !V2_RUNTIMES.has(result.runtime)) return false;
  return validMetricsAndOutputs(result);
}

function commonResultShape(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const result = value as Record<string, unknown>;
  if (![result.ticketId, result.requestId, result.workflowId, result.stepId, result.nonce].every(nonEmptyString)) return false;
  if (!nonEmptyString(result.accelerator) || !ACCELERATORS.has(result.accelerator)) return false;
  return true;
}

function validMetricsAndOutputs(result: Partial<AnyLocalExecutionResult>): boolean {
  if (!Array.isArray(result.outputs) || !result.outputs.every(isOutputEvidence)) return false;
  if (!result.metrics || !finiteNonNegative(result.metrics.latencyMs)) return false;
  if (result.metrics.memoryBytes !== undefined && !finiteNonNegative(result.metrics.memoryBytes)) return false;
  if (result.metrics.vramBytes !== undefined && !finiteNonNegative(result.metrics.vramBytes)) return false;
  if (result.metrics.energyEstimate !== undefined && !finiteNonNegative(result.metrics.energyEstimate)) return false;
  return true;
}

function validExecutor(value: unknown): value is LocalExecutionExecutorBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const executor = value as Record<string, unknown>;
  if (executor.kind === 'MODEL') return nonEmptyString(executor.modelId) && nonEmptyString(executor.version) && !('toolId' in executor);
  if (executor.kind === 'DETERMINISTIC_TOOL') return nonEmptyString(executor.toolId) && nonEmptyString(executor.version) && !('modelId' in executor);
  return false;
}

function sameExecutor(a: LocalExecutionExecutorBinding, b: LocalExecutionExecutorBinding): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'MODEL' && b.kind === 'MODEL') return a.modelId === b.modelId && a.version === b.version;
  if (a.kind === 'DETERMINISTIC_TOOL' && b.kind === 'DETERMINISTIC_TOOL') return a.toolId === b.toolId && a.version === b.version;
  return false;
}

function sameResultIdentity(ticket: AnyLocalExecutionTicket, result: AnyLocalExecutionResult): boolean {
  return result.ticketId === ticket.ticketId && result.ticketVersion === ticket.version && result.requestId === ticket.requestId && result.workflowId === ticket.workflowId && result.stepId === ticket.stepId && result.nonce === ticket.nonce;
}

function isOutputEvidence(value: unknown): value is LocalExecutionOutputEvidence {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const output = value as Partial<LocalExecutionOutputEvidence>;
  if (!nonEmptyString(output.uploadId) || !nonEmptyString(output.kind) || !nonEmptyString(output.mimeType)) return false;
  if (!nonEmptyString(output.sha256) || !SHA256.test(output.sha256)) return false;
  if (!Number.isInteger(output.sizeBytes) || Number(output.sizeBytes) <= 0) return false;
  if (output.width !== undefined && (!Number.isInteger(output.width) || Number(output.width) <= 0)) return false;
  if (output.height !== undefined && (!Number.isInteger(output.height) || Number(output.height) <= 0)) return false;
  return true;
}

function outputsMatch(expected: readonly LocalExecutionExpectedOutput[], actual: readonly LocalExecutionOutputEvidence[]): boolean {
  const expectedCount = expected.reduce((sum, item) => sum + item.count, 0);
  if (actual.length !== expectedCount) return false;
  const remaining = actual.slice();
  for (const contract of expected) {
    for (let i = 0; i < contract.count; i += 1) {
      const index = remaining.findIndex(output => output.kind === contract.kind && output.role === contract.role &&
        (!contract.mimeTypes?.length || contract.mimeTypes.includes(output.mimeType)) &&
        (contract.width === undefined || contract.width === output.width) &&
        (contract.height === undefined || contract.height === output.height));
      if (index < 0) return false;
      remaining.splice(index, 1);
    }
  }
  return remaining.length === 0;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return value;
}
function nonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function finiteNonNegative(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
