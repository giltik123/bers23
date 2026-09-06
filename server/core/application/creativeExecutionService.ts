import { createHash, randomUUID } from 'node:crypto';
import { CreativeExecutionPlatform, type CreativeArtifact, type CreativeExecutionPlatformRuntimeDependencies, type CreativeRequest, type ProductionOutcome } from '../../../src/platform/creative/canonical/index.ts';
import type { ExecutionRun, ExecutionRunRegistry } from '../execution/executionRunRegistry.ts';

export type CreativeEditCommand = Readonly<{ projectId: string; instruction: string; selectedObjectIds?: readonly string[]; inputArtifactId: string; maskArtifactIds?: readonly string[]; preserveMode?: string; clientRequestId: string }>;
export type AuthenticatedScope = Readonly<{ tenantId: string; userId: string }>;
export type CreativeArtifactReplayIdentities = Readonly<{ inputArtifactIdentity: string; maskArtifactIdentities: readonly string[] }>;
export type CreativeExecutionServiceDependencies = Readonly<{
  platform: CreativeExecutionPlatformRuntimeDependencies;
  ownsArtifacts(scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]): Promise<boolean>;
  /**
   * Production must reduce signed capability envelopes to signature-verified,
   * stable artifact identities before request fingerprinting. Optional only for
   * isolated fixtures whose artifact IDs are already stable semantic identities.
   */
  resolveArtifactReplayIdentities?(scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]): Promise<readonly string[]>;
  hydrateArtifacts?(scope: AuthenticatedScope & { projectId: string }, originalId: string, maskIds: readonly string[]): Promise<readonly CreativeArtifact[]>;
  persistFinal?(scope: AuthenticatedScope & { projectId: string }, executionId: string, artifact: CreativeArtifact): Promise<CreativeArtifact>;
  mintFinalDelivery?(scope: AuthenticatedScope & { projectId: string }, storageId: string): string;
  /**
   * Optional only for isolated service-level fixtures. Production composition is
   * required to supply this port so provider/Billing work cannot exist without
   * a durable run identity.
   */
  executionRuns?: ExecutionRunRegistry;
  creditsPerEdit?: number;
  hardBudgetCredits?: number;
  now?: () => number;
  id?: () => string;
}>;

type CreativeSettlement = Readonly<{ error?: unknown }>;
type CreativeSettlementRecord = Readonly<{ promise: Promise<CreativeSettlement> }>;
type CreativeInflight = Readonly<{ fingerprint: Promise<string>; promise: Promise<ProductionOutcome> }>;
const CREATIVE_CANCEL_REASON = 'CREATIVE_EXECUTION_CANCELLED';
const CREATIVE_REPLAY_IDENTITY_VERSION = 'creative-request-v1';

export function creativeRequestFingerprint(command: CreativeEditCommand, artifacts: CreativeArtifactReplayIdentities): string {
  const canonical = JSON.stringify({
    version: CREATIVE_REPLAY_IDENTITY_VERSION,
    instruction: command.instruction,
    inputArtifactIdentity: artifacts.inputArtifactIdentity,
    maskArtifactIdentities: [...artifacts.maskArtifactIdentities],
    selectedObjectIds: [...(command.selectedObjectIds ?? [])],
    preserveMode: command.preserveMode ?? 'STRICT',
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function creativeExecutionRunIdempotencyKey(command: CreativeEditCommand, fingerprint: string): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([CREATIVE_REPLAY_IDENTITY_VERSION, command.clientRequestId, fingerprint]))
    .digest('hex');
  return `${CREATIVE_REPLAY_IDENTITY_VERSION}:${digest}`;
}

/** Server application boundary: identity, scope and idempotency are authoritative here. */
export class CreativeExecutionService {
  readonly #inflight = new Map<string, CreativeInflight>();
  readonly #results = new Map<string, ProductionOutcome>();
  readonly #scopes = new Map<string, AuthenticatedScope>();
  readonly #durableRuns = new Map<string, Readonly<{ scope: AuthenticatedScope & { projectId: string }; runId: string }>>();
  readonly #settlements = new Map<string, CreativeSettlementRecord>();
  readonly #cancelRequests = new Set<string>();
  readonly #platform: CreativeExecutionPlatform;
  constructor(private readonly dependencies: CreativeExecutionServiceDependencies) { this.#platform = new CreativeExecutionPlatform(dependencies.platform); }
  execute(command: CreativeEditCommand, auth: AuthenticatedScope, correlationId?: string): Promise<ProductionOutcome> {
    const key = `${auth.tenantId}:${auth.userId}:${command.projectId}:${command.clientRequestId}`;
    const fingerprint = this.#resolveFingerprint(command, auth);
    const prior = this.#inflight.get(key);
    if (prior) return joinSameProcessReplay(prior, fingerprint);

    const task = fingerprint.then(value => this.#execute(command, auth, key, value, correlationId));
    this.#inflight.set(key, Object.freeze({ fingerprint, promise: task }));
    void task.catch(() => {
      const current = this.#inflight.get(key);
      if (current?.promise === task) this.#inflight.delete(key);
    });
    return task;
  }
  async cancel(executionId: string, auth?: AuthenticatedScope): Promise<void> {
    this.assertScope(executionId, auth);
    const settlement = this.#settlements.get(executionId);
    if (!settlement) throw publicError('creative_cancel_unavailable', 'Creative execution is not actively cancellable', 409, false);
    const status = this.#platform.status(executionId);
    if (!['READY', 'SKIPPED'].includes(status)) throw publicError('creative_cancel_unavailable', 'Creative execution is not actively cancellable', 409, false);
    if (status !== 'SKIPPED' && !this.#cancelRequests.has(executionId)) {
      // Active FAL owns an AbortController and stops immediately. During the
      // atomic compile/reservation phase there is no runtime owner yet, so false
      // is expected and the READY-scoped request is latched for safe release.
      this.dependencies.platform.runtime.cancel?.(executionId);
      this.#cancelRequests.add(executionId);
    }
    const settled = await settlement.promise;
    if (!isCreativeCancellation(settled.error)) {
      this.#cancelRequests.delete(executionId);
      throw publicError('creative_cancel_reconciliation_required', 'Creative cancellation could not be reconciled safely', 409, true);
    }
    // Billing/provider unwind is complete at this point. Canonical Creative truth
    // changes before the durable projection, preserving the owning-authority law.
    if (this.#platform.status(executionId) !== 'SKIPPED') this.#platform.cancel(executionId);
    const binding = this.#durableRuns.get(executionId);
    if (binding && this.dependencies.executionRuns) await this.dependencies.executionRuns.cancel(binding.scope, binding.runId, CREATIVE_CANCEL_REASON);
    this.#cancelRequests.delete(executionId);
  }
  status(executionId: string, auth?: AuthenticatedScope) { this.assertScope(executionId, auth); return this.#platform.status(executionId); }
  result(executionId: string, auth?: AuthenticatedScope) { this.assertScope(executionId, auth); return this.#results.get(executionId); }
  deliveryUrl(artifact: CreativeArtifact): string | undefined { const storageId = artifact.metadata?.storageId; return artifact.role === 'COMPOSITE' && artifact.state === 'FINAL' && typeof storageId === 'string' && this.dependencies.mintFinalDelivery ? this.dependencies.mintFinalDelivery(artifact.scope, storageId) : undefined; }

  async #resolveFingerprint(command: CreativeEditCommand, auth: AuthenticatedScope): Promise<string> {
    const scope = Object.freeze({ tenantId: auth.tenantId, userId: auth.userId, projectId: command.projectId });
    const references = Object.freeze([command.inputArtifactId, ...(command.maskArtifactIds ?? [])]);
    let identities: readonly string[];
    if (this.dependencies.resolveArtifactReplayIdentities) {
      try {
        identities = await this.dependencies.resolveArtifactReplayIdentities(scope, references);
      } catch (error) {
        if ((error as { code?: unknown })?.code !== 'ARTIFACT_REFERENCE_DENIED') throw error;
        throw publicError('scope_denied', 'Artifact scope is not authorized', 403, false);
      }
      if (identities.length !== references.length || identities.some(value => typeof value !== 'string' || value.length === 0)) {
        throw new Error('Artifact replay identity resolver violated its exact cardinality contract');
      }
    } else {
      identities = references;
    }
    return creativeRequestFingerprint(command, Object.freeze({
      inputArtifactIdentity: identities[0],
      maskArtifactIdentities: Object.freeze(identities.slice(1)),
    }));
  }

  async #execute(command: CreativeEditCommand, auth: AuthenticatedScope, key: string, fingerprint: string, correlationId?: string): Promise<ProductionOutcome> {
    const scope = Object.freeze({
      tenantId: auth.tenantId,
      userId: auth.userId,
      projectId: command.projectId,
    });
    const executionId = `creative-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
    const durableIdempotencyKey = creativeExecutionRunIdempotencyKey(command, fingerprint);

    if (this.dependencies.executionRuns) {
      const existing = await this.dependencies.executionRuns.getByAuthority(scope, 'CREATIVE_EXECUTION', executionId);
      if (existing) throw classifyCreativeReplay(existing, command.clientRequestId, durableIdempotencyKey);
    }

    const artifacts = [command.inputArtifactId, ...(command.maskArtifactIds ?? [])];
    if (!await this.dependencies.ownsArtifacts(scope, artifacts)) throw publicError('scope_denied', 'Artifact scope is not authorized', 403, false);
    const requestCorrelationId = correlationId ?? randomUUID();
    const estimatedCredits = this.dependencies.creditsPerEdit ?? 1; const hardBudgetCredits = this.dependencies.hardBudgetCredits ?? estimatedCredits;
    const controlled = Boolean(command.maskArtifactIds?.length && command.selectedObjectIds?.length);
    const hydrated = controlled && this.dependencies.hydrateArtifacts
      ? await this.dependencies.hydrateArtifacts(scope, command.inputArtifactId, command.maskArtifactIds ?? [])
      : artifacts.map((id, index) => ({ id, kind: 'image', value: { artifactId: id }, producerOperationId: 'user-input', scope, state: 'AVAILABLE', role: index ? 'MASK' : 'ORIGINAL' } as CreativeArtifact));
    const request: CreativeRequest = { id: executionId, intent: command.instruction, scope, inputArtifacts: hydrated, budget: { credits: hardBudgetCredits, aiCalls: 1, latencyMs: 120_000, ramMb: 2048, gpuMs: 120_000, retries: 0 }, metadata: { idempotencyKey: command.clientRequestId, estimatedCredits, requestId: requestCorrelationId, correlationId: requestCorrelationId, editCapability: controlled ? 'CONTROLLED_LOCAL_EDIT' : 'GLOBAL_EDIT', preserveMode: command.preserveMode ?? 'STRICT', selectedObjectIds: command.selectedObjectIds ?? [], maskArtifactIds: command.maskArtifactIds ?? [] } };

    // Replay/conflicting-key classification is completed above before planning.
    // Planning remains advisory/pure and must not reserve Billing or dispatch a
    // runtime. The durable run is issued only once the request can enter the
    // side-effecting Creative authority lifecycle.
    this.#platform.createExecution(request);
    await this.#platform.plan(executionId);

    let durableRun: Awaited<ReturnType<ExecutionRunRegistry['issue']>>['run'] | undefined;
    if (this.dependencies.executionRuns) {
      let issued: Awaited<ReturnType<ExecutionRunRegistry['issue']>>;
      try {
        issued = await this.dependencies.executionRuns.issue({
          scope,
          capability: 'CREATIVE_EXECUTION',
          idempotencyKey: durableIdempotencyKey,
          authorityKind: 'CREATIVE_EXECUTION',
          authorityRef: executionId,
        });
      } catch (error) {
        if ((error as { code?: unknown })?.code === 'execution_run_authority_already_bound') {
          const concurrent = await this.dependencies.executionRuns.getByAuthority(scope, 'CREATIVE_EXECUTION', executionId);
          if (concurrent) throw classifyCreativeReplay(concurrent, command.clientRequestId, durableIdempotencyKey);
        }
        throw error;
      }
      if (!issued.created) throw classifyCreativeReplay(issued.run, command.clientRequestId, durableIdempotencyKey);
      durableRun = issued.run;
      // RUNNING begins before compile because compile performs canonical Billing
      // reservation. No financial/provider side effect may occur while the
      // durable projection still claims QUEUED.
      await this.dependencies.executionRuns.start(scope, durableRun.runId);
      this.#durableRuns.set(executionId, Object.freeze({ scope, runId: durableRun.runId }));
    }

    this.#scopes.set(executionId, auth);
    let resolveSettlement!: (value: CreativeSettlement) => void;
    const settlementPromise = new Promise<CreativeSettlement>((resolve) => { resolveSettlement = resolve; });
    this.#settlements.set(executionId, Object.freeze({ promise: settlementPromise }));
    let settlementError: unknown;
    try {
      await this.#platform.compile(executionId);
      if (this.#cancelRequests.has(executionId)) {
        await this.#platform.cancelPreparedExecution(executionId);
        throw new DOMException('Creative execution cancelled', 'AbortError');
      }
      let outcome = await this.#platform.execute(executionId);
      if (controlled && outcome.status === 'SUCCESS' && outcome.verification.valid && this.dependencies.persistFinal) {
        const composite = outcome.artifacts.find(artifact => artifact.role === 'COMPOSITE' && artifact.state === 'FINAL');
        if (!composite) throw new Error('Verified FINAL COMPOSITE is missing');
        const durable = await this.dependencies.persistFinal(scope, executionId, composite);
        outcome = Object.freeze({ ...outcome, artifacts: Object.freeze(outcome.artifacts.map(artifact => artifact === composite ? durable : artifact)) });
      }

      if (durableRun && this.dependencies.executionRuns) {
        if (outcome.status === 'SUCCESS') {
          await this.dependencies.executionRuns.succeed(scope, durableRun.runId);
        } else if (outcome.status === 'FAILED') {
          await this.dependencies.executionRuns.fail(scope, durableRun.runId, 'CREATIVE_OUTCOME_FAILED');
        } else if (outcome.status === 'UNKNOWN') {
          // Deliberately retain RUNNING. Provider/Billing reconciliation is the
          // owning authority for resolving UNKNOWN; declaring FAILED/CANCELLED
          // here would create false terminal truth.
        }
      }
      this.#results.set(executionId, outcome);
      return outcome;
    } catch (error) {
      settlementError = error;
      const cancellationRequested = this.#cancelRequests.has(executionId);
      const confirmedCancellation = cancellationRequested && isCreativeCancellation(error);
      if (durableRun && this.dependencies.executionRuns && !confirmedCancellation) await this.dependencies.executionRuns.fail(scope, durableRun.runId, 'CREATIVE_EXECUTION_ERROR');
      if (cancellationRequested) {
        if (confirmedCancellation) throw publicError('creative_execution_cancelled', 'Creative execution was cancelled', 409, false);
        throw publicError('creative_cancel_reconciliation_required', 'Creative cancellation could not be reconciled safely', 409, true);
      }
      throw error;
    } finally {
      resolveSettlement(Object.freeze(settlementError === undefined ? {} : { error: settlementError }));
    }
  }
  private assertScope(executionId: string, auth?: AuthenticatedScope) { if (!auth) return; const scope = this.#scopes.get(executionId); if (!scope) throw publicError('result_not_found', 'Result is not available', 404, false); if (scope.tenantId !== auth.tenantId || scope.userId !== auth.userId) throw publicError('scope_denied', 'Execution scope is not authorized', 403, false); }
}

async function joinSameProcessReplay(prior: CreativeInflight, fingerprint: Promise<string>): Promise<ProductionOutcome> {
  const [acceptedFingerprint, replayFingerprint] = await Promise.all([prior.fingerprint, fingerprint]);
  if (acceptedFingerprint !== replayFingerprint) throw creativeIdempotencyConflict();
  return prior.promise;
}
function classifyCreativeReplay(existing: ExecutionRun, legacyClientRequestId: string, durableIdempotencyKey: string): Error {
  if (existing.idempotencyKey === durableIdempotencyKey || existing.idempotencyKey === legacyClientRequestId) {
    return publicError(
      'creative_reconciliation_required',
      'Creative execution already has a durable run and requires reconciliation before redispatch',
      409,
      true,
    );
  }
  return creativeIdempotencyConflict();
}
function creativeIdempotencyConflict(): Error { return publicError('creative_idempotency_conflict', 'Creative clientRequestId is already bound to a different request payload', 409, false); }
function isCreativeCancellation(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }
export function publicError(code: string, message: string, status: number, retryable: boolean) { return Object.assign(new Error(message), { code, status, retryable }); }
