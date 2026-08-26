import { createHash } from 'node:crypto';
import { CreativeExecutionPlatform, type CreativeArtifact, type CreativeExecutionPlatformRuntimeDependencies, type LocalExecutionTicket, type ProductionOutcome } from '../../../src/platform/creative/canonical/index.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { LocalExecutionLedger } from './LocalExecutionLedger.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import { SegmentationResultAuthority } from './LocalExecutionResultAuthority.ts';
import type { PostgresLocalExecutionUploadStore } from './PostgresLocalExecutionUploadStore.ts';

const LOCAL_SEGMENTATION_STEP_ID = 'interactive-segmentation';

export type LocalSegmentationPoint = Readonly<{ x: number; y: number; label: 'POSITIVE' | 'NEGATIVE'; coordinateSpace: 'ORIGINAL' }>;
export type LocalSegmentationAnalysis = Readonly<{
  originalWidth: number;
  originalHeight: number;
  analysisWidth: number;
  analysisHeight: number;
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}>;
export type LocalSegmentationPrepareCommand = Readonly<{
  projectId: string;
  inputArtifactId: string;
  clientRequestId: string;
  analysis: LocalSegmentationAnalysis;
  points: readonly LocalSegmentationPoint[];
}>;
export type LocalSegmentationSubmission = Readonly<{ executionId: string; status: ProductionOutcome['status']; artifactId?: string; outcome: ProductionOutcome }>;

export type LocalSegmentationServiceDependencies = Readonly<{
  platform: CreativeExecutionPlatformRuntimeDependencies;
  ownsArtifacts: (scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: AuthenticatedScope & { projectId: string }, originalId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
  admission: LocalExecutionLedger;
  uploads: PostgresLocalExecutionUploadStore;
  persistMask: (ticketId: string, scope: AuthenticatedScope & { projectId: string }, width: number, height: number, alpha: Uint8Array) => Promise<Readonly<{ storageId: string }>>;
  loadPersistedMask: (ticketId: string, scope: AuthenticatedScope & { projectId: string }) => Promise<Readonly<{ storageId: string }> | undefined>;
  issueMaskId: (storageId: string, scope: AuthenticatedScope & { projectId: string }) => string;
  now?: () => number;
}>;

type Prepared = Readonly<{ executionId: string; ticketId: string; scope: AuthenticatedScope & { projectId: string }; bindingHash: string }>;

/**
 * Application boundary for the first 6.42A end-to-end capability.
 * It never runs inference and never accepts client-owned canonical artifact identity.
 */
export class LocalSegmentationExecutionService {
  readonly #platform: CreativeExecutionPlatform;
  readonly #prepared = new Map<string, Prepared>();
  readonly #now: () => number;
  readonly #results: SegmentationResultAuthority;

  constructor(private readonly dependencies: LocalSegmentationServiceDependencies) {
    this.#platform = new CreativeExecutionPlatform(dependencies.platform);
    this.#now = dependencies.now ?? Date.now;
    this.#results = new SegmentationResultAuthority(dependencies, { capability: 'local:mobilesam:segment:v1', stepId: LOCAL_SEGMENTATION_STEP_ID });
  }

  async prepare(command: LocalSegmentationPrepareCommand, auth: AuthenticatedScope): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicket }>> {
    const normalized = normalizePrepareCommand(command);
    const scope = Object.freeze({ ...auth, projectId: normalized.projectId });
    const executionId = deterministicExecutionId(scope, normalized.clientRequestId);
    const bindingHash = prepareBindingHash(normalized);
    const existing = this.#prepared.get(executionId);
    if (existing) {
      assertSameScope(existing.scope, scope);
      if (existing.bindingHash !== bindingHash) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to different segmentation parameters');
      const ticket = await this.dependencies.admission.get(existing.ticketId);
      if (!ticket) throw serviceError(409, 'local_execution_state_lost', 'Local execution ticket is no longer available');
      return Object.freeze({ executionId, ticket });
    }

    const durable = await this.dependencies.admission.getByIdempotencyKey(scope, localSegmentationTicketIdempotencyKey(normalized.clientRequestId));
    if (durable) {
      await this.validateDurablePrepareTicket(durable, normalized, scope, executionId, bindingHash);
      this.#prepared.set(executionId, Object.freeze({ executionId, ticketId: durable.ticketId, scope, bindingHash }));
      return Object.freeze({ executionId, ticket: durable });
    }

    if (!await this.dependencies.ownsArtifacts(scope, [normalized.inputArtifactId])) throw serviceError(403, 'artifact_scope_denied', 'Input artifact is outside the authenticated project scope');
    const artifacts = await this.dependencies.hydrateArtifacts(scope, normalized.inputArtifactId, []);
    const source = artifacts.find(artifact => artifact.id === normalized.inputArtifactId && artifact.kind === 'image');
    if (!source?.image?.width || !source.image.height) throw serviceError(422, 'canonical_image_unavailable', 'Canonical source image metadata is unavailable');
    validateSegmentationGeometry(normalized.analysis, normalized.points, source.image.width, source.image.height);
    if (!this.#platform.hasExecution(executionId)) this.createPlatformExecution(executionId, scope, source, normalized.clientRequestId, normalized.analysis, normalized.points);
    const plan = await this.#platform.plan(executionId);
    assertReadySegmentationPlan(plan.status, plan.operations);
    const tickets = await this.#platform.prepareLocalExecution(executionId);
    if (tickets.length !== 1) throw serviceError(500, 'local_ticket_contract_error', 'Expected exactly one local segmentation ticket');
    const ticket = tickets[0];
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || !ticket.inputs[0].sha256) throw serviceError(500, 'local_ticket_input_integrity_missing', 'Local segmentation ticket requires one canonical image with SHA-256');
    if (ticket.idempotencyKey !== localSegmentationTicketIdempotencyKey(normalized.clientRequestId)) throw serviceError(500, 'local_ticket_idempotency_contract', 'Canonical local ticket idempotency binding is invalid');
    this.#prepared.set(executionId, Object.freeze({ executionId, ticketId: ticket.ticketId, scope, bindingHash }));
    return Object.freeze({ executionId, ticket });
  }

  async uploadMask(input: Readonly<{ ticketId: string; projectId: string; width: number; height: number; bytes: Uint8Array }>, auth: AuthenticatedScope) {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local execution ticket has expired');
    const expected = ticket.expectedOutputs[0];
    if (ticket.expectedOutputs.length !== 1 || expected.kind !== 'mask' || expected.role !== 'MASK') throw serviceError(409, 'local_output_contract_error', 'Ticket is not a single MASK output contract');
    if (input.width !== expected.width || input.height !== expected.height) throw serviceError(400, 'local_mask_dimensions_mismatch', 'Uploaded MASK dimensions do not match the ticket');
    const upload = await this.dependencies.uploads.persist({
      ticketId: ticket.ticketId,
      scope: ticket.scope,
      kind: 'mask',
      role: 'MASK',
      mimeType: 'application/octet-stream',
      width: input.width,
      height: input.height,
      bytes: input.bytes,
      expiresAt: ticket.expiresAt,
      now: this.#now(),
    });
    return Object.freeze({ uploadId: upload.uploadId, kind: 'mask', role: 'MASK' as const, sha256: upload.sha256, sizeBytes: upload.sizeBytes, mimeType: upload.mimeType, width: upload.width, height: upload.height });
  }

  async submit(input: Readonly<{ ticketId: string; projectId: string; result: unknown }>, auth: AuthenticatedScope): Promise<LocalSegmentationSubmission> {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    return this.#results.submit({
      ticket,
      result: input.result,
      verify: async ({ ticket: admittedTicket, result, artifact }) => {
        await this.ensurePlatformExecution(admittedTicket);
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

  private async requireTicket(ticketId: string, auth: AuthenticatedScope, projectId: string): Promise<LocalExecutionTicket> {
    const ticket = await this.dependencies.admission.get(ticketId);
    if (!ticket) throw serviceError(404, 'local_ticket_not_found', 'Local execution ticket not found');
    const scope = { ...auth, projectId };
    assertSameScope(ticket.scope, scope);
    assertSegmentationTicket(ticket);
    return ticket;
  }

  private async validateDurablePrepareTicket(ticket: LocalExecutionTicket, command: LocalSegmentationPrepareCommand, scope: AuthenticatedScope & { projectId: string }, executionId: string, bindingHash: string): Promise<void> {
    assertSameScope(ticket.scope, scope);
    assertSegmentationTicket(ticket);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local execution ticket has expired');
    if (ticket.requestId !== executionId || ticket.workflowId !== executionId || ticket.idempotencyKey !== localSegmentationTicketIdempotencyKey(command.clientRequestId)) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to another canonical local execution');
    const durableBindingHash = prepareBindingHashFromTicket(ticket, command.clientRequestId);
    if (!durableBindingHash || durableBindingHash !== bindingHash) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to different segmentation parameters');
    if (!await this.dependencies.ownsArtifacts(scope, [command.inputArtifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical local execution input is no longer authorized or available');
    const artifacts = await this.dependencies.hydrateArtifacts(scope, command.inputArtifactId, []);
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical local execution input revalidation failed: ${decision.reasonCode}`);
    const source = artifacts.find(artifact => artifact.id === command.inputArtifactId && artifact.kind === 'image');
    if (!source?.image?.width || !source.image.height) throw serviceError(409, 'local_execution_recovery_input', 'Canonical image is unavailable for local execution recovery');
    validateSegmentationGeometry(command.analysis, command.points, source.image.width, source.image.height);
    const expected = ticket.expectedOutputs[0];
    if (ticket.expectedOutputs.length !== 1 || expected.kind !== 'mask' || expected.role !== 'MASK' || expected.width !== source.image.width || expected.height !== source.image.height) throw serviceError(409, 'local_execution_idempotency_mismatch', 'Durable local ticket output binding no longer matches the canonical source');
  }

  private async ensurePlatformExecution(ticket: LocalExecutionTicket): Promise<void> {
    if (this.#platform.hasExecution(ticket.requestId)) return;
    assertSegmentationTicket(ticket);
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image') throw serviceError(409, 'local_execution_recovery_input', 'Local execution recovery requires exactly one canonical image input');
    const artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, ticket.inputs[0].artifactId, []);
    const source = artifacts.find(artifact => artifact.id === ticket.inputs[0].artifactId && artifact.kind === 'image');
    if (!source?.image?.width || !source.image.height) throw serviceError(409, 'local_execution_recovery_input', 'Canonical image is unavailable for local execution recovery');
    const parameters = ticket.operation.parameters ?? {};
    const selectionRequestId = typeof parameters.selectionRequestId === 'string' ? parameters.selectionRequestId.trim() : '';
    const analysis = parameters.analysis as LocalSegmentationAnalysis | undefined;
    const points = parameters.points as readonly LocalSegmentationPoint[] | undefined;
    if (!selectionRequestId || !analysis || !Array.isArray(points)) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable local execution ticket lacks recovery parameters');
    validateSegmentationGeometry(analysis, points, source.image.width, source.image.height);
    this.createPlatformExecution(ticket.requestId, ticket.scope, source, selectionRequestId, analysis, points);
    const plan = await this.#platform.plan(ticket.requestId);
    assertReadySegmentationPlan(plan.status, plan.operations);
    const recovered = await this.#platform.prepareLocalExecution(ticket.requestId);
    if (recovered.length !== 1 || !sameDurableTicket(recovered[0], ticket)) throw serviceError(409, 'local_execution_recovery_mismatch', 'Reconstructed canonical execution does not match the durable local ticket');
  }

  private createPlatformExecution(executionId: string, scope: AuthenticatedScope & { projectId: string }, source: CreativeArtifact, selectionRequestId: string, analysis: LocalSegmentationAnalysis, points: readonly LocalSegmentationPoint[]): void {
    this.#platform.createExecution({
      id: executionId,
      intent: 'interactive segmentation',
      scope,
      inputArtifacts: [source],
      budget: { credits: 0, aiCalls: 0, retries: 0 },
      metadata: {
        operationIntent: 'INTERACTIVE_SEGMENTATION',
        selectionRequestId,
        analysis,
        points,
        idempotencyKey: selectionRequestId,
        planningConstraints: { executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 },
      },
    });
  }
}

function normalizePrepareCommand(command: LocalSegmentationPrepareCommand): LocalSegmentationPrepareCommand {
  if (!command?.projectId || !command.inputArtifactId || !command.clientRequestId) throw serviceError(400, 'invalid_local_segmentation_request', 'projectId, inputArtifactId and clientRequestId are required');
  if (!command.analysis || typeof command.analysis !== 'object' || Array.isArray(command.analysis)) throw serviceError(400, 'invalid_local_segmentation_analysis', 'Segmentation analysis transform is required');
  if (!Array.isArray(command.points) || command.points.length < 1 || command.points.length > 64) throw serviceError(400, 'invalid_local_segmentation_points', 'Segmentation requires between 1 and 64 prompt points');
  const analysis = Object.freeze({
    originalWidth: finite(command.analysis.originalWidth, 'originalWidth'), originalHeight: finite(command.analysis.originalHeight, 'originalHeight'),
    analysisWidth: finite(command.analysis.analysisWidth, 'analysisWidth'), analysisHeight: finite(command.analysis.analysisHeight, 'analysisHeight'),
    scaleX: finite(command.analysis.scaleX, 'scaleX'), scaleY: finite(command.analysis.scaleY, 'scaleY'), offsetX: finite(command.analysis.offsetX, 'offsetX'), offsetY: finite(command.analysis.offsetY, 'offsetY'),
  });
  const points = Object.freeze(command.points.map(point => {
    if (!point || typeof point !== 'object' || !Number.isFinite(point.x) || !Number.isFinite(point.y) || (point.label !== 'POSITIVE' && point.label !== 'NEGATIVE') || point.coordinateSpace !== 'ORIGINAL') throw serviceError(400, 'invalid_local_segmentation_points', 'Segmentation prompt point is invalid');
    return Object.freeze({ x: Number(point.x), y: Number(point.y), label: point.label, coordinateSpace: 'ORIGINAL' as const });
  }));
  return Object.freeze({ projectId: command.projectId.trim(), inputArtifactId: command.inputArtifactId.trim(), clientRequestId: command.clientRequestId.trim(), analysis, points });
}
function validateSegmentationGeometry(analysis: LocalSegmentationAnalysis, points: readonly LocalSegmentationPoint[], width: number, height: number): void {
  if (!Number.isInteger(analysis.originalWidth) || !Number.isInteger(analysis.originalHeight) || analysis.originalWidth !== width || analysis.originalHeight !== height) throw serviceError(400, 'local_segmentation_source_mismatch', 'Analysis transform does not match the canonical source dimensions');
  if (!Number.isInteger(analysis.analysisWidth) || !Number.isInteger(analysis.analysisHeight) || analysis.analysisWidth < 1 || analysis.analysisHeight < 1 || analysis.analysisWidth > width || analysis.analysisHeight > height) throw serviceError(400, 'invalid_local_segmentation_analysis', 'Analysis resolution is invalid');
  if (!(analysis.scaleX > 0) || !(analysis.scaleY > 0) || analysis.offsetX !== 0 || analysis.offsetY !== 0) throw serviceError(400, 'invalid_local_segmentation_analysis', 'Analysis transform must be a positive zero-offset source transform');
  for (const point of points) if (point.x < 0 || point.y < 0 || point.x >= width || point.y >= height) throw serviceError(400, 'local_segmentation_point_out_of_bounds', 'Segmentation prompt point is outside the canonical source');
}
function assertReadySegmentationPlan(status: string, operations: readonly Readonly<{ type: string }>[]): void {
  if (status !== 'READY' || operations.length !== 1 || operations[0].type !== 'segment') throw serviceError(422, 'local_segmentation_plan_blocked', `Canonical local segmentation plan is ${status ?? 'invalid'}`);
}
function assertSegmentationTicket(ticket: LocalExecutionTicket): void {
  if (ticket.operation.capability !== 'local:mobilesam:segment:v1' || ticket.operation.type !== 'segment' || ticket.operation.id !== LOCAL_SEGMENTATION_STEP_ID || ticket.stepId !== LOCAL_SEGMENTATION_STEP_ID || ticket.policy !== 'LOCAL_ONLY') throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not an accepted local segmentation contract');
}
function sameDurableTicket(a: LocalExecutionTicket, b: LocalExecutionTicket): boolean {
  return a.ticketId === b.ticketId && a.version === b.version && a.nonce === b.nonce && a.idempotencyKey === b.idempotencyKey && a.requestId === b.requestId && a.workflowId === b.workflowId && a.stepId === b.stepId && canonicalJson(a.scope) === canonicalJson(b.scope) && canonicalJson(a.inputs) === canonicalJson(b.inputs) && canonicalJson(a.expectedOutputs) === canonicalJson(b.expectedOutputs) && canonicalJson(a.allowedModels) === canonicalJson(b.allowedModels) && canonicalJson(a.operation) === canonicalJson(b.operation);
}
function localSegmentationTicketIdempotencyKey(clientRequestId: string): string { return `${clientRequestId}:${LOCAL_SEGMENTATION_STEP_ID}:local-v1`; }
function prepareBindingHash(command: LocalSegmentationPrepareCommand): string {
  return createHash('sha256').update(canonicalJson({ projectId: command.projectId, inputArtifactId: command.inputArtifactId, analysis: command.analysis, points: command.points }) ?? '').digest('hex');
}
function prepareBindingHashFromTicket(ticket: LocalExecutionTicket, clientRequestId: string): string | undefined {
  if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image') return undefined;
  const parameters = ticket.operation.parameters ?? {};
  const selectionRequestId = typeof parameters.selectionRequestId === 'string' ? parameters.selectionRequestId.trim() : '';
  const analysis = parameters.analysis as LocalSegmentationAnalysis | undefined;
  const points = parameters.points as readonly LocalSegmentationPoint[] | undefined;
  if (selectionRequestId !== clientRequestId || !analysis || !Array.isArray(points)) return undefined;
  return createHash('sha256').update(canonicalJson({ projectId: ticket.scope.projectId, inputArtifactId: ticket.inputs[0].artifactId, analysis, points }) ?? '').digest('hex');
}
function canonicalJson(value: unknown): string | undefined { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)]));
}
function finite(value: unknown, field: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw serviceError(400, 'invalid_local_segmentation_analysis', `Segmentation analysis ${field} is invalid`); return value; }
function deterministicExecutionId(scope: AuthenticatedScope & { projectId: string }, clientRequestId: string): string {
  return `local-segment-${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}
function assertSameScope(a: AuthenticatedScope & { projectId: string }, b: AuthenticatedScope & { projectId: string }): void {
  if (a.tenantId !== b.tenantId || a.userId !== b.userId || a.projectId !== b.projectId) throw serviceError(403, 'local_execution_scope_denied', 'Local execution scope denied');
}
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
