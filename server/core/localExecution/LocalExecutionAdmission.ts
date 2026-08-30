import type {
  AnyLocalExecutionAdmissionDecision,
  AnyLocalExecutionResult,
  AnyLocalExecutionTicket,
  LocalExecutionAdmissionDecision,
  LocalExecutionAdmissionDecisionV2,
  LocalExecutionAdmissionReason,
  LocalExecutionExecutorBinding,
  LocalExecutionExpectedOutput,
  LocalExecutionManagedGarmentInputBinding,
  LocalExecutionOutputEvidence,
  LocalExecutionResult,
  LocalExecutionResultV2,
  LocalExecutionTicket,
  LocalExecutionTicketV2,
} from '../../../src/platform/creative/canonical/localExecution.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';
import type { LocalExecutionFinalization, LocalExecutionClaimInput } from './LocalExecutionLedger.ts';
import { localExecutionResultReplayDigest } from './localExecutionReplayDigest.ts';

const SHA256 = /^[a-f0-9]{64}$/i;
const MANAGED_SHA256 = /^[a-f0-9]{64}$/;
const LOWER_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MAX_MANAGED_INPUTS = 16;
const MODEL_RUNTIMES = new Set(['ONNX_RUNTIME', 'WEBGPU', 'WASM', 'NNAPI', 'DIRECTML', 'CUDA', 'METAL', 'VULKAN']);
const V2_RUNTIMES = new Set([...MODEL_RUNTIMES, 'BROWSER_JS']);
const ACCELERATORS = new Set(['webgpu', 'wasm', 'cuda', 'dml', 'coreml', 'cpu', 'nnapi', 'UNKNOWN']);
const POLICIES = new Set(['LOCAL_SELECTED', 'LOCAL_ONLY']);
const FORBIDDEN_RESULT_KEYS = new Set([
  'artifactId','canonicalArtifactId','canonicalResultArtifactId','tenantId','projectId','userId',
  'managedInputs','garmentId','viewId','representationId',
  'credits','billing','billingStatus','transactionStatus','provider','providerId','verification','verificationPassed','serverVerification',
]);

/** Shared in-memory authority with explicit v1/v2 typed surfaces over one state machine. */
export class LocalExecutionAdmissionRegistry {
  readonly #tickets = new Map<string, AnyLocalExecutionTicket>();
  readonly #consumed = new Set<string>();
  readonly #claimedResultDigests = new Map<string, string>();
  readonly #admittedResultDigests = new Map<string, string>();
  readonly #idempotency = new Map<string, string>();
  readonly #finalizations = new Map<string, LocalExecutionFinalization>();

  issue(ticket: LocalExecutionTicket): LocalExecutionTicket { return requireV1(this.#issueAny(ticket)); }
  issueV2(ticket: LocalExecutionTicketV2): LocalExecutionTicketV2 { return requireV2(this.#issueAny(ticket)); }

  get(ticketId: string): LocalExecutionTicket | undefined { return optionalV1(this.#tickets.get(ticketId)); }
  getV2(ticketId: string): LocalExecutionTicketV2 | undefined { return optionalV2(this.#tickets.get(ticketId)); }

  getByIdempotencyKey(scope: Scope, idempotencyKey: string): LocalExecutionTicket | undefined {
    return optionalV1(this.#getByIdempotencyKeyAny(scope, idempotencyKey));
  }
  getByIdempotencyKeyV2(scope: Scope, idempotencyKey: string): LocalExecutionTicketV2 | undefined {
    return optionalV2(this.#getByIdempotencyKeyAny(scope, idempotencyKey));
  }
  getFinalization(ticketId: string): LocalExecutionFinalization | undefined { return this.#finalizations.get(ticketId); }

  claim(input: LocalExecutionClaimInput): LocalExecutionAdmissionDecision {
    return requireDecisionV1(this.#claimAny(input, '1'));
  }
  claimV2(input: LocalExecutionClaimInput): LocalExecutionAdmissionDecisionV2 {
    return requireDecisionV2(this.#claimAny(input, '2'));
  }

  commit(ticketId: string, status: 'SUCCESS' | 'FAILED' = 'SUCCESS'): Promise<void> { this.#commit(ticketId, status); return Promise.resolve(); }
  release(ticketId: string): Promise<void> { this.#claimedResultDigests.delete(ticketId); return Promise.resolve(); }

  admit(input: LocalExecutionClaimInput): LocalExecutionAdmissionDecision {
    const decision = this.claim(input); if (decision.allowed) this.#commit(decision.ticket.ticketId, 'SUCCESS'); return decision;
  }
  admitV2(input: LocalExecutionClaimInput): LocalExecutionAdmissionDecisionV2 {
    const decision = this.claimV2(input); if (decision.allowed) this.#commit(decision.ticket.ticketId, 'SUCCESS'); return decision;
  }

  #issueAny(ticket: AnyLocalExecutionTicket): AnyLocalExecutionTicket {
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

  #getByIdempotencyKeyAny(scope: Scope, idempotencyKey: string): AnyLocalExecutionTicket | undefined {
    const ticketId = this.#idempotency.get(scopedIdempotencyKey(scope, idempotencyKey));
    return ticketId ? this.#tickets.get(ticketId) : undefined;
  }

  #claimAny(input: LocalExecutionClaimInput, expectedVersion: '1' | '2'): AnyLocalExecutionAdmissionDecision {
    const decision = this.#validate(input, expectedVersion);
    if (!decision.allowed) return decision;
    if (this.#claimedResultDigests.has(decision.ticket.ticketId)) return denied('IN_PROGRESS');
    this.#claimedResultDigests.set(decision.ticket.ticketId, localExecutionResultReplayDigest(decision.result));
    return decision;
  }

  #commit(ticketId: string, status: 'SUCCESS' | 'FAILED'): void {
    const digest = this.#claimedResultDigests.get(ticketId);
    if (!digest) throw new Error('Local execution ticket has no active admission claim');
    if (this.#consumed.has(ticketId)) throw new Error('Local execution ticket is already consumed');
    this.#claimedResultDigests.delete(ticketId);
    this.#consumed.add(ticketId);
    this.#admittedResultDigests.set(ticketId, digest);
    this.#finalizations.set(ticketId, Object.freeze({ status }));
  }

  #validate(input: LocalExecutionClaimInput, expectedVersion: '1' | '2'): AnyLocalExecutionAdmissionDecision {
    const ticket = this.#tickets.get(input.ticketId);
    if (!ticket) return denied('UNKNOWN_TICKET');
    if (ticket.version !== expectedVersion) return denied('IDENTITY_MISMATCH');
    if (this.#claimedResultDigests.has(ticket.ticketId)) return denied('IN_PROGRESS');
    if (!sameScope(ticket.scope, input.callerScope)) return denied('SCOPE_MISMATCH');
    const consumed = this.#consumed.has(ticket.ticketId);
    if (!consumed && input.now >= ticket.expiresAt) return denied('EXPIRED_TICKET');
    if (containsForbiddenAuthority(input.result)) return denied('FORBIDDEN_CLIENT_AUTHORITY');
    const decision = ticket.version === '1' ? validateV1(ticket, input.result) : validateV2(ticket, input.result);
    if (!decision.allowed) return decision;
    if (!consumed) return decision;
    const storedDigest = this.#admittedResultDigests.get(ticket.ticketId);
    const replayDigest = localExecutionResultReplayDigest(decision.result);
    return denied(storedDigest === replayDigest ? 'REPLAYED_TICKET' : 'CONFLICTING_REPLAY');
  }
}

function validateV1(ticket: LocalExecutionTicket, raw: unknown): LocalExecutionAdmissionDecision {
  if (!isLocalExecutionResultV1(raw)) return denied('MALFORMED_RESULT');
  if (!sameResultIdentity(ticket, raw)) return denied('IDENTITY_MISMATCH');
  if (!ticket.allowedModels.some(model => model.modelId === raw.model.modelId && model.version === raw.model.version)) return denied('MODEL_MISMATCH');
  if (!outputsMatch(ticket.expectedOutputs, raw.outputs)) return denied('OUTPUT_CONTRACT_MISMATCH');
  return Object.freeze({ allowed: true, reasonCode: 'ADMITTED', ticket, result: immutableResultV1(raw) });
}

function validateV2(ticket: LocalExecutionTicketV2, raw: unknown): LocalExecutionAdmissionDecisionV2 {
  if (!isLocalExecutionResultV2(raw)) return denied('MALFORMED_RESULT');
  if (!sameResultIdentity(ticket, raw)) return denied('IDENTITY_MISMATCH');
  if (!ticket.allowedExecutors.some(executor => sameExecutor(executor, raw.executor))) return denied('EXECUTOR_MISMATCH');
  if (raw.executor.kind === 'MODEL' && raw.runtime === 'BROWSER_JS') return denied('MALFORMED_RESULT');
  if (!outputsMatch(ticket.expectedOutputs, raw.outputs)) return denied('OUTPUT_CONTRACT_MISMATCH');
  return Object.freeze({ allowed: true, reasonCode: 'ADMITTED', ticket, result: immutableResultV2(raw) });
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
    if ('managedInputs' in ticket) throw new Error('Local execution v1 ticket cannot carry managed inputs');
    if (!ticket.allowedModels.length || ticket.allowedModels.some(model => !model.modelId || !model.version)) throw new Error('Local execution v1 ticket requires approved model bindings');
  } else {
    if (!ticket.allowedExecutors.length || ticket.allowedExecutors.some(executor => !validExecutor(executor))) throw new Error('Local execution v2 ticket requires approved executor bindings');
    if (ticket.managedInputs !== undefined) {
      if (!Array.isArray(ticket.managedInputs) || ticket.managedInputs.length < 1 || ticket.managedInputs.length > MAX_MANAGED_INPUTS) throw new Error('Local execution v2 managed inputs must contain 1 to 16 bindings when present');
      for (const input of ticket.managedInputs) assertManagedInput(input);
    }
  }
  if (ticket.operation.parameters !== undefined && (!ticket.operation.parameters || typeof ticket.operation.parameters !== 'object' || Array.isArray(ticket.operation.parameters))) throw new Error('Invalid local execution operation parameters');
  for (const input of ticket.inputs) if (input.sha256 !== undefined && !SHA256.test(input.sha256)) throw new Error('Invalid input artifact SHA-256');
  for (const expected of ticket.expectedOutputs) {
    if (!Number.isInteger(expected.count) || expected.count < 1) throw new Error('Invalid expected local output count');
    if (expected.width !== undefined && (!Number.isInteger(expected.width) || expected.width < 1)) throw new Error('Invalid expected local output width');
    if (expected.height !== undefined && (!Number.isInteger(expected.height) || expected.height < 1)) throw new Error('Invalid expected local output height');
  }
}

function assertManagedInput(input: LocalExecutionManagedGarmentInputBinding): void {
  if (!input || typeof input !== 'object' || Array.isArray(input) || input.authority !== 'MANAGED_GARMENT') throw new Error('Invalid managed Garment input authority');
  if (!LOWER_UUID.test(input.garmentId) || !MANAGED_SHA256.test(input.contentSha256)) throw new Error('Invalid managed Garment input identity');
  if (input.kind === 'GARMENT_VIEW') {
    assertExactKeys(input, ['authority','kind','garmentId','viewId','contentSha256','contentType','encoding','width','height']);
    if (!LOWER_UUID.test(input.viewId) || input.contentType !== 'image/png' || input.encoding !== 'PNG_RGBA8_LOSSLESS') throw new Error('Invalid managed Garment view binding');
    if (!Number.isSafeInteger(input.width) || input.width < 1 || !Number.isSafeInteger(input.height) || input.height < 1) throw new Error('Invalid managed Garment view dimensions');
    return;
  }
  if (input.kind !== 'GARMENT_REPRESENTATION') throw new Error('Unsupported managed Garment input kind');
  assertExactKeys(input, ['authority','kind','garmentId','representationId','tier','format','contentType','contentSha256','basisViewId','generatorId','generatorVersion','validatorId','validatorVersion']);
  if (!LOWER_UUID.test(input.representationId) || !LOWER_UUID.test(input.basisViewId)) throw new Error('Invalid managed Garment representation identity');
  if (!printableProvenance(input.generatorId) || !printableProvenance(input.generatorVersion) || !printableProvenance(input.validatorId) || !printableProvenance(input.validatorVersion)) throw new Error('Invalid managed Garment representation provenance');
  const parametric = input.tier === 'PARAMETRIC' && input.format === 'BERS_PARAMETRIC_V1' && input.contentType === 'application/vnd.bers.garment-parametric+json';
  const full3d = input.tier === 'FULL_3D' && input.format === 'GLB_2_0' && input.contentType === 'model/gltf-binary';
  if (!parametric && !full3d) throw new Error('Invalid managed Garment representation tier/format contract');
}

function immutableTicket(ticket: AnyLocalExecutionTicket): AnyLocalExecutionTicket {
  const parameters = ticket.operation.parameters === undefined ? undefined : deepFreeze(structuredClone(ticket.operation.parameters));
  const common = {
    ...ticket,
    operation: Object.freeze({ ...ticket.operation, parameters }), scope: Object.freeze({ ...ticket.scope }),
    inputs: Object.freeze(ticket.inputs.map(input => Object.freeze({ ...input }))),
    expectedOutputs: Object.freeze(ticket.expectedOutputs.map(output => Object.freeze({ ...output, mimeTypes: output.mimeTypes ? Object.freeze([...output.mimeTypes]) : undefined }))),
    cost: Object.freeze({ paidCloudCredits: 0 as const, providerCalls: 0 as const }),
  };
  if (ticket.version === '1') return Object.freeze({ ...common, version: '1' as const, allowedModels: Object.freeze(ticket.allowedModels.map(model => Object.freeze({ ...model }))) }) as LocalExecutionTicket;
  const { managedInputs: _rawManagedInputs, ...v2Common } = common as typeof common & { managedInputs?: readonly LocalExecutionManagedGarmentInputBinding[] };
  return Object.freeze({
    ...v2Common,
    version: '2' as const,
    ...(ticket.managedInputs === undefined ? {} : { managedInputs: Object.freeze(ticket.managedInputs.map(input => Object.freeze({ ...input }))) }),
    allowedExecutors: Object.freeze(ticket.allowedExecutors.map(executor => Object.freeze({ ...executor }))),
  }) as LocalExecutionTicketV2;
}

function sameTicketBinding(a: AnyLocalExecutionTicket, b: AnyLocalExecutionTicket): boolean {
  if (a.version !== b.version) return false;
  const common = a.requestId === b.requestId && a.workflowId === b.workflowId && a.stepId === b.stepId && sameScope(a.scope, b.scope) &&
    canonicalJson(a.operation) === canonicalJson(b.operation) && a.policy === b.policy && canonicalJson(a.inputs) === canonicalJson(b.inputs) && canonicalJson(a.expectedOutputs) === canonicalJson(b.expectedOutputs);
  if (!common) return false;
  if (a.version === '1' && b.version === '1') return canonicalJson(a.allowedModels) === canonicalJson(b.allowedModels);
  if (a.version === '2' && b.version === '2') return canonicalJson(a.managedInputs) === canonicalJson(b.managedInputs) && canonicalJson(a.allowedExecutors) === canonicalJson(b.allowedExecutors);
  return false;
}

function requireV1(ticket: AnyLocalExecutionTicket): LocalExecutionTicket { if (ticket.version !== '1') throw new Error('Local execution ticket version conflict: expected v1'); return ticket; }
function requireV2(ticket: AnyLocalExecutionTicket): LocalExecutionTicketV2 { if (ticket.version !== '2') throw new Error('Local execution ticket version conflict: expected v2'); return ticket; }
function optionalV1(ticket: AnyLocalExecutionTicket | undefined): LocalExecutionTicket | undefined { return ticket === undefined ? undefined : requireV1(ticket); }
function optionalV2(ticket: AnyLocalExecutionTicket | undefined): LocalExecutionTicketV2 | undefined { return ticket === undefined ? undefined : requireV2(ticket); }
function requireDecisionV1(decision: AnyLocalExecutionAdmissionDecision): LocalExecutionAdmissionDecision { if (decision.allowed && decision.ticket.version !== '1') throw new Error('Local execution admission version conflict: expected v1'); return decision as LocalExecutionAdmissionDecision; }
function requireDecisionV2(decision: AnyLocalExecutionAdmissionDecision): LocalExecutionAdmissionDecisionV2 { if (decision.allowed && decision.ticket.version !== '2') throw new Error('Local execution admission version conflict: expected v2'); return decision as LocalExecutionAdmissionDecisionV2; }
function scopedIdempotencyKey(scope: Scope, idempotencyKey: string): string { return canonicalJson([scope.tenantId, scope.userId, scope.projectId, idempotencyKey]) ?? ''; }
function canonicalJson(value: unknown): string | undefined { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key, child]) => [key,canonicalValue(child)])); }
function immutableResultV1(result: LocalExecutionResult): LocalExecutionResult { return Object.freeze({ ...result, model: Object.freeze({ ...result.model }), outputs: Object.freeze(result.outputs.map(output => Object.freeze({ ...output }))), metrics: Object.freeze({ ...result.metrics }), benchmarkEvidence: result.benchmarkEvidence ? Object.freeze({ ...result.benchmarkEvidence }) : undefined }); }
function immutableResultV2(result: LocalExecutionResultV2): LocalExecutionResultV2 { return Object.freeze({ ...result, executor: Object.freeze({ ...result.executor }), outputs: Object.freeze(result.outputs.map(output => Object.freeze({ ...output }))), metrics: Object.freeze({ ...result.metrics }), benchmarkEvidence: result.benchmarkEvidence ? Object.freeze({ ...result.benchmarkEvidence }) : undefined }); }
function sameScope(a: Scope, b: Scope): boolean { return a.tenantId === b.tenantId && a.projectId === b.projectId && a.userId === b.userId; }
function denied(reasonCode: Exclude<LocalExecutionAdmissionReason,'ADMITTED'>): Readonly<{allowed:false;reasonCode:Exclude<LocalExecutionAdmissionReason,'ADMITTED'>}>{return Object.freeze({allowed:false,reasonCode});}
function containsForbiddenAuthority(value: unknown, seen = new Set<object>()): boolean { if (!value || typeof value !== 'object') return false; if (seen.has(value)) return false; seen.add(value); if (Array.isArray(value)) return value.some(item => containsForbiddenAuthority(item, seen)); for (const [key, child] of Object.entries(value as Record<string, unknown>)) { if (FORBIDDEN_RESULT_KEYS.has(key)) return true; if (containsForbiddenAuthority(child, seen)) return true; } return false; }
function isLocalExecutionResultV1(value: unknown): value is LocalExecutionResult { if (!commonResultShape(value)) return false; const result=value as Partial<LocalExecutionResult>; return result.ticketVersion==='1' && !!result.model && nonEmptyString(result.model.modelId) && nonEmptyString(result.model.version) && nonEmptyString(result.runtime) && MODEL_RUNTIMES.has(result.runtime) && validMetricsAndOutputs(result); }
function isLocalExecutionResultV2(value: unknown): value is LocalExecutionResultV2 { if (!commonResultShape(value)) return false; const result=value as Partial<LocalExecutionResultV2>; return result.ticketVersion==='2' && !!result.executor && validExecutor(result.executor) && nonEmptyString(result.runtime) && V2_RUNTIMES.has(result.runtime) && validMetricsAndOutputs(result); }
function commonResultShape(value: unknown): value is Record<string, unknown> { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const result=value as Record<string,unknown>; return [result.ticketId,result.requestId,result.workflowId,result.stepId,result.nonce].every(nonEmptyString) && nonEmptyString(result.accelerator) && ACCELERATORS.has(result.accelerator); }
function validMetricsAndOutputs(result: Partial<AnyLocalExecutionResult>): boolean { if (!Array.isArray(result.outputs) || !result.outputs.every(isOutputEvidence)) return false; if (!result.metrics || !finiteNonNegative(result.metrics.latencyMs)) return false; if (result.metrics.memoryBytes !== undefined && !finiteNonNegative(result.metrics.memoryBytes)) return false; if (result.metrics.vramBytes !== undefined && !finiteNonNegative(result.metrics.vramBytes)) return false; if (result.metrics.energyEstimate !== undefined && !finiteNonNegative(result.metrics.energyEstimate)) return false; return true; }
function validExecutor(value: unknown): value is LocalExecutionExecutorBinding { if (!value || typeof value !== 'object' || Array.isArray(value)) return false; const e=value as Record<string,unknown>; if(e.kind==='MODEL') return nonEmptyString(e.modelId)&&nonEmptyString(e.version)&&!('toolId' in e); if(e.kind==='DETERMINISTIC_TOOL') return nonEmptyString(e.toolId)&&nonEmptyString(e.version)&&!('modelId' in e); return false; }
function sameExecutor(a: LocalExecutionExecutorBinding, b: LocalExecutionExecutorBinding): boolean { if(a.kind!==b.kind)return false; if(a.kind==='MODEL'&&b.kind==='MODEL')return a.modelId===b.modelId&&a.version===b.version; if(a.kind==='DETERMINISTIC_TOOL'&&b.kind==='DETERMINISTIC_TOOL')return a.toolId===b.toolId&&a.version===b.version; return false; }
function sameResultIdentity(ticket: AnyLocalExecutionTicket, result: AnyLocalExecutionResult): boolean { return result.ticketId===ticket.ticketId&&result.ticketVersion===ticket.version&&result.requestId===ticket.requestId&&result.workflowId===ticket.workflowId&&result.stepId===ticket.stepId&&result.nonce===ticket.nonce; }
function isOutputEvidence(value: unknown): value is LocalExecutionOutputEvidence { if(!value||typeof value!=='object'||Array.isArray(value))return false; const o=value as Partial<LocalExecutionOutputEvidence>; return nonEmptyString(o.uploadId)&&nonEmptyString(o.kind)&&nonEmptyString(o.mimeType)&&nonEmptyString(o.sha256)&&SHA256.test(o.sha256)&&Number.isInteger(o.sizeBytes)&&Number(o.sizeBytes)>0&&(o.width===undefined||(Number.isInteger(o.width)&&Number(o.width)>0))&&(o.height===undefined||(Number.isInteger(o.height)&&Number(o.height)>0)); }
function outputsMatch(expected: readonly LocalExecutionExpectedOutput[], actual: readonly LocalExecutionOutputEvidence[]): boolean { const expectedCount=expected.reduce((sum,item)=>sum+item.count,0); if(actual.length!==expectedCount)return false; const remaining=actual.slice(); for(const contract of expected){for(let i=0;i<contract.count;i++){const index=remaining.findIndex(output=>output.kind===contract.kind&&output.role===contract.role&&(!contract.mimeTypes?.length||contract.mimeTypes.includes(output.mimeType))&&(contract.width===undefined||contract.width===output.width)&&(contract.height===undefined||contract.height===output.height)); if(index<0)return false; remaining.splice(index,1);}} return remaining.length===0; }
function assertExactKeys(value: object, expected: readonly string[]): void { const actual=Object.keys(value).sort(); const wanted=[...expected].sort(); if(actual.length!==wanted.length||actual.some((key,index)=>key!==wanted[index])) throw new Error('Managed Garment input contains unknown or missing fields'); }
function printableProvenance(value: unknown): value is string { return typeof value==='string' && value.length>=1 && value.length<=100 && !/[\u0000-\u001f\u007f]/u.test(value); }
function deepFreeze<T>(value:T):T { if(!value||typeof value!=='object'||Object.isFrozen(value))return value; Object.freeze(value); for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child); return value; }
function nonEmptyString(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function finiteNonNegative(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
