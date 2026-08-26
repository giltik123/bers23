import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  CreativeExecutionPlatform,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type LocalExecutionTicketV2,
  type ProductionOutcome,
} from '../../../src/platform/creative/canonical/index.ts';
import {
  BACKGROUND_ISOLATION_CAPABILITY,
  BACKGROUND_ISOLATION_TOOL_ID,
  BACKGROUND_ISOLATION_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import { BackgroundIsolationResultAuthority } from './LocalExecutionResultAuthority.ts';
import type { PostgresLocalExecutionUploadStore } from './PostgresLocalExecutionUploadStore.ts';

const STEP_ID = 'background-isolation';
const IDEMPOTENCY_SUFFIX = `:${STEP_ID}:local-v2`;

export type LocalBackgroundIsolationPrepareCommand = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  maskArtifactId: string;
  clientRequestId: string;
}>;

export type LocalDeterministicImageSubmission = Readonly<{
  executionId: string;
  status: ProductionOutcome['status'];
  artifactId?: string;
  outcome: ProductionOutcome;
}>;

export type LocalDeterministicImageServiceDependencies = Readonly<{
  platform: CreativeExecutionPlatformRuntimeDependencies;
  ownsArtifacts: (scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: AuthenticatedScope & { projectId: string }, sourceId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
  admission: LocalExecutionLedgerV2;
  uploads: PostgresLocalExecutionUploadStore;
  persistFinal: (scope: AuthenticatedScope & { projectId: string }, executionId: string, operationId: string, image: PixelImage) => Promise<Readonly<{ storageId: string; width: number; height: number }>>;
  loadPersistedFinal: (executionId: string, scope: AuthenticatedScope & { projectId: string }) => Promise<Readonly<{ storageId: string; width: number; height: number }> | undefined>;
  issueFinalId: (storageId: string, scope: AuthenticatedScope & { projectId: string }) => string;
  now?: () => number;
}>;

/**
 * C2 application boundary for deterministic on-device image tools.
 * The browser computes candidate bytes only. This service rehydrates canonical
 * inputs, recomputes expected pixels server-side and publishes a FINAL only
 * after exact verification. It intentionally has no provider or Billing port.
 */
export class LocalDeterministicImageExecutionService {
  readonly #platform: CreativeExecutionPlatform;
  readonly #now: () => number;
  readonly #results: BackgroundIsolationResultAuthority;

  constructor(private readonly dependencies: LocalDeterministicImageServiceDependencies) {
    this.#platform = new CreativeExecutionPlatform(dependencies.platform);
    this.#now = dependencies.now ?? Date.now;
    this.#results = new BackgroundIsolationResultAuthority(dependencies, { capability: BACKGROUND_ISOLATION_CAPABILITY, stepId: STEP_ID });
  }

  async prepareBackgroundIsolation(command: LocalBackgroundIsolationPrepareCommand, auth: AuthenticatedScope): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>> {
    const normalized = normalizePrepare(command);
    const scope = Object.freeze({ ...auth, projectId: normalized.projectId });
    const executionId = deterministicExecutionId(scope, normalized.clientRequestId);
    const idempotencyKey = ticketIdempotencyKey(normalized.clientRequestId);

    const durable = await this.dependencies.admission.getByIdempotencyKeyV2(scope, idempotencyKey);
    if (durable) {
      await this.validateDurablePrepareTicket(durable, normalized, scope, executionId);
      return Object.freeze({ executionId, ticket: durable });
    }

    if (!await this.dependencies.ownsArtifacts(scope, [normalized.sourceArtifactId, normalized.maskArtifactId])) throw serviceError(403, 'artifact_scope_denied', 'Source IMAGE or MASK is outside the authenticated project scope');
    const artifacts = await this.hydrateExactInputs(scope, normalized.sourceArtifactId, normalized.maskArtifactId);
    if (!this.#platform.hasExecution(executionId)) this.createPlatformExecution(executionId, scope, artifacts, normalized.clientRequestId, normalized.sourceArtifactId, normalized.maskArtifactId);
    const plan = await this.#platform.plan(executionId);
    assertReadyPlan(plan.status, plan.operations);
    const tickets = await this.#platform.prepareLocalExecutionV2(executionId);
    if (tickets.length !== 1) throw serviceError(500, 'local_ticket_contract_error', 'Expected exactly one deterministic local execution ticket');
    const ticket = tickets[0];
    assertBackgroundIsolationTicket(ticket);
    if (ticket.idempotencyKey !== idempotencyKey) throw serviceError(500, 'local_ticket_idempotency_contract', 'Canonical deterministic ticket idempotency binding is invalid');
    assertInputBindings(ticket, normalized.sourceArtifactId, normalized.maskArtifactId);
    return Object.freeze({ executionId, ticket });
  }

  async uploadImage(input: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>, auth: AuthenticatedScope) {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local execution ticket has expired');
    const expected = ticket.expectedOutputs[0];
    if (ticket.expectedOutputs.length !== 1 || expected.kind !== 'image' || expected.role !== 'COMPOSITE' || expected.mimeTypes?.length !== 1 || expected.mimeTypes[0] !== 'image/png') throw serviceError(409, 'local_output_contract_error', 'Ticket is not a single PNG COMPOSITE output contract');
    const decoded = await decodePngRgba(input.bytes);
    if (decoded.width !== expected.width || decoded.height !== expected.height) throw serviceError(400, 'local_image_dimensions_mismatch', 'Uploaded image dimensions do not match the ticket');
    const upload = await this.dependencies.uploads.persist({
      ticketId: ticket.ticketId,
      scope: ticket.scope,
      kind: 'image',
      role: 'COMPOSITE',
      mimeType: 'image/png',
      width: decoded.width,
      height: decoded.height,
      bytes: input.bytes,
      expiresAt: ticket.expiresAt,
      now: this.#now(),
    });
    return Object.freeze({ uploadId: upload.uploadId, kind: 'image', role: 'COMPOSITE' as const, sha256: upload.sha256, sizeBytes: upload.sizeBytes, mimeType: upload.mimeType, width: upload.width, height: upload.height });
  }

  async submit(input: Readonly<{ ticketId: string; projectId: string; result: unknown }>, auth: AuthenticatedScope): Promise<LocalDeterministicImageSubmission> {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    return this.#results.submit({
      ticket,
      result: input.result,
      verify: async ({ ticket: admittedTicket, result, artifact }) => {
        const sourceBinding = admittedTicket.inputs.find(binding => binding.kind === 'image');
        const maskBinding = admittedTicket.inputs.find(binding => binding.kind === 'mask');
        if (!sourceBinding || !maskBinding) throw serviceError(409, 'local_execution_recovery_input', 'Durable deterministic ticket lacks IMAGE + MASK bindings');
        const artifacts = await this.hydrateExactInputs(admittedTicket.scope, sourceBinding.artifactId, maskBinding.artifactId);
        await this.ensurePlatformExecution(admittedTicket, artifacts);
        const existingOutcome = this.#platform.result(admittedTicket.requestId);
        return existingOutcome ?? await this.#platform.completeLocalExecution(admittedTicket.requestId, {
          ticketId: admittedTicket.ticketId,
          stepId: admittedTicket.stepId,
          artifact,
          latencyMs: result.metrics.latencyMs,
          memoryMb: result.metrics.memoryBytes === undefined ? undefined : result.metrics.memoryBytes / (1024 * 1024),
        });
      },
    });
  }

  private async requireTicket(ticketId: string, auth: AuthenticatedScope, projectId: string): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw serviceError(404, 'local_ticket_not_found', 'Local execution ticket not found');
    assertSameScope(ticket.scope, { ...auth, projectId });
    assertBackgroundIsolationTicket(ticket);
    return ticket;
  }

  private async validateDurablePrepareTicket(ticket: LocalExecutionTicketV2, command: LocalBackgroundIsolationPrepareCommand, scope: AuthenticatedScope & { projectId: string }, executionId: string): Promise<void> {
    assertSameScope(ticket.scope, scope);
    assertBackgroundIsolationTicket(ticket);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local execution ticket has expired');
    if (ticket.requestId !== executionId || ticket.workflowId !== executionId || ticket.idempotencyKey !== ticketIdempotencyKey(command.clientRequestId)) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to another deterministic execution');
    assertInputBindings(ticket, command.sourceArtifactId, command.maskArtifactId);
    if (!await this.dependencies.ownsArtifacts(scope, [command.sourceArtifactId, command.maskArtifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical deterministic inputs are no longer authorized or available');
    const artifacts = await this.hydrateExactInputs(scope, command.sourceArtifactId, command.maskArtifactId);
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical local execution input revalidation failed: ${decision.reasonCode}`);
  }

  private async hydrateExactInputs(scope: AuthenticatedScope & { projectId: string }, sourceArtifactId: string, maskArtifactId: string): Promise<readonly CreativeArtifact[]> {
    try {
      const artifacts = await this.dependencies.hydrateArtifacts(scope, sourceArtifactId, [maskArtifactId]);
      const source = artifacts.find(artifact => artifact.id === sourceArtifactId && artifact.kind === 'image');
      const mask = artifacts.find(artifact => artifact.id === maskArtifactId && artifact.kind === 'mask' && artifact.role === 'MASK');
      if (!source || !mask) throw new Error('Canonical source or mask was not hydrated');
      if (!source.image?.width || !source.image.height || source.image.width !== mask.image?.width || source.image.height !== mask.image?.height) throw new Error('Canonical deterministic input geometry mismatch');
      if (!artifactHash(source) || !artifactHash(mask)) throw new Error('Canonical deterministic input integrity hash is missing');
      return artifacts;
    } catch (error) {
      throw serviceError(409, 'local_input_lineage_unavailable', error instanceof Error ? error.message : 'Canonical deterministic input lineage is unavailable');
    }
  }

  private async ensurePlatformExecution(ticket: LocalExecutionTicketV2, artifacts: readonly CreativeArtifact[]): Promise<void> {
    if (this.#platform.hasExecution(ticket.requestId)) return;
    const sourceBinding = ticket.inputs.find(binding => binding.kind === 'image');
    const maskBinding = ticket.inputs.find(binding => binding.kind === 'mask');
    if (!sourceBinding || !maskBinding) throw serviceError(409, 'local_execution_recovery_input', 'Durable deterministic ticket lacks IMAGE + MASK bindings');
    const clientRequestId = clientRequestIdFromTicket(ticket);
    this.createPlatformExecution(ticket.requestId, ticket.scope, artifacts, clientRequestId, sourceBinding.artifactId, maskBinding.artifactId);
    const plan = await this.#platform.plan(ticket.requestId);
    assertReadyPlan(plan.status, plan.operations);
    const recovered = await this.#platform.prepareLocalExecutionV2(ticket.requestId);
    if (recovered.length !== 1 || !sameDurableTicket(recovered[0], ticket)) throw serviceError(409, 'local_execution_recovery_mismatch', 'Reconstructed canonical deterministic execution does not match the durable ticket');
  }

  private createPlatformExecution(executionId: string, scope: AuthenticatedScope & { projectId: string }, artifacts: readonly CreativeArtifact[], clientRequestId: string, sourceArtifactId: string, maskArtifactId: string): void {
    this.#platform.createExecution({
      id: executionId,
      intent: 'isolate subject from background',
      scope,
      inputArtifacts: artifacts,
      budget: { credits: 0, aiCalls: 0, retries: 0 },
      metadata: {
        operationIntent: 'BACKGROUND_ISOLATION',
        sourceArtifactId,
        maskArtifactId,
        idempotencyKey: clientRequestId,
        planningConstraints: { executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 },
      },
    });
  }
}

function normalizePrepare(command: LocalBackgroundIsolationPrepareCommand): LocalBackgroundIsolationPrepareCommand {
  const projectId = command?.projectId?.trim(); const sourceArtifactId = command?.sourceArtifactId?.trim(); const maskArtifactId = command?.maskArtifactId?.trim(); const clientRequestId = command?.clientRequestId?.trim();
  if (!projectId || !sourceArtifactId || !maskArtifactId || !clientRequestId) throw serviceError(400, 'invalid_background_isolation_request', 'projectId, sourceArtifactId, maskArtifactId and clientRequestId are required');
  if (sourceArtifactId === maskArtifactId) throw serviceError(400, 'invalid_background_isolation_request', 'Source IMAGE and MASK identities must be distinct');
  return Object.freeze({ projectId, sourceArtifactId, maskArtifactId, clientRequestId });
}
function assertReadyPlan(status: string | undefined, operations: readonly Readonly<{ type: string; id: string }>[]): void {
  if (status !== 'READY' || operations.length !== 1 || operations[0].type !== 'BACKGROUND_ISOLATION' || operations[0].id !== STEP_ID) throw serviceError(422, 'background_isolation_plan_blocked', `Canonical background isolation plan is ${status ?? 'invalid'}`);
}
function assertBackgroundIsolationTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.operation.capability !== BACKGROUND_ISOLATION_CAPABILITY || ticket.operation.type !== 'BACKGROUND_ISOLATION' || ticket.operation.id !== STEP_ID || ticket.stepId !== STEP_ID || ticket.policy !== 'LOCAL_ONLY') throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not an accepted deterministic background isolation contract');
  if (ticket.allowedExecutors.length !== 1) throw serviceError(409, 'local_ticket_executor_mismatch', 'Deterministic background isolation must bind exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== BACKGROUND_ISOLATION_TOOL_ID || executor.version !== BACKGROUND_ISOLATION_TOOL_VERSION) throw serviceError(409, 'local_ticket_executor_mismatch', 'Deterministic background isolation executor binding is invalid');
}
function assertInputBindings(ticket: LocalExecutionTicketV2, sourceArtifactId: string, maskArtifactId: string): void {
  if (ticket.inputs.length !== 2) throw serviceError(409, 'local_execution_idempotency_mismatch', 'Durable deterministic ticket input count changed');
  const source = ticket.inputs.find(binding => binding.kind === 'image'); const mask = ticket.inputs.find(binding => binding.kind === 'mask');
  if (!source || !mask || source.artifactId !== sourceArtifactId || mask.artifactId !== maskArtifactId || !source.sha256 || !mask.sha256) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to different deterministic inputs');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'image/png' || !output.width || !output.height) throw serviceError(409, 'local_execution_idempotency_mismatch', 'Durable deterministic output contract changed');
}
async function decodePngRgba(bytes: Uint8Array): Promise<Readonly<{ width: number; height: number; data: Uint8ClampedArray }>> {
  if (!bytes.byteLength) throw serviceError(400, 'local_image_empty', 'Local image upload is empty');
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'png') throw serviceError(415, 'local_image_format_mismatch', 'Deterministic image output must be PNG');
    const result = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (!result.info.width || !result.info.height || result.info.channels !== 4) throw serviceError(400, 'local_image_decode_failed', 'Deterministic PNG must decode to RGBA8');
    return Object.freeze({ width: result.info.width, height: result.info.height, data: new Uint8ClampedArray(result.data) });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) throw error;
    throw serviceError(400, 'local_image_decode_failed', 'Deterministic PNG could not be decoded');
  }
}
function ticketIdempotencyKey(clientRequestId: string): string { return `${clientRequestId}${IDEMPOTENCY_SUFFIX}`; }
function clientRequestIdFromTicket(ticket: LocalExecutionTicketV2): string {
  if (!ticket.idempotencyKey.endsWith(IDEMPOTENCY_SUFFIX)) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable deterministic ticket idempotency key is malformed');
  const value = ticket.idempotencyKey.slice(0, -IDEMPOTENCY_SUFFIX.length);
  if (!value) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable deterministic ticket lacks client request identity');
  return value;
}
function deterministicExecutionId(scope: AuthenticatedScope & { projectId: string }, clientRequestId: string): string {
  return `local-background-isolation-${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}
function sameDurableTicket(a: LocalExecutionTicketV2, b: LocalExecutionTicketV2): boolean {
  return a.ticketId === b.ticketId && a.version === b.version && a.nonce === b.nonce && a.idempotencyKey === b.idempotencyKey && a.requestId === b.requestId && a.workflowId === b.workflowId && a.stepId === b.stepId && canonicalJson(a.scope) === canonicalJson(b.scope) && canonicalJson(a.inputs) === canonicalJson(b.inputs) && canonicalJson(a.expectedOutputs) === canonicalJson(b.expectedOutputs) && canonicalJson(a.allowedExecutors) === canonicalJson(b.allowedExecutors) && canonicalJson(a.operation) === canonicalJson(b.operation);
}
function artifactHash(artifact: CreativeArtifact): string | undefined { const value = artifact.metadata?.sha256; return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value : undefined; }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)])); }
function assertSameScope(a: AuthenticatedScope & { projectId: string }, b: AuthenticatedScope & { projectId: string }): void { if (a.tenantId !== b.tenantId || a.userId !== b.userId || a.projectId !== b.projectId) throw serviceError(403, 'local_execution_scope_denied', 'Local execution scope denied'); }
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
