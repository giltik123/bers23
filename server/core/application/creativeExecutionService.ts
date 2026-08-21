import { createHash, randomUUID } from 'node:crypto';
import { CreativeExecutionPlatform, type CreativeExecutionPlatformDependencies, type CreativeRequest, type ProductionOutcome } from '../../../src/platform/creative/canonical/index.ts';

export type CreativeEditCommand = Readonly<{ projectId: string; instruction: string; selectedObjectIds?: readonly string[]; inputArtifactId: string; maskArtifactIds?: readonly string[]; preserveMode?: string; clientRequestId: string }>;
export type AuthenticatedScope = Readonly<{ tenantId: string; userId: string }>;
export type CreativeExecutionServiceDependencies = Readonly<{ platform: CreativeExecutionPlatformDependencies; ownsArtifacts(scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]): Promise<boolean>; creditsPerEdit?: number; hardBudgetCredits?: number; now?: () => number; id?: () => string }>;

/** Server application boundary: identity, scope and idempotency are authoritative here. */
export class CreativeExecutionService {
  readonly #inflight = new Map<string, Promise<ProductionOutcome>>();
  readonly #results = new Map<string, ProductionOutcome>();
  readonly #platform: CreativeExecutionPlatform;
  constructor(private readonly dependencies: CreativeExecutionServiceDependencies) { this.#platform = new CreativeExecutionPlatform(dependencies.platform); }
  execute(command: CreativeEditCommand, auth: AuthenticatedScope, correlationId?: string): Promise<ProductionOutcome> {
    const key = `${auth.tenantId}:${auth.userId}:${command.projectId}:${command.clientRequestId}`;
    const prior = this.#inflight.get(key); if (prior) return prior;
    const task = this.#execute(command, auth, key, correlationId); this.#inflight.set(key, task); return task;
  }
  cancel(executionId: string): void { this.#platform.cancel(executionId); }
  status(executionId: string) { return this.#platform.status(executionId); }
  result(executionId: string) { return this.#results.get(executionId); }
  async #execute(command: CreativeEditCommand, auth: AuthenticatedScope, key: string, correlationId?: string): Promise<ProductionOutcome> {
    const artifacts = [command.inputArtifactId, ...(command.maskArtifactIds ?? [])];
    const scope = Object.freeze({
      tenantId: auth.tenantId,
      userId: auth.userId,
      projectId: command.projectId,
    });
    if (!await this.dependencies.ownsArtifacts(scope, artifacts)) throw publicError('scope_denied', 'Artifact scope is not authorized', 403, false);
    const executionId = `creative-${createHash('sha256').update(key).digest('hex').slice(0, 24)}`;
    const requestCorrelationId = correlationId ?? randomUUID();
    const estimatedCredits = this.dependencies.creditsPerEdit ?? 1; const hardBudgetCredits = this.dependencies.hardBudgetCredits ?? estimatedCredits;
    const request: CreativeRequest = { id: executionId, intent: command.instruction, scope, inputArtifacts: artifacts.map((id) => ({ id, kind: 'image', value: { artifactId: id }, producerOperationId: 'user-input', scope, state: 'AVAILABLE' })), budget: { credits: hardBudgetCredits, aiCalls: 1, latencyMs: 120_000, ramMb: 2048, gpuMs: 120_000, retries: 0 }, metadata: { idempotencyKey: command.clientRequestId, estimatedCredits, requestId: requestCorrelationId, correlationId: requestCorrelationId, preserveMode: command.preserveMode, selectedObjectIds: command.selectedObjectIds ?? [] } };
    this.#platform.createExecution(request); await this.#platform.plan(executionId); await this.#platform.compile(executionId); const outcome = await this.#platform.execute(executionId); this.#results.set(executionId, outcome); return outcome;
  }
}
export function publicError(code: string, message: string, status: number, retryable: boolean) { return Object.assign(new Error(message), { code, status, retryable }); }
