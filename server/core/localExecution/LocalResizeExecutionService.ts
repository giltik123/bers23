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
  RESIZE_CAPABILITY,
  RESIZE_OPERATION,
  RESIZE_STEP_ID,
  RESIZE_TOOL_ID,
  RESIZE_TOOL_VERSION,
  normalizeResizeDimensions,
  resizeRgba8,
  type ResizeDimensions,
} from '../../../src/platform/creative/deterministic/Resize.ts';
import { RESIZE_TOOL_DEFINITION } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import type { PostgresLocalExecutionUploadStore } from './PostgresLocalExecutionUploadStore.ts';

const TOOL = RESIZE_TOOL_DEFINITION;
const IDEMPOTENCY_SUFFIX = `:${RESIZE_STEP_ID}:local-v2`;

export type LocalResizePrepareCommand = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  clientRequestId: string;
  width: number;
  height: number;
}>;

export type LocalResizeSubmission = Readonly<{
  executionId: string;
  status: ProductionOutcome['status'];
  artifactId?: string;
  outcome: ProductionOutcome;
}>;

export type LocalResizeServiceDependencies = Readonly<{
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
    lineage: Readonly<{ sourceArtifactId: string; producerOperation: 'RESIZE' }>,
  ) => Promise<Readonly<{ storageId: string; width: number; height: number }>>;
  loadPersistedFinal: (executionId: string, scope: AuthenticatedScope & { projectId: string }) => Promise<Readonly<{ storageId: string; width: number; height: number }> | undefined>;
  issueFinalId: (storageId: string, scope: AuthenticatedScope & { projectId: string }) => string;
  now?: () => number;
}>;

/**
 * Exact Core authority for deterministic Resize v1.
 * Browser PNG bytes remain quarantined candidates. Core rehydrates the exact
 * canonical IMAGE, independently recomputes fixed-point Resize RGBA bytes and
 * persists a FINAL only after byte equality plus canonical workflow verification.
 * No Provider or external Billing port is present.
 */
export class LocalResizeExecutionService {
  readonly #platform: CreativeExecutionPlatform;
  readonly #now: () => number;

  constructor(private readonly dependencies: LocalResizeServiceDependencies) {
    this.#platform = new CreativeExecutionPlatform(dependencies.platform);
    this.#now = dependencies.now ?? Date.now;
  }

  async prepare(command: LocalResizePrepareCommand, auth: AuthenticatedScope): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>> {
    const normalized = normalizePrepare(command);
    const scope = Object.freeze({ ...auth, projectId: normalized.projectId });
    const executionId = resizeExecutionId(scope, normalized.clientRequestId);
    const idempotencyKey = ticketIdempotencyKey(normalized.clientRequestId);

    const durable = await this.dependencies.admission.getByIdempotencyKeyV2(scope, idempotencyKey);
    if (durable) {
      await this.validateDurablePrepareTicket(durable, normalized, scope, executionId);
      return Object.freeze({ executionId, ticket: durable });
    }

    if (!await this.dependencies.ownsArtifacts(scope, [normalized.sourceArtifactId])) throw serviceError(403, 'artifact_scope_denied', 'Resize source IMAGE is outside the authenticated project scope');
    const artifacts = await this.hydrateExactSource(scope, normalized.sourceArtifactId, normalized);
    if (!this.#platform.hasExecution(executionId)) this.createPlatformExecution(executionId, scope, artifacts, normalized);
    const plan = await this.#platform.plan(executionId);
    assertReadyPlan(plan.status, plan.operations);
    const tickets = await this.#platform.prepareLocalExecutionV2(executionId);
    if (tickets.length !== 1) throw serviceError(500, 'local_ticket_contract_error', 'Expected exactly one deterministic Resize ticket');
    const ticket = tickets[0];
    assertResizeTicket(ticket);
    if (ticket.idempotencyKey !== idempotencyKey) throw serviceError(500, 'local_ticket_idempotency_contract', 'Canonical Resize ticket idempotency binding is invalid');
    assertExactCommandBinding(ticket, normalized);
    return Object.freeze({ executionId, ticket });
  }

  async uploadImage(input: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>, auth: AuthenticatedScope) {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local Resize ticket has expired');
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

  async submit(input: Readonly<{ ticketId: string; projectId: string; result: unknown }>, auth: AuthenticatedScope): Promise<LocalResizeSubmission> {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    const claim = await this.dependencies.admission.claimV2({ ticketId: ticket.ticketId, result: input.result, callerScope: ticket.scope, now: this.#now() });
    if (!claim.allowed) {
      if (claim.reasonCode === 'REPLAYED_TICKET') return this.replayFinalized(ticket);
      const status = claim.reasonCode === 'IN_PROGRESS' ? 409 : claim.reasonCode === 'EXPIRED_TICKET' ? 410 : 400;
      throw serviceError(status, `local_result_${claim.reasonCode.toLowerCase()}`, `Local Resize result admission denied: ${claim.reasonCode}`);
    }

    try {
      const artifacts = await this.revalidateCanonicalSource(ticket);
      await this.ensurePlatformExecution(ticket, artifacts);
      const result = claim.result as LocalExecutionResultV2;
      assertResultExecutor(ticket, result);
      if (result.outputs.length !== 1) throw serviceError(400, 'local_result_output_count', 'Resize requires exactly one output');
      const evidence = result.outputs[0];
      const upload = await this.dependencies.uploads.load(evidence.uploadId, ticket.ticketId, ticket.scope, this.#now());
      if (!upload) throw serviceError(400, 'local_upload_unavailable', 'Quarantined Resize output is unavailable or expired');
      if (upload.sha256 !== evidence.sha256 || upload.sizeBytes !== evidence.sizeBytes || upload.kind !== evidence.kind || upload.role !== evidence.role || upload.mimeType !== evidence.mimeType || upload.width !== evidence.width || upload.height !== evidence.height) throw serviceError(400, 'local_upload_evidence_mismatch', 'Submitted Resize evidence does not match quarantined bytes');
      if (upload.kind !== 'image' || upload.role !== 'COMPOSITE' || upload.mimeType !== 'image/png') throw serviceError(400, 'local_upload_contract_mismatch', 'Quarantined Resize output is not a PNG COMPOSITE candidate');

      const source = requireSource(artifacts, ticket);
      const target = dimensionsFromTicket(ticket, source.value.width, source.value.height);
      const output = requireOutputContract(ticket);
      if (Number(output.width) !== target.width || Number(output.height) !== target.height) throw serviceError(409, 'local_output_geometry_mismatch', 'Resize ticket output geometry does not match its target dimensions');
      const candidate = await decodePngRgba(upload.bytes, target.width, target.height);
      const expected = resizeRgba8(source.value.data, source.value.width, source.value.height, target);
      assertExactPixels(expected, candidate.data);

      const exact = TOOL.parameters.exact;
      const admittedArtifact: CreativeArtifact = Object.freeze({
        id: `core-verified-resize:${ticket.ticketId}`,
        kind: 'image',
        value: Object.freeze({ width: target.width, height: target.height, data: expected, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' }),
        producerOperationId: ticket.stepId,
        scope: ticket.scope,
        state: 'FINAL',
        role: 'COMPOSITE',
        image: Object.freeze({ width: target.width, height: target.height, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb', alpha: true }),
        metadata: Object.freeze({
          artifactRole: 'COMPOSITE',
          localExecutionAdmission: 'ADMITTED',
          admissionClass: 'DETERMINISTIC_BYTE_EXACT',
          verificationScope: 'BYTE_EXACT_CORE_RECOMPUTE',
          ticketId: ticket.ticketId,
          executorKind: 'DETERMINISTIC_TOOL',
          toolId: RESIZE_TOOL_ID,
          toolVersion: RESIZE_TOOL_VERSION,
          runtime: result.runtime,
          accelerator: result.accelerator,
          candidateSha256: upload.sha256,
          verifiedPixelSha256: createHash('sha256').update(expected).digest('hex'),
          sourceWidth: source.value.width,
          sourceHeight: source.value.height,
          resizeTarget: target,
          coordinateSpace: exact.coordinateSpace,
          interpolation: exact.interpolation,
          fixedPointBits: exact.fixedPointBits,
          rounding: exact.rounding,
          borderPolicy: exact.borderPolicy,
          alphaPolicy: exact.alphaPolicy,
          maxOutputPixels: exact.maxOutputPixels,
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
      if (outcome.status !== 'SUCCESS') throw serviceError(422, 'local_execution_verification_failed', 'Canonical Resize execution did not pass workflow verification');

      const stored = await this.dependencies.persistFinal(
        ticket.scope,
        ticket.requestId,
        ticket.stepId,
        { width: target.width, height: target.height, data: expected },
        { sourceArtifactId: source.artifact.id, producerOperation: 'RESIZE' },
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

  private async replayFinalized(ticket: LocalExecutionTicketV2): Promise<LocalResizeSubmission> {
    const finalization = await this.dependencies.admission.getFinalization(ticket.ticketId);
    if (!finalization || finalization.status === 'UNKNOWN') throw serviceError(409, 'local_finalization_unknown', 'Resize execution was consumed without a recoverable terminal status');
    if (finalization.status === 'FAILED') return failedReplay(ticket.requestId);
    const stored = await this.dependencies.loadPersistedFinal(ticket.requestId, ticket.scope);
    if (!stored) throw serviceError(409, 'local_finalization_artifact_unavailable', 'Committed Resize FINAL is unavailable');
    const output = requireOutputContract(ticket);
    if (stored.width !== output.width || stored.height !== output.height) throw serviceError(409, 'local_finalization_artifact_mismatch', 'Committed Resize FINAL geometry does not match the durable ticket');
    const artifactId = this.dependencies.issueFinalId(stored.storageId, ticket.scope);
    return successReplay(ticket.requestId, artifactId);
  }

  private async requireTicket(ticketId: string, auth: AuthenticatedScope, projectId: string): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw serviceError(404, 'local_ticket_not_found', 'Local Resize ticket not found');
    assertSameScope(ticket.scope, { ...auth, projectId });
    assertResizeTicket(ticket);
    return ticket;
  }

  private async validateDurablePrepareTicket(ticket: LocalExecutionTicketV2, command: LocalResizePrepareCommand, scope: AuthenticatedScope & { projectId: string }, executionId: string): Promise<void> {
    assertSameScope(ticket.scope, scope);
    assertResizeTicket(ticket);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local Resize ticket has expired');
    if (ticket.requestId !== executionId || ticket.workflowId !== executionId || ticket.idempotencyKey !== ticketIdempotencyKey(command.clientRequestId)) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to another Resize execution');
    assertExactCommandBinding(ticket, command);
    if (!await this.dependencies.ownsArtifacts(scope, [command.sourceArtifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical Resize source is no longer authorized or available');
    const artifacts = await this.hydrateExactSource(scope, command.sourceArtifactId, command);
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical Resize input revalidation failed: ${decision.reasonCode}`);
  }

  private async revalidateCanonicalSource(ticket: LocalExecutionTicketV2): Promise<readonly CreativeArtifact[]> {
    assertResizeTicket(ticket);
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image') throw serviceError(409, 'local_input_contract_mismatch', 'Resize requires exactly one canonical IMAGE input');
    const sourceBinding = ticket.inputs[0];
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical Resize source is no longer authorized or available');
    const parameters = parametersFromTicket(ticket);
    const artifacts = await this.hydrateExactSource(ticket.scope, sourceBinding.artifactId, { width: parameters.width, height: parameters.height });
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical Resize input revalidation failed: ${decision.reasonCode}`);
    return artifacts;
  }

  private async hydrateExactSource(scope: AuthenticatedScope & { projectId: string }, sourceArtifactId: string, target: ResizeDimensions): Promise<readonly CreativeArtifact[]> {
    try {
      const artifacts = await this.dependencies.hydrateArtifacts(scope, sourceArtifactId, []);
      const source = artifacts.find(artifact => artifact.id === sourceArtifactId && artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'COMPOSITE'));
      if (!source) throw new Error('Canonical Resize source was not hydrated');
      const pixels = requireSourcePixels(source);
      if (!artifactHash(source)) throw new Error('Canonical Resize source integrity hash is missing');
      normalizeResizeDimensions(target, pixels.width, pixels.height);
      return artifacts;
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error;
      throw serviceError(409, 'local_input_lineage_unavailable', error instanceof Error ? error.message : 'Canonical Resize source is unavailable');
    }
  }

  private async ensurePlatformExecution(ticket: LocalExecutionTicketV2, artifacts: readonly CreativeArtifact[]): Promise<void> {
    if (this.#platform.hasExecution(ticket.requestId)) return;
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image') throw serviceError(409, 'local_execution_recovery_input', 'Durable Resize ticket lacks its IMAGE binding');
    const clientRequestId = clientRequestIdFromTicket(ticket);
    const parameters = parametersFromTicket(ticket);
    this.createPlatformExecution(ticket.requestId, ticket.scope, artifacts, { projectId: ticket.scope.projectId, sourceArtifactId: ticket.inputs[0].artifactId, clientRequestId, width: parameters.width, height: parameters.height });
    const plan = await this.#platform.plan(ticket.requestId);
    assertReadyPlan(plan.status, plan.operations);
    const recovered = await this.#platform.prepareLocalExecutionV2(ticket.requestId);
    if (recovered.length !== 1 || !sameDurableTicket(recovered[0], ticket)) throw serviceError(409, 'local_execution_recovery_mismatch', 'Reconstructed canonical Resize execution does not match the durable ticket');
  }

  private createPlatformExecution(executionId: string, scope: AuthenticatedScope & { projectId: string }, artifacts: readonly CreativeArtifact[], command: LocalResizePrepareCommand): void {
    this.#platform.createExecution({
      id: executionId,
      intent: 'resize canonical image to exact pixel dimensions',
      scope,
      inputArtifacts: artifacts,
      budget: { credits: 0, aiCalls: 0, retries: 0 },
      metadata: {
        operationIntent: RESIZE_OPERATION,
        sourceArtifactId: command.sourceArtifactId,
        resizeDimensions: Object.freeze({ width: command.width, height: command.height }),
        idempotencyKey: command.clientRequestId,
        planningConstraints: { executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 },
      },
    });
  }
}

function normalizePrepare(command: LocalResizePrepareCommand): LocalResizePrepareCommand {
  const projectId = command?.projectId?.trim(); const sourceArtifactId = command?.sourceArtifactId?.trim(); const clientRequestId = command?.clientRequestId?.trim();
  if (!projectId || !sourceArtifactId || !clientRequestId) throw serviceError(400, 'invalid_resize_request', 'projectId, sourceArtifactId and clientRequestId are required');
  try {
    const target = normalizeResizeDimensions({ width: command.width, height: command.height }, 1, 1);
    return Object.freeze({ projectId, sourceArtifactId, clientRequestId, ...target });
  } catch (error) {
    throw serviceError(400, 'invalid_resize_request', error instanceof Error ? error.message : 'Resize target dimensions are invalid');
  }
}

function assertReadyPlan(status: string | undefined, operations: readonly Readonly<{ type: string; id: string }>[]): void {
  if (status !== 'READY' || operations.length !== 1 || operations[0].type !== RESIZE_OPERATION || operations[0].id !== RESIZE_STEP_ID) throw serviceError(422, 'resize_plan_blocked', `Canonical Resize plan is ${status ?? 'invalid'}`);
}

function assertResizeTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.operation.capability !== RESIZE_CAPABILITY || ticket.operation.type !== RESIZE_OPERATION || ticket.operation.id !== RESIZE_STEP_ID || ticket.stepId !== RESIZE_STEP_ID || ticket.policy !== 'LOCAL_ONLY') throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not an accepted deterministic Resize contract');
  if (ticket.allowedExecutors.length !== 1) throw serviceError(409, 'local_ticket_executor_mismatch', 'Resize must bind exactly one deterministic executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== RESIZE_TOOL_ID || executor.version !== RESIZE_TOOL_VERSION) throw serviceError(409, 'local_ticket_executor_mismatch', 'Resize executor binding is invalid');
  const parameters = parametersFromTicket(ticket);
  const exact = TOOL.parameters.exact;
  if (parameters.deterministicTool !== exact.deterministicTool || parameters.coordinateSpace !== exact.coordinateSpace || parameters.interpolation !== exact.interpolation || parameters.fixedPointBits !== exact.fixedPointBits || parameters.rounding !== exact.rounding || parameters.borderPolicy !== exact.borderPolicy || parameters.alphaPolicy !== exact.alphaPolicy || parameters.maxOutputPixels !== exact.maxOutputPixels) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Resize ticket semantic parameters are invalid');
  const output = requireOutputContract(ticket);
  if (output.width !== parameters.width || output.height !== parameters.height) throw serviceError(409, 'local_output_contract_error', 'Resize ticket output geometry does not match its parameters');
}

function assertExactCommandBinding(ticket: LocalExecutionTicketV2, command: LocalResizePrepareCommand): void {
  if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || ticket.inputs[0].artifactId !== command.sourceArtifactId || !ticket.inputs[0].sha256) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to a different Resize source');
  const parameters = parametersFromTicket(ticket);
  if (parameters.sourceArtifactId !== command.sourceArtifactId || parameters.width !== command.width || parameters.height !== command.height) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to different Resize target dimensions');
  const output = requireOutputContract(ticket);
  if (output.width !== command.width || output.height !== command.height) throw serviceError(409, 'local_execution_idempotency_mismatch', 'Durable Resize output geometry changed');
}

function parametersFromTicket(ticket: LocalExecutionTicketV2): Readonly<{ sourceArtifactId: string; width: number; height: number; deterministicTool: unknown; coordinateSpace: unknown; interpolation: unknown; fixedPointBits: unknown; rounding: unknown; borderPolicy: unknown; alphaPolicy: unknown; maxOutputPixels: unknown }> {
  const parameters = ticket.operation.parameters as Readonly<Record<string, unknown>> | undefined;
  const sourceArtifactId = typeof parameters?.sourceArtifactId === 'string' ? parameters.sourceArtifactId : '';
  const width = parameters?.width; const height = parameters?.height;
  if (!sourceArtifactId || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || Number(width) < 1 || Number(height) < 1) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Resize ticket target dimensions are invalid');
  try { normalizeResizeDimensions({ width: Number(width), height: Number(height) }, 1, 1); }
  catch (error) { throw serviceError(409, 'local_ticket_parameter_mismatch', error instanceof Error ? error.message : 'Resize ticket target dimensions exceed v1 limits'); }
  return Object.freeze({ sourceArtifactId, width: Number(width), height: Number(height), deterministicTool: parameters?.deterministicTool, coordinateSpace: parameters?.coordinateSpace, interpolation: parameters?.interpolation, fixedPointBits: parameters?.fixedPointBits, rounding: parameters?.rounding, borderPolicy: parameters?.borderPolicy, alphaPolicy: parameters?.alphaPolicy, maxOutputPixels: parameters?.maxOutputPixels });
}

function dimensionsFromTicket(ticket: LocalExecutionTicketV2, sourceWidth: number, sourceHeight: number): ResizeDimensions {
  const parameters = parametersFromTicket(ticket);
  try { return normalizeResizeDimensions({ width: parameters.width, height: parameters.height }, sourceWidth, sourceHeight); }
  catch (error) { throw serviceError(409, 'local_ticket_parameter_mismatch', error instanceof Error ? error.message : 'Resize ticket dimensions are invalid for the canonical source'); }
}

function requireOutputContract(ticket: LocalExecutionTicketV2) {
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || output.count !== 1 || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'image/png' || !Number.isSafeInteger(output.width) || !Number.isSafeInteger(output.height) || Number(output.width) < 1 || Number(output.height) < 1) throw serviceError(409, 'local_output_contract_error', 'Resize ticket is not a single PNG COMPOSITE output contract');
  return output;
}

function assertResultExecutor(ticket: LocalExecutionTicketV2, result: LocalExecutionResultV2): void {
  const allowed = ticket.allowedExecutors[0];
  if (!allowed || allowed.kind !== 'DETERMINISTIC_TOOL' || result.executor.kind !== 'DETERMINISTIC_TOOL' || result.executor.toolId !== allowed.toolId || result.executor.version !== allowed.version) throw serviceError(400, 'local_executor_mismatch', 'Result is not the deterministic Resize executor authorized by this Core ticket');
  if (result.runtime !== 'BROWSER_JS' || result.accelerator !== 'cpu') throw serviceError(400, 'local_runtime_mismatch', 'Resize v1 requires exact BROWSER_JS/cpu runtime identity');
}

function requireSource(artifacts: readonly CreativeArtifact[], ticket: LocalExecutionTicketV2): Readonly<{ artifact: CreativeArtifact; value: { width: number; height: number; data: Uint8ClampedArray } }> {
  const binding = ticket.inputs[0]; const artifact = artifacts.find(value => value.id === binding.artifactId && value.kind === 'image');
  if (!artifact) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical Resize source is unavailable');
  return Object.freeze({ artifact, value: requireSourcePixels(artifact) });
}

function requireSourcePixels(artifact: CreativeArtifact): { width: number; height: number; data: Uint8ClampedArray } {
  const value = artifact.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
  if (!Number.isSafeInteger(value?.width) || !Number.isSafeInteger(value?.height) || Number(value?.width) < 1 || Number(value?.height) < 1 || !(value?.data instanceof Uint8ClampedArray) || value.data.length !== Number(value.width) * Number(value.height) * 4) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical Resize source RGBA pixels are unavailable');
  return { width: Number(value.width), height: Number(value.height), data: value.data };
}

async function decodePngRgba(bytes: Uint8Array, expectedWidth: number, expectedHeight: number): Promise<Readonly<{ width: number; height: number; data: Uint8ClampedArray }>> {
  if (!bytes.byteLength) throw serviceError(400, 'local_image_empty', 'Local Resize image upload is empty');
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'png') throw serviceError(415, 'local_image_format_mismatch', 'Resize output must be PNG');
    const width = metadata.width; const height = metadata.height;
    if (!width || !height || width !== expectedWidth || height !== expectedHeight) throw serviceError(400, 'local_image_dimensions_mismatch', 'Uploaded Resize image dimensions do not match the Core ticket');
    const result = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (result.info.width !== width || result.info.height !== height || result.info.channels !== 4) throw serviceError(400, 'local_image_decode_failed', 'Resize PNG must decode to RGBA8');
    return Object.freeze({ width, height, data: new Uint8ClampedArray(result.data) });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) throw error;
    throw serviceError(400, 'local_image_decode_failed', 'Resize PNG could not be decoded');
  }
}

function assertExactPixels(expected: Uint8ClampedArray, actual: Uint8ClampedArray): void {
  if (expected.length !== actual.length) throw serviceError(422, 'local_resize_pixel_mismatch', 'Resize candidate pixel length differs from Core recomputation');
  for (let index = 0; index < expected.length; index += 1) if (expected[index] !== actual[index]) throw serviceError(422, 'local_resize_pixel_mismatch', `Resize candidate differs from Core recomputation at byte ${index}`);
}

function failedReplay(executionId: string): LocalResizeSubmission {
  const outcome: ProductionOutcome = Object.freeze({ executionId, status: 'FAILED', verification: Object.freeze({ valid: false, checks: Object.freeze(['LOCAL_EXECUTION_TERMINAL_REPLAY']), errors: Object.freeze(['LOCAL_EXECUTION_PREVIOUSLY_FAILED']) }), artifacts: Object.freeze([]) });
  return Object.freeze({ executionId, status: 'FAILED', outcome });
}
function successReplay(executionId: string, artifactId: string): LocalResizeSubmission {
  const outcome: ProductionOutcome = Object.freeze({ executionId, status: 'SUCCESS', verification: Object.freeze({ valid: true, checks: Object.freeze(['LOCAL_EXECUTION_TERMINAL_REPLAY']), errors: Object.freeze([]) }), artifacts: Object.freeze([]) });
  return Object.freeze({ executionId, status: 'SUCCESS', artifactId, outcome });
}
function ticketIdempotencyKey(clientRequestId: string): string { return `${clientRequestId}${IDEMPOTENCY_SUFFIX}`; }
function clientRequestIdFromTicket(ticket: LocalExecutionTicketV2): string {
  if (!ticket.idempotencyKey.endsWith(IDEMPOTENCY_SUFFIX)) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable Resize ticket idempotency key is malformed');
  const value = ticket.idempotencyKey.slice(0, -IDEMPOTENCY_SUFFIX.length);
  if (!value) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable Resize ticket lacks client request identity');
  return value;
}
function resizeExecutionId(scope: AuthenticatedScope & { projectId: string }, clientRequestId: string): string {
  return `local-resize-${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}
function sameDurableTicket(a: LocalExecutionTicketV2, b: LocalExecutionTicketV2): boolean {
  return a.ticketId === b.ticketId && a.version === b.version && a.nonce === b.nonce && a.idempotencyKey === b.idempotencyKey && a.requestId === b.requestId && a.workflowId === b.workflowId && a.stepId === b.stepId && canonicalJson(a.scope) === canonicalJson(b.scope) && canonicalJson(a.inputs) === canonicalJson(b.inputs) && canonicalJson(a.expectedOutputs) === canonicalJson(b.expectedOutputs) && canonicalJson(a.allowedExecutors) === canonicalJson(b.allowedExecutors) && canonicalJson(a.operation) === canonicalJson(b.operation);
}
function artifactHash(artifact: CreativeArtifact): string | undefined { const value = artifact.metadata?.sha256; return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value : undefined; }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)])); }
function assertSameScope(a: AuthenticatedScope & { projectId: string }, b: AuthenticatedScope & { projectId: string }): void { if (a.tenantId !== b.tenantId || a.userId !== b.userId || a.projectId !== b.projectId) throw serviceError(403, 'local_execution_scope_denied', 'Local Resize execution scope denied'); }
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }