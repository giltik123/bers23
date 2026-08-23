import { createHash } from 'node:crypto';
import { CreativeExecutionPlatform, type CreativeArtifact, type CreativeExecutionPlatformRuntimeDependencies, type LocalExecutionResult, type LocalExecutionTicket, type ProductionOutcome } from '../../../src/platform/creative/canonical/index.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { LocalExecutionAdmissionRegistry } from './LocalExecutionAdmission.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import type { PostgresLocalExecutionUploadStore } from './PostgresLocalExecutionUploadStore.ts';

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

export type LocalSegmentationServiceDependencies = Readonly<{
  platform: CreativeExecutionPlatformRuntimeDependencies;
  ownsArtifacts: (scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: AuthenticatedScope & { projectId: string }, originalId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
  admission: LocalExecutionAdmissionRegistry;
  uploads: PostgresLocalExecutionUploadStore;
  persistMask: (scope: AuthenticatedScope & { projectId: string }, width: number, height: number, alpha: Uint8Array) => Promise<Readonly<{ storageId: string }>>;
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

  constructor(private readonly dependencies: LocalSegmentationServiceDependencies) {
    this.#platform = new CreativeExecutionPlatform(dependencies.platform);
    this.#now = dependencies.now ?? Date.now;
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
      const ticket = this.dependencies.admission.get(existing.ticketId);
      if (!ticket) throw serviceError(409, 'local_execution_state_lost', 'Local execution ticket is no longer available');
      return Object.freeze({ executionId, ticket });
    }
    if (!await this.dependencies.ownsArtifacts(scope, [normalized.inputArtifactId])) throw serviceError(403, 'artifact_scope_denied', 'Input artifact is outside the authenticated project scope');
    const artifacts = await this.dependencies.hydrateArtifacts(scope, normalized.inputArtifactId, []);
    const source = artifacts.find(artifact => artifact.id === normalized.inputArtifactId && artifact.kind === 'image');
    if (!source?.image?.width || !source.image.height) throw serviceError(422, 'canonical_image_unavailable', 'Canonical source image metadata is unavailable');
    validateSegmentationGeometry(normalized.analysis, normalized.points, source.image.width, source.image.height);
    this.#platform.createExecution({
      id: executionId,
      intent: 'interactive segmentation',
      scope,
      inputArtifacts: [source],
      budget: { credits: 0, aiCalls: 0, retries: 0 },
      metadata: {
        operationIntent: 'INTERACTIVE_SEGMENTATION',
        selectionRequestId: normalized.clientRequestId,
        analysis: normalized.analysis,
        points: normalized.points,
        idempotencyKey: normalized.clientRequestId,
        planningConstraints: { executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 },
      },
    });
    const plan = await this.#platform.plan(executionId);
    if (plan.status !== 'READY' || plan.operations.length !== 1 || plan.operations[0].type !== 'segment') throw serviceError(422, 'local_segmentation_plan_blocked', `Canonical local segmentation plan is ${plan.status ?? 'invalid'}`);
    const tickets = await this.#platform.prepareLocalExecution(executionId);
    if (tickets.length !== 1) throw serviceError(500, 'local_ticket_contract_error', 'Expected exactly one local segmentation ticket');
    const ticket = tickets[0];
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || !ticket.inputs[0].sha256) throw serviceError(500, 'local_ticket_input_integrity_missing', 'Local segmentation ticket requires one canonical image with SHA-256');
    this.#prepared.set(executionId, Object.freeze({ executionId, ticketId: ticket.ticketId, scope, bindingHash }));
    return Object.freeze({ executionId, ticket });
  }

  async uploadMask(input: Readonly<{ ticketId: string; projectId: string; width: number; height: number; bytes: Uint8Array }>, auth: AuthenticatedScope) {
    const ticket = this.requireTicket(input.ticketId, auth, input.projectId);
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

  async submit(input: Readonly<{ ticketId: string; projectId: string; result: unknown }>, auth: AuthenticatedScope): Promise<Readonly<{ executionId: string; status: ProductionOutcome['status']; artifactId?: string; outcome: ProductionOutcome }>> {
    const ticket = this.requireTicket(input.ticketId, auth, input.projectId);
    const claim = this.dependencies.admission.claim({ ticketId: ticket.ticketId, result: input.result, callerScope: ticket.scope, now: this.#now() });
    if (!claim.allowed) throw serviceError(claim.reasonCode === 'REPLAYED_TICKET' || claim.reasonCode === 'IN_PROGRESS' ? 409 : 400, `local_result_${claim.reasonCode.toLowerCase()}`, `Local result admission denied: ${claim.reasonCode}`);
    let canonicalPersisted = false;
    try {
      await this.revalidateCanonicalInputs(ticket);
      const result = claim.result as LocalExecutionResult;
      if (result.outputs.length !== 1) throw serviceError(400, 'local_result_output_count', 'Local segmentation requires exactly one output');
      const evidence = result.outputs[0];
      const upload = await this.dependencies.uploads.load(evidence.uploadId, ticket.ticketId, ticket.scope, this.#now());
      if (!upload) throw serviceError(400, 'local_upload_unavailable', 'Quarantined local output is unavailable or expired');
      if (upload.sha256 !== evidence.sha256 || upload.sizeBytes !== evidence.sizeBytes || upload.kind !== evidence.kind || upload.role !== evidence.role || upload.mimeType !== evidence.mimeType || upload.width !== evidence.width || upload.height !== evidence.height) throw serviceError(400, 'local_upload_evidence_mismatch', 'Submitted result evidence does not match quarantined bytes');
      if (upload.kind !== 'mask' || upload.role !== 'MASK' || !upload.width || !upload.height) throw serviceError(400, 'local_upload_contract_mismatch', 'Quarantined output is not a canonical MASK candidate');
      const stored = await this.dependencies.persistMask(ticket.scope, upload.width, upload.height, upload.bytes);
      canonicalPersisted = true;
      const artifactId = this.dependencies.issueMaskId(stored.storageId, ticket.scope);
      const artifact: CreativeArtifact = Object.freeze({
        id: artifactId,
        kind: 'mask',
        value: Object.freeze({ width: upload.width, height: upload.height, alpha: Uint8Array.from(upload.bytes), source: 'SEGMENTATION', coordinateSpace: 'ORIGINAL' }),
        producerOperationId: ticket.stepId,
        scope: ticket.scope,
        state: 'AVAILABLE',
        role: 'MASK',
        image: Object.freeze({ width: upload.width, height: upload.height, format: 'ALPHA8', orientation: 1, colorSpace: 'gray', alpha: true }),
        metadata: Object.freeze({ artifactRole: 'MASK', localExecutionAdmission: 'ADMITTED', ticketId: ticket.ticketId, modelId: result.model.modelId, modelVersion: result.model.version, runtime: result.runtime, accelerator: result.accelerator, sha256: upload.sha256, parentArtifactIds: Object.freeze(ticket.inputs.map(binding => binding.artifactId)) }),
      });
      const outcome = await this.#platform.completeLocalExecution(ticket.requestId, { ticketId: ticket.ticketId, stepId: ticket.stepId, artifact, latencyMs: result.metrics.latencyMs, memoryMb: result.metrics.memoryBytes === undefined ? undefined : result.metrics.memoryBytes / (1024 * 1024) });
      this.dependencies.admission.commit(ticket.ticketId);
      await this.dependencies.uploads.consume(upload.uploadId, ticket.ticketId, ticket.scope, this.#now());
      return Object.freeze({ executionId: ticket.requestId, status: outcome.status, artifactId: outcome.status === 'SUCCESS' ? artifactId : undefined, outcome });
    } catch (error) {
      if (canonicalPersisted) {
        try { this.dependencies.admission.commit(ticket.ticketId); } catch { /* already committed/terminal */ }
      } else this.dependencies.admission.release(ticket.ticketId);
      throw error;
    }
  }

  status(executionId: string, auth: AuthenticatedScope) {
    const record = this.#prepared.get(executionId);
    if (!record) throw serviceError(404, 'local_execution_not_found', 'Local execution not found');
    if (record.scope.tenantId !== auth.tenantId || record.scope.userId !== auth.userId) throw serviceError(403, 'local_execution_scope_denied', 'Local execution scope denied');
    return Object.freeze({ executionId, status: this.#platform.status(executionId), tickets: this.#platform.pendingLocalExecution(executionId) });
  }

  private requireTicket(ticketId: string, auth: AuthenticatedScope, projectId: string): LocalExecutionTicket {
    const ticket = this.dependencies.admission.get(ticketId);
    if (!ticket) throw serviceError(404, 'local_ticket_not_found', 'Local execution ticket not found');
    const scope = { ...auth, projectId };
    assertSameScope(ticket.scope, scope);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local execution ticket has expired');
    if (ticket.operation.capability !== 'local:mobilesam:segment:v1' || ticket.operation.type !== 'segment' || ticket.policy !== 'LOCAL_ONLY') throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not an accepted local segmentation contract');
    return ticket;
  }

  private async revalidateCanonicalInputs(ticket: LocalExecutionTicket): Promise<void> {
    const ids = ticket.inputs.map(binding => binding.artifactId);
    if (!await this.dependencies.ownsArtifacts(ticket.scope, ids)) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical local execution input is no longer authorized or available');
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image') throw serviceError(409, 'local_input_contract_mismatch', 'Local segmentation ticket input contract changed');
    const artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, ticket.inputs[0].artifactId, []);
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical local execution input revalidation failed: ${decision.reasonCode}`);
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
function prepareBindingHash(command: LocalSegmentationPrepareCommand): string {
  return createHash('sha256').update(JSON.stringify({ projectId: command.projectId, inputArtifactId: command.inputArtifactId, analysis: command.analysis, points: command.points })).digest('hex');
}
function finite(value: unknown, field: string): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw serviceError(400, 'invalid_local_segmentation_analysis', `Segmentation analysis ${field} is invalid`); return value; }
function deterministicExecutionId(scope: AuthenticatedScope & { projectId: string }, clientRequestId: string): string {
  return `local-segment-${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}
function assertSameScope(a: AuthenticatedScope & { projectId: string }, b: AuthenticatedScope & { projectId: string }): void {
  if (a.tenantId !== b.tenantId || a.userId !== b.userId || a.projectId !== b.projectId) throw serviceError(403, 'local_execution_scope_denied', 'Local execution scope denied');
}
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
