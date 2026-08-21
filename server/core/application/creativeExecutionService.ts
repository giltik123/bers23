import { createHash, randomUUID } from 'node:crypto';
import { CreativeExecutionPlatform, type CreativeArtifact, type CreativeExecutionPlatformDependencies, type CreativeRequest, type ProductionOutcome } from '../../../src/platform/creative/canonical/index.ts';

export type CreativeEditCommand = Readonly<{ projectId: string; instruction: string; selectedObjectIds?: readonly string[]; inputArtifactId: string; maskArtifactIds?: readonly string[]; preserveMode?: string; clientRequestId: string }>;
export type AuthenticatedScope = Readonly<{ tenantId: string; userId: string }>;
export type CreativeExecutionServiceDependencies = Readonly<{ platform: CreativeExecutionPlatformDependencies; ownsArtifacts(scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]): Promise<boolean>; hydrateArtifacts?(scope: AuthenticatedScope & { projectId: string }, originalId: string, maskIds: readonly string[]): Promise<readonly CreativeArtifact[]>; persistFinal?(scope: AuthenticatedScope & { projectId: string }, executionId: string, artifact: CreativeArtifact): Promise<CreativeArtifact>; mintFinalDelivery?(scope: AuthenticatedScope & { projectId: string }, storageId: string): string; creditsPerEdit?: number; hardBudgetCredits?: number; now?: () => number; id?: () => string }>;

/** Server application boundary: identity, scope and idempotency are authoritative here. */
export class CreativeExecutionService {
  readonly #inflight = new Map<string, Promise<ProductionOutcome>>();
  readonly #results = new Map<string, ProductionOutcome>();
  readonly #scopes = new Map<string, AuthenticatedScope>();
  readonly #platform: CreativeExecutionPlatform;
  constructor(private readonly dependencies: CreativeExecutionServiceDependencies) { this.#platform = new CreativeExecutionPlatform(dependencies.platform); }
  execute(command: CreativeEditCommand, auth: AuthenticatedScope, correlationId?: string): Promise<ProductionOutcome> {
    const key = `${auth.tenantId}:${auth.userId}:${command.projectId}:${command.clientRequestId}`;
    const prior = this.#inflight.get(key); if (prior) return prior;
    const task = this.#execute(command, auth, key, correlationId); this.#inflight.set(key, task); return task;
  }
  cancel(executionId: string, auth?: AuthenticatedScope): void { this.assertScope(executionId, auth); this.#platform.cancel(executionId); }
  status(executionId: string, auth?: AuthenticatedScope) { this.assertScope(executionId, auth); return this.#platform.status(executionId); }
  result(executionId: string, auth?: AuthenticatedScope) { this.assertScope(executionId, auth); return this.#results.get(executionId); }
  deliveryUrl(artifact: CreativeArtifact): string | undefined { const storageId = artifact.metadata?.storageId; return artifact.role === 'COMPOSITE' && artifact.state === 'FINAL' && typeof storageId === 'string' && this.dependencies.mintFinalDelivery ? this.dependencies.mintFinalDelivery(artifact.scope, storageId) : undefined; }
  async #execute(command: CreativeEditCommand, auth: AuthenticatedScope, key: string, correlationId?: string): Promise<ProductionOutcome> {
    const artifacts = [command.inputArtifactId, ...(command.maskArtifactIds ?? [])];
    const scope = Object.freeze({
      tenantId: auth.tenantId,
      userId: auth.userId,
      projectId: command.projectId,
    });
    if (!await this.dependencies.ownsArtifacts(scope, artifacts)) throw publicError('scope_denied', 'Artifact scope is not authorized', 403, false);
    const executionId = `creative-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
    this.#scopes.set(executionId, auth);
    const requestCorrelationId = correlationId ?? randomUUID();
    const estimatedCredits = this.dependencies.creditsPerEdit ?? 1; const hardBudgetCredits = this.dependencies.hardBudgetCredits ?? estimatedCredits;
    const controlled = Boolean(command.maskArtifactIds?.length && command.selectedObjectIds?.length);
    const hydrated = controlled && this.dependencies.hydrateArtifacts
      ? await this.dependencies.hydrateArtifacts(scope, command.inputArtifactId, command.maskArtifactIds ?? [])
      : artifacts.map((id, index) => ({ id, kind: 'image', value: { artifactId: id }, producerOperationId: 'user-input', scope, state: 'AVAILABLE', role: index ? 'MASK' : 'ORIGINAL' } as CreativeArtifact));
    const request: CreativeRequest = { id: executionId, intent: command.instruction, scope, inputArtifacts: hydrated, budget: { credits: hardBudgetCredits, aiCalls: 1, latencyMs: 120_000, ramMb: 2048, gpuMs: 120_000, retries: 0 }, metadata: { idempotencyKey: command.clientRequestId, estimatedCredits, requestId: requestCorrelationId, correlationId: requestCorrelationId, editCapability: controlled ? 'CONTROLLED_LOCAL_EDIT' : 'GLOBAL_EDIT', preserveMode: command.preserveMode ?? 'STRICT', selectedObjectIds: command.selectedObjectIds ?? [], maskArtifactIds: command.maskArtifactIds ?? [] } };
    this.#platform.createExecution(request); await this.#platform.plan(executionId); await this.#platform.compile(executionId); let outcome = await this.#platform.execute(executionId);
    if (controlled && outcome.status === 'SUCCESS' && outcome.verification.valid && this.dependencies.persistFinal) {
      const composite = outcome.artifacts.find(artifact => artifact.role === 'COMPOSITE' && artifact.state === 'FINAL');
      if (!composite) throw new Error('Verified FINAL COMPOSITE is missing');
      const durable = await this.dependencies.persistFinal(scope, executionId, composite);
      outcome = Object.freeze({ ...outcome, artifacts: Object.freeze(outcome.artifacts.map(artifact => artifact === composite ? durable : artifact)) });
    }
    this.#results.set(executionId, outcome); return outcome;
  }
  private assertScope(executionId: string, auth?: AuthenticatedScope) { if (!auth) return; const scope = this.#scopes.get(executionId); if (!scope) throw publicError('result_not_found', 'Result is not available', 404, false); if (scope.tenantId !== auth.tenantId || scope.userId !== auth.userId) throw publicError('scope_denied', 'Execution scope is not authorized', 403, false); }
}
export function publicError(code: string, message: string, status: number, retryable: boolean) { return Object.assign(new Error(message), { code, status, retryable }); }
