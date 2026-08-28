import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  CreativeExecutionPlatform,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type LocalExecutionResultV2,
  type LocalExecutionTicketV2,
  type ProductionOutcome,
} from '../../../src/platform/creative/canonical/index.ts';
import {
  CROP_CAPABILITY,
  CROP_OPERATION,
  CROP_STEP_ID,
  CROP_TOOL_ID,
  CROP_TOOL_VERSION,
  cropRgba8,
  normalizeCropRect,
  type CropRect,
} from '../../../src/platform/creative/deterministic/Crop.ts';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import type { PostgresLocalExecutionUploadStore } from './PostgresLocalExecutionUploadStore.ts';

const IDEMPOTENCY_SUFFIX = `:${CROP_STEP_ID}:local-v2`;

export type LocalCropPrepareCommand = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  clientRequestId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}>;

export type LocalCropSubmission = Readonly<{
  executionId: string;
  status: ProductionOutcome['status'];
  artifactId?: string;
  outcome: ProductionOutcome;
}>;

export type LocalCropServiceDependencies = Readonly<{
  platform: CreativeExecutionPlatformRuntimeDependencies;
  ownsArtifacts: (scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: AuthenticatedScope & { projectId: string }, sourceId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
  admission: LocalExecutionLedgerV2;
  uploads: PostgresLocalExecutionUploadStore;
  persistFinal: (
    scope: AuthenticatedScope & { projectId: string },
    executionId: string,
    operationId: string,
    image: PixelImage,
    lineage: Readonly<{ sourceArtifactId: string; producerOperation: 'CROP' }>,
  ) => Promise<Readonly<{ storageId: string; width: number; height: number }>>;
  loadPersistedFinal: (executionId: string, scope: AuthenticatedScope & { projectId: string }) => Promise<Readonly<{ storageId: string; width: number; height: number }> | undefined>;
  issueFinalId: (storageId: string, scope: AuthenticatedScope & { projectId: string }) => string;
  now?: () => number;
}>;

/**
 * Exact Core authority for deterministic Crop v1.
 * Browser bytes are quarantined candidates only. Core rehydrates the canonical
 * IMAGE, recomputes the sub-rectangle byte-for-byte and persists a FINAL only
 * after exact equality and canonical workflow success. No Provider/Billing port exists.
 */
export class LocalCropExecutionService {
  readonly #platform: CreativeExecutionPlatform;
  readonly #now: () => number;

  constructor(private readonly dependencies: LocalCropServiceDependencies) {
    this.#platform = new CreativeExecutionPlatform(dependencies.platform);
    this.#now = dependencies.now ?? Date.now;
  }

  async prepare(command: LocalCropPrepareCommand, auth: AuthenticatedScope): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>> {
    const normalized = normalizePrepare(command);
    const scope = Object.freeze({ ...auth, projectId: normalized.projectId });
    const executionId = cropExecutionId(scope, normalized.clientRequestId);
    const idempotencyKey = ticketIdempotencyKey(normalized.clientRequestId);

    const durable = await this.dependencies.admission.getByIdempotencyKeyV2(scope, idempotencyKey);
    if (durable) {
      await this.validateDurablePrepareTicket(durable, normalized, scope, executionId);
      return Object.freeze({ executionId, ticket: durable });
    }

    if (!await this.dependencies.ownsArtifacts(scope, [normalized.sourceArtifactId])) throw serviceError(403, 'artifact_scope_denied', 'Crop source IMAGE is outside the authenticated project scope');
    const artifacts = await this.hydrateExactSource(scope, normalized.sourceArtifactId, normalized);
    if (!this.#platform.hasExecution(executionId)) this.createPlatformExecution(executionId, scope, artifacts, normalized);
    const plan = await this.#platform.plan(executionId);
    assertReadyPlan(plan.status, plan.operations);
    const tickets = await this.#platform.prepareLocalExecutionV2(executionId);
    if (tickets.length !== 1) throw serviceError(500, 'local_ticket_contract_error', 'Expected exactly one deterministic Crop ticket');
    const ticket = tickets[0];
    assertCropTicket(ticket);
    if (ticket.idempotencyKey !== idempotencyKey) throw serviceError(500, 'local_ticket_idempotency_contract', 'Canonical Crop ticket idempotency binding is invalid');
    assertExactCommandBinding(ticket, normalized);
    return Object.freeze({ executionId, ticket });
  }

  async uploadImage(input: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>, auth: AuthenticatedScope) {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local Crop ticket has expired');
    const output = requireOutputContract(ticket);
    const decoded = await decodePngRgba(input.bytes, Number(output.width), Number(output.height));
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

  async submit(input: Readonly<{ ticketId: string; projectId: string; result: unknown }>, auth: AuthenticatedScope): Promise<LocalCropSubmission> {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    const claim = await this.dependencies.admission.claimV2({ ticketId: ticket.ticketId, result: input.result, callerScope: ticket.scope, now: this.#now() });
    if (!claim.allowed) {
      if (claim.reasonCode === 'REPLAYED_TICKET') return this.replayFinalized(ticket);
      const status = claim.reasonCode === 'IN_PROGRESS' ? 409 : claim.reasonCode === 'EXPIRED_TICKET' ? 410 : 400;
      throw serviceError(status, `local_result_${claim.reasonCode.toLowerCase()}`, `Local Crop result admission denied: ${claim.reasonCode}`);
    }

    try {
      const artifacts = await this.revalidateCanonicalSource(ticket);
      await this.ensurePlatformExecution(ticket, artifacts);
      const result = claim.result as LocalExecutionResultV2;
      assertResultExecutor(ticket, result);
      if (result.outputs.length !== 1) throw serviceError(400, 'local_result_output_count', 'Crop requires exactly one output');
      const evidence = result.outputs[0];
      const upload = await this.dependencies.uploads.load(evidence.uploadId, ticket.ticketId, ticket.scope, this.#now());
      if (!upload) throw serviceError(400, 'local_upload_unavailable', 'Quarantined Crop output is unavailable or expired');
      if (upload.sha256 !== evidence.sha256 || upload.sizeBytes !== evidence.sizeBytes || upload.kind !== evidence.kind || upload.role !== evidence.role || upload.mimeType !== evidence.mimeType || upload.width !== evidence.width || upload.height !== evidence.height) throw serviceError(400, 'local_upload_evidence_mismatch', 'Submitted Crop evidence does not match quarantined bytes');
      if (upload.kind !== 'image' || upload.role !== 'COMPOSITE' || upload.mimeType !== 'image/png') throw serviceError(400, 'local_upload_contract_mismatch', 'Quarantined Crop output is not a PNG COMPOSITE candidate');

      const source = requireSource(artifacts, ticket);
      const rect = cropRectFromTicket(ticket, source.value.width, source.value.height);
      const output = requireOutputContract(ticket);
      if (Number(output.width) !== rect.width || Number(output.height) !== rect.height) throw serviceError(409, 'local_output_geometry_mismatch', 'Crop ticket output geometry does not match its rectangle');
      const candidate = await decodePngRgba(upload.bytes, rect.width, rect.height);
      const expected = cropRgba8(source.value.data, source.value.width, source.value.height, rect);
      assertExactPixels(expected, candidate.data);

      const admittedArtifact: CreativeArtifact = Object.freeze({
        id: `core-verified-crop:${ticket.ticketId}`,
        kind: 'image',
        value: Object.freeze({ width: rect.width, height: rect.height, data: expected, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' }),
        producerOperationId: ticket.stepId,
        scope: ticket.scope,
        state: 'FINAL',
        role: 'COMPOSITE',
        image: Object.freeze({ width: rect.width, height: rect.height, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb', alpha: true }),
        metadata: Object.freeze({
          artifactRole: 'COMPOSITE',
          localExecutionAdmission: 'ADMITTED',
          admissionClass: 'DETERMINISTIC_BYTE_EXACT',
          verificationScope: 'BYTE_EXACT_CORE_RECOMPUTE',
          ticketId: ticket.ticketId,
          executorKind: 'DETERMINISTIC_TOOL',
          toolId: CROP_TOOL_ID,
          toolVersion: CROP_TOOL_VERSION,
          runtime: result.runtime,
          accelerator: result.accelerator,
          candidateSha256: upload.sha256,
          verifiedPixelSha256: createHash('sha256').update(expected).digest('hex'),
          cropRect: rect,
          coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_INDICES',
          rectangleSemantics: 'HALF_OPEN',
          interpolation: 'NONE',
          borderPolicy: 'REJECT_OUT_OF_BOUNDS',
          integrityMetrics: Object.freeze({ verificationOutcome: 'PASS', pixelComparison: 'BYTE_EXACT' }),
          parentArtifactIds: Object.freeze([source.artifact.id]),
        }),
      });

      const existingOutcome = this.#platform.result(ticket.requestId);
      const outcome = existingOutcome ?? await this.#platform.completeLocalExecution(ticket.requestId, {
        ticketId: ticket.ticketId,
        stepId: ticket.stepId,
        artifact: admittedArtifact,
        latencyMs: result.metrics.latencyMs,
        memoryMb: result.metrics.memoryBytes === undefined ? undefined : result.metrics.memoryBytes / (1024 * 1024),
      });
      if (outcome.status !== 'SUCCESS') throw serviceError(422, 'local_execution_verification_failed', 'Canonical Crop execution did not pass workflow verification');

      const stored = await this.dependencies.persistFinal(
        ticket.scope,
        ticket.requestId,
        ticket.stepId,
        { width: rect.width, height: rect.height, data: expected },
        { sourceArtifactId: source.artifact.id, producerOperation: 'CROP' },
      );
      const artifactId = this.dependencies.issueFinalId(stored.storageId, ticket.scope);
      await this.dependencies.admission.commit(ticket.ticketId, 'SUCCESS');
      await this.dependencies.uploads.consume(upload.uploadId, ticket.ticketId, ticket.scope, this.#now());
      return Object.freeze({ executionId: ticket.requestId, status: 'SUCCESS', artifactId, outcome });
    } catch (error) {
      await this.dependencies.admission.release(ticket.ticketId).catch(() => undefined);
      throw error;
    }
  }

  private async replayFinalized(ticket: LocalExecutionTicketV2): Promise<LocalCropSubmission> {
    const finalization = await this.dependencies.admission.getFinalization(ticket.ticketId);
    if (!finalization || finalization.status === 'UNKNOWN') throw serviceError(409, 'local_finalization_unknown', 'Crop execution was consumed without a recoverable terminal status');
    if (finalization.status === 'FAILED') return failedReplay(ticket.requestId);
    const stored = await this.dependencies.loadPersistedFinal(ticket.requestId, ticket.scope);
    if (!stored) throw serviceError(409, 'local_finalization_artifact_unavailable', 'Committed Crop FINAL is unavailable');
    const output = requireOutputContract(ticket);
    if (stored.width !== output.width || stored.height !== output.height) throw serviceError(409, 'local_finalization_artifact_mismatch', 'Committed Crop FINAL geometry does not match the durable ticket');
    const artifactId = this.dependencies.issueFinalId(stored.storageId, ticket.scope);
    return successReplay(ticket.requestId, artifactId);
  }

  private async requireTicket(ticketId: string, auth: AuthenticatedScope, projectId: string): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw serviceError(404, 'local_ticket_not_found', 'Local Crop ticket not found');
    assertSameScope(ticket.scope, { ...auth, projectId });
    assertCropTicket(ticket);
    return ticket;
  }

  private async validateDurablePrepareTicket(ticket: LocalExecutionTicketV2, command: LocalCropPrepareCommand, scope: AuthenticatedScope & { projectId: string }, executionId: string): Promise<void> {
    assertSameScope(ticket.scope, scope);
    assertCropTicket(ticket);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local Crop ticket has expired');
    if (ticket.requestId !== executionId || ticket.workflowId !== executionId || ticket.idempotencyKey !== ticketIdempotencyKey(command.clientRequestId)) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to another Crop execution');
    assertExactCommandBinding(ticket, command);
    if (!await this.dependencies.ownsArtifacts(scope, [command.sourceArtifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical Crop source is no longer authorized or available');
    const artifacts = await this.hydrateExactSource(scope, command.sourceArtifactId, command);
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical Crop input revalidation failed: ${decision.reasonCode}`);
  }

  private async revalidateCanonicalSource(ticket: LocalExecutionTicketV2): Promise<readonly CreativeArtifact[]> {
    assertCropTicket(ticket);
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image') throw serviceError(409, 'local_input_contract_mismatch', 'Crop requires exactly one canonical IMAGE input');
    const sourceBinding = ticket.inputs[0];
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical Crop source is no longer authorized or available');
    const parameters = parametersFromTicket(ticket);
    const artifacts = await this.hydrateExactSource(ticket.scope, sourceBinding.artifactId, { x: parameters.x, y: parameters.y, width: parameters.width, height: parameters.height });
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical Crop input revalidation failed: ${decision.reasonCode}`);
    return artifacts;
  }

  private async hydrateExactSource(scope: AuthenticatedScope & { projectId: string }, sourceArtifactId: string, rect: CropRect): Promise<readonly CreativeArtifact[]> {
    try {
      const artifacts = await this.dependencies.hydrateArtifacts(scope, sourceArtifactId, []);
      const source = artifacts.find(artifact => artifact.id === sourceArtifactId && artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'COMPOSITE'));
      if (!source) throw new Error('Canonical Crop source was not hydrated');
      const pixels = requireSourcePixels(source);
      if (!artifactHash(source)) throw new Error('Canonical Crop source integrity hash is missing');
      normalizeCropRect(rect, pixels.width, pixels.height);
      return artifacts;
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error;
      throw serviceError(409, 'local_input_lineage_unavailable', error instanceof Error ? error.message : 'Canonical Crop source is unavailable');
    }
  }

  private async ensurePlatformExecution(ticket: LocalExecutionTicketV2, artifacts: readonly CreativeArtifact[]): Promise<void> {
    if (this.#platform.hasExecution(ticket.requestId)) return;
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image') throw serviceError(409, 'local_execution_recovery_input', 'Durable Crop ticket lacks its IMAGE binding');
    const clientRequestId = clientRequestIdFromTicket(ticket);
    const parameters = parametersFromTicket(ticket);
    this.createPlatformExecution(ticket.requestId, ticket.scope, artifacts, { projectId: ticket.scope.projectId, sourceArtifactId: ticket.inputs[0].artifactId, clientRequestId, ...parameters });
    const plan = await this.#platform.plan(ticket.requestId);
    assertReadyPlan(plan.status, plan.operations);
    const recovered = await this.#platform.prepareLocalExecutionV2(ticket.requestId);
    if (recovered.length !== 1 || !sameDurableTicket(recovered[0], ticket)) throw serviceError(409, 'local_execution_recovery_mismatch', 'Reconstructed canonical Crop execution does not match the durable ticket');
  }

  private createPlatformExecution(executionId: string, scope: AuthenticatedScope & { projectId: string }, artifacts: readonly CreativeArtifact[], command: LocalCropPrepareCommand): void {
    this.#platform.createExecution({
      id: executionId,
      intent: 'crop canonical image to exact pixel rectangle',
      scope,
      inputArtifacts: artifacts,
      budget: { credits: 0, aiCalls: 0, retries: 0 },
      metadata: {
        operationIntent: CROP_OPERATION,
        sourceArtifactId: command.sourceArtifactId,
        cropRect: Object.freeze({ x: command.x, y: command.y, width: command.width, height: command.height }),
        idempotencyKey: command.clientRequestId,
        planningConstraints: { executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 },
      },
    });
  }
}

function normalizePrepare(command: LocalCropPrepareCommand): LocalCropPrepareCommand {
  const projectId = command?.projectId?.trim(); const sourceArtifactId = command?.sourceArtifactId?.trim(); const clientRequestId = command?.clientRequestId?.trim();
  if (!projectId || !sourceArtifactId || !clientRequestId) throw serviceError(400, 'invalid_crop_request', 'projectId, sourceArtifactId and clientRequestId are required');
  try {
    const rect = normalizeCropRect({ x: command.x, y: command.y, width: command.width, height: command.height }, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
    return Object.freeze({ projectId, sourceArtifactId, clientRequestId, ...rect });
  } catch (error) {
    throw serviceError(400, 'invalid_crop_request', error instanceof Error ? error.message : 'Crop rectangle is invalid');
  }
}

function assertReadyPlan(status: string | undefined, operations: readonly Readonly<{ type: string; id: string }>[]): void {
  if (status !== 'READY' || operations.length !== 1 || operations[0].type !== CROP_OPERATION || operations[0].id !== CROP_STEP_ID) throw serviceError(422, 'crop_plan_blocked', `Canonical Crop plan is ${status ?? 'invalid'}`);
}

function assertCropTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.operation.capability !== CROP_CAPABILITY || ticket.operation.type !== CROP_OPERATION || ticket.operation.id !== CROP_STEP_ID || ticket.stepId !== CROP_STEP_ID || ticket.policy !== 'LOCAL_ONLY') throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not an accepted deterministic Crop contract');
  if (ticket.allowedExecutors.length !== 1) throw serviceError(409, 'local_ticket_executor_mismatch', 'Crop must bind exactly one deterministic executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== CROP_TOOL_ID || executor.version !== CROP_TOOL_VERSION) throw serviceError(409, 'local_ticket_executor_mismatch', 'Crop executor binding is invalid');
  const parameters = parametersFromTicket(ticket);
  if (parameters.deterministicTool !== `${CROP_TOOL_ID}@${CROP_TOOL_VERSION}` || parameters.coordinateSpace !== 'CANONICAL_ORIENTATION_1_PIXEL_INDICES' || parameters.rectangleSemantics !== 'HALF_OPEN') throw serviceError(409, 'local_ticket_parameter_mismatch', 'Crop ticket semantic parameters are invalid');
  requireOutputContract(ticket);
}

function assertExactCommandBinding(ticket: LocalExecutionTicketV2, command: LocalCropPrepareCommand): void {
  if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || ticket.inputs[0].artifactId !== command.sourceArtifactId || !ticket.inputs[0].sha256) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to a different Crop source');
  const parameters = parametersFromTicket(ticket);
  if (parameters.sourceArtifactId !== command.sourceArtifactId || parameters.x !== command.x || parameters.y !== command.y || parameters.width !== command.width || parameters.height !== command.height) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to a different Crop rectangle');
  const output = requireOutputContract(ticket);
  if (output.width !== command.width || output.height !== command.height) throw serviceError(409, 'local_execution_idempotency_mismatch', 'Durable Crop output geometry changed');
}

function parametersFromTicket(ticket: LocalExecutionTicketV2): Readonly<{ sourceArtifactId: string; x: number; y: number; width: number; height: number; deterministicTool: unknown; coordinateSpace: unknown; rectangleSemantics: unknown }> {
  const parameters = ticket.operation.parameters as Readonly<Record<string, unknown>> | undefined;
  const sourceArtifactId = typeof parameters?.sourceArtifactId === 'string' ? parameters.sourceArtifactId : '';
  const x = parameters?.x; const y = parameters?.y; const width = parameters?.width; const height = parameters?.height;
  if (!sourceArtifactId || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || Number(x) < 0 || Number(y) < 0 || Number(width) < 1 || Number(height) < 1) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Crop ticket rectangle parameters are invalid');
  return Object.freeze({ sourceArtifactId, x: Number(x), y: Number(y), width: Number(width), height: Number(height), deterministicTool: parameters?.deterministicTool, coordinateSpace: parameters?.coordinateSpace, rectangleSemantics: parameters?.rectangleSemantics });
}

function cropRectFromTicket(ticket: LocalExecutionTicketV2, sourceWidth: number, sourceHeight: number): CropRect {
  const parameters = parametersFromTicket(ticket);
  try { return normalizeCropRect(parameters, sourceWidth, sourceHeight); }
  catch (error) { throw serviceError(409, 'local_ticket_parameter_mismatch', error instanceof Error ? error.message : 'Crop ticket rectangle exceeds canonical source bounds'); }
}

function requireOutputContract(ticket: LocalExecutionTicketV2) {
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || output.count !== 1 || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'image/png' || !Number.isSafeInteger(output.width) || !Number.isSafeInteger(output.height) || Number(output.width) < 1 || Number(output.height) < 1) throw serviceError(409, 'local_output_contract_error', 'Crop ticket is not a single PNG COMPOSITE output contract');
  return output;
}

function assertResultExecutor(ticket: LocalExecutionTicketV2, result: LocalExecutionResultV2): void {
  const allowed = ticket.allowedExecutors[0];
  if (!allowed || allowed.kind !== 'DETERMINISTIC_TOOL' || result.executor.kind !== 'DETERMINISTIC_TOOL' || result.executor.toolId !== allowed.toolId || result.executor.version !== allowed.version) throw serviceError(400, 'local_executor_mismatch', 'Result is not the deterministic Crop executor authorized by this Core ticket');
  if (result.runtime !== 'BROWSER_JS' || result.accelerator !== 'cpu') throw serviceError(400, 'local_runtime_mismatch', 'Crop v1 requires exact BROWSER_JS/cpu runtime identity');
}

function requireSource(artifacts: readonly CreativeArtifact[], ticket: LocalExecutionTicketV2): Readonly<{ artifact: CreativeArtifact; value: { width: number; height: number; data: Uint8ClampedArray } }> {
  const binding = ticket.inputs[0]; const artifact = artifacts.find(value => value.id === binding.artifactId && value.kind === 'image');
  if (!artifact) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical Crop source is unavailable');
  return Object.freeze({ artifact, value: requireSourcePixels(artifact) });
}

function requireSourcePixels(artifact: CreativeArtifact): { width: number; height: number; data: Uint8ClampedArray } {
  const value = artifact.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
  if (!Number.isSafeInteger(value?.width) || !Number.isSafeInteger(value?.height) || Number(value?.width) < 1 || Number(value?.height) < 1 || !(value?.data instanceof Uint8ClampedArray) || value.data.length !== Number(value.width) * Number(value.height) * 4) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical Crop source RGBA pixels are unavailable');
  return { width: Number(value.width), height: Number(value.height), data: value.data };
}

async function decodePngRgba(bytes: Uint8Array, expectedWidth: number, expectedHeight: number): Promise<Readonly<{ width: number; height: number; data: Uint8ClampedArray }>> {
  if (!bytes.byteLength) throw serviceError(400, 'local_image_empty', 'Local Crop image upload is empty');
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'png') throw serviceError(415, 'local_image_format_mismatch', 'Crop output must be PNG');
    const width = metadata.width; const height = metadata.height;
    if (!width || !height || width !== expectedWidth || height !== expectedHeight) throw serviceError(400, 'local_image_dimensions_mismatch', 'Uploaded Crop image dimensions do not match the Core ticket');
    const result = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (result.info.width !== width || result.info.height !== height || result.info.channels !== 4) throw serviceError(400, 'local_image_decode_failed', 'Crop PNG must decode to RGBA8');
    return Object.freeze({ width, height, data: new Uint8ClampedArray(result.data) });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) throw error;
    throw serviceError(400, 'local_image_decode_failed', 'Crop PNG could not be decoded');
  }
}

function assertExactPixels(expected: Uint8ClampedArray, actual: Uint8ClampedArray): void {
  if (expected.length !== actual.length) throw serviceError(422, 'local_crop_pixel_mismatch', 'Crop candidate pixel length differs from Core recomputation');
  for (let index = 0; index < expected.length; index += 1) if (expected[index] !== actual[index]) throw serviceError(422, 'local_crop_pixel_mismatch', `Crop candidate differs from Core recomputation at byte ${index}`);
}

function failedReplay(executionId: string): LocalCropSubmission {
  const outcome: ProductionOutcome = Object.freeze({ executionId, status: 'FAILED', verification: Object.freeze({ valid: false, checks: Object.freeze(['LOCAL_EXECUTION_TERMINAL_REPLAY']), errors: Object.freeze(['LOCAL_EXECUTION_PREVIOUSLY_FAILED']) }), artifacts: Object.freeze([]) });
  return Object.freeze({ executionId, status: 'FAILED', outcome });
}
function successReplay(executionId: string, artifactId: string): LocalCropSubmission {
  const outcome: ProductionOutcome = Object.freeze({ executionId, status: 'SUCCESS', verification: Object.freeze({ valid: true, checks: Object.freeze(['LOCAL_EXECUTION_TERMINAL_REPLAY']), errors: Object.freeze([]) }), artifacts: Object.freeze([]) });
  return Object.freeze({ executionId, status: 'SUCCESS', artifactId, outcome });
}
function ticketIdempotencyKey(clientRequestId: string): string { return `${clientRequestId}${IDEMPOTENCY_SUFFIX}`; }
function clientRequestIdFromTicket(ticket: LocalExecutionTicketV2): string {
  if (!ticket.idempotencyKey.endsWith(IDEMPOTENCY_SUFFIX)) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable Crop ticket idempotency key is malformed');
  const value = ticket.idempotencyKey.slice(0, -IDEMPOTENCY_SUFFIX.length);
  if (!value) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable Crop ticket lacks client request identity');
  return value;
}
function cropExecutionId(scope: AuthenticatedScope & { projectId: string }, clientRequestId: string): string {
  return `local-crop-${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}
function sameDurableTicket(a: LocalExecutionTicketV2, b: LocalExecutionTicketV2): boolean {
  return a.ticketId === b.ticketId && a.version === b.version && a.nonce === b.nonce && a.idempotencyKey === b.idempotencyKey && a.requestId === b.requestId && a.workflowId === b.workflowId && a.stepId === b.stepId && canonicalJson(a.scope) === canonicalJson(b.scope) && canonicalJson(a.inputs) === canonicalJson(b.inputs) && canonicalJson(a.expectedOutputs) === canonicalJson(b.expectedOutputs) && canonicalJson(a.allowedExecutors) === canonicalJson(b.allowedExecutors) && canonicalJson(a.operation) === canonicalJson(b.operation);
}
function artifactHash(artifact: CreativeArtifact): string | undefined { const value = artifact.metadata?.sha256; return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value : undefined; }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)])); }
function assertSameScope(a: AuthenticatedScope & { projectId: string }, b: AuthenticatedScope & { projectId: string }): void { if (a.tenantId !== b.tenantId || a.userId !== b.userId || a.projectId !== b.projectId) throw serviceError(403, 'local_execution_scope_denied', 'Local Crop execution scope denied'); }
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
