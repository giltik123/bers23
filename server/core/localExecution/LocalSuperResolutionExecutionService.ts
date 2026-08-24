import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  CreativeExecutionPlatform,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type LocalExecutionModelExecutorBinding,
  type LocalExecutionResultV2,
  type LocalExecutionTicketV2,
  type ProductionOutcome,
} from '../../../src/platform/creative/canonical/index.ts';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import {
  MAX_SUPER_RESOLUTION_OUTPUT_PIXELS,
  REAL_ESRGAN_UPSCALE_CAPABILITY,
  SUPER_RESOLUTION_ALPHA_POLICY,
  SUPER_RESOLUTION_OPERATION,
  SUPER_RESOLUTION_SCALE,
  SUPER_RESOLUTION_STEP_ID,
} from '../../../src/platform/creative/super-resolution/SuperResolutionContract.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import type { PostgresLocalExecutionUploadStore } from './PostgresLocalExecutionUploadStore.ts';

const IDEMPOTENCY_SUFFIX = `:${SUPER_RESOLUTION_STEP_ID}:local-v2`;

export type LocalSuperResolutionPrepareCommand = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  clientRequestId: string;
}>;

export type LocalSuperResolutionSubmission = Readonly<{
  executionId: string;
  status: ProductionOutcome['status'];
  artifactId?: string;
  outcome: ProductionOutcome;
}>;

export type LocalSuperResolutionServiceDependencies = Readonly<{
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
 * C3 Core boundary for model-backed x4 super-resolution.
 *
 * Unlike deterministic C2, Core cannot honestly prove that untrusted device output is
 * numerically equal to a model inference without running the model again. This service
 * therefore validates only what Core can own: exact v2 MODEL binding, canonical source
 * scope/hash, quarantined bytes/evidence, safe x4 geometry, opaque-alpha policy, lineage,
 * idempotency/replay and zero-cloud execution. The admitted artifact metadata states that
 * verification scope explicitly and is rejected if it masquerades as BYTE_EXACT proof.
 */
export class LocalSuperResolutionExecutionService {
  readonly #platform: CreativeExecutionPlatform;
  readonly #now: () => number;

  constructor(private readonly dependencies: LocalSuperResolutionServiceDependencies) {
    this.#platform = new CreativeExecutionPlatform(dependencies.platform);
    this.#now = dependencies.now ?? Date.now;
  }

  async prepare(command: LocalSuperResolutionPrepareCommand, auth: AuthenticatedScope): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>> {
    const normalized = normalizePrepare(command);
    const scope = Object.freeze({ ...auth, projectId: normalized.projectId });
    const executionId = superResolutionExecutionId(scope, normalized.clientRequestId);
    const idempotencyKey = ticketIdempotencyKey(normalized.clientRequestId);

    const durable = await this.dependencies.admission.getByIdempotencyKeyV2(scope, idempotencyKey);
    if (durable) {
      await this.validateDurablePrepareTicket(durable, normalized, scope, executionId);
      return Object.freeze({ executionId, ticket: durable });
    }

    if (!await this.dependencies.ownsArtifacts(scope, [normalized.sourceArtifactId])) throw serviceError(403, 'artifact_scope_denied', 'Source IMAGE is outside the authenticated project scope');
    const artifacts = await this.hydrateExactSource(scope, normalized.sourceArtifactId);
    if (!this.#platform.hasExecution(executionId)) this.createPlatformExecution(executionId, scope, artifacts, normalized.clientRequestId, normalized.sourceArtifactId);
    const plan = await this.#platform.plan(executionId);
    assertReadyPlan(plan.status, plan.operations);
    const tickets = await this.#platform.prepareLocalExecutionV2(executionId);
    if (tickets.length !== 1) throw serviceError(500, 'local_ticket_contract_error', 'Expected exactly one model-backed super-resolution ticket');
    const ticket = tickets[0];
    assertSuperResolutionTicket(ticket);
    if (ticket.idempotencyKey !== idempotencyKey) throw serviceError(500, 'local_ticket_idempotency_contract', 'Canonical super-resolution ticket idempotency binding is invalid');
    assertInputBinding(ticket, normalized.sourceArtifactId);
    return Object.freeze({ executionId, ticket });
  }

  async uploadImage(input: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>, auth: AuthenticatedScope) {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local execution ticket has expired');
    const expected = requireOutputContract(ticket);
    const decoded = await decodePngRgba(input.bytes, expected.width!, expected.height!);
    assertOpaqueOutput(decoded.data);
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

  async submit(input: Readonly<{ ticketId: string; projectId: string; result: unknown }>, auth: AuthenticatedScope): Promise<LocalSuperResolutionSubmission> {
    const ticket = await this.requireTicket(input.ticketId, auth, input.projectId);
    const claim = await this.dependencies.admission.claimV2({ ticketId: ticket.ticketId, result: input.result, callerScope: ticket.scope, now: this.#now() });
    if (!claim.allowed) {
      if (claim.reasonCode === 'REPLAYED_TICKET') return this.replayFinalized(ticket);
      const status = claim.reasonCode === 'IN_PROGRESS' ? 409 : claim.reasonCode === 'EXPIRED_TICKET' ? 410 : 400;
      throw serviceError(status, `local_result_${claim.reasonCode.toLowerCase()}`, `Local result admission denied: ${claim.reasonCode}`);
    }

    try {
      const artifacts = await this.revalidateCanonicalSource(ticket);
      await this.ensurePlatformExecution(ticket, artifacts);
      const result = claim.result as LocalExecutionResultV2;
      const executor = requireModelExecutor(ticket, result);
      if (result.outputs.length !== 1) throw serviceError(400, 'local_result_output_count', 'Super-resolution requires exactly one output');
      const evidence = result.outputs[0];
      const upload = await this.dependencies.uploads.load(evidence.uploadId, ticket.ticketId, ticket.scope, this.#now());
      if (!upload) throw serviceError(400, 'local_upload_unavailable', 'Quarantined model output is unavailable or expired');
      if (upload.sha256 !== evidence.sha256 || upload.sizeBytes !== evidence.sizeBytes || upload.kind !== evidence.kind || upload.role !== evidence.role || upload.mimeType !== evidence.mimeType || upload.width !== evidence.width || upload.height !== evidence.height) throw serviceError(400, 'local_upload_evidence_mismatch', 'Submitted result evidence does not match quarantined bytes');
      if (upload.kind !== 'image' || upload.role !== 'COMPOSITE' || upload.mimeType !== 'image/png') throw serviceError(400, 'local_upload_contract_mismatch', 'Quarantined output is not a PNG COMPOSITE candidate');

      const source = requireSource(artifacts, ticket);
      assertOpaqueSource(source.value.data);
      const expected = requireOutputContract(ticket);
      assertX4Geometry(source.value.width, source.value.height, expected.width!, expected.height!);
      const candidate = await decodePngRgba(upload.bytes, expected.width!, expected.height!);
      assertOpaqueOutput(candidate.data);

      const admittedArtifact: CreativeArtifact = Object.freeze({
        id: `core-admitted-model:${ticket.ticketId}`,
        kind: 'image',
        value: Object.freeze({ width: candidate.width, height: candidate.height, data: candidate.data, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' }),
        producerOperationId: ticket.stepId,
        scope: ticket.scope,
        state: 'FINAL',
        role: 'COMPOSITE',
        image: Object.freeze({ width: candidate.width, height: candidate.height, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb', alpha: false }),
        metadata: Object.freeze({
          artifactRole: 'COMPOSITE',
          localExecutionAdmission: 'ADMITTED',
          admissionClass: 'MODEL_CONTRACT',
          verificationScope: 'CONTRACT_AND_LINEAGE_ONLY',
          modelOutputSemantics: 'UNATTESTED_DEVICE_INFERENCE',
          ticketId: ticket.ticketId,
          executorKind: 'MODEL',
          modelId: executor.modelId,
          modelVersion: executor.version,
          runtime: result.runtime,
          accelerator: result.accelerator,
          candidateSha256: upload.sha256,
          postprocess: 'CLAMP_0_1',
          alphaPolicy: SUPER_RESOLUTION_ALPHA_POLICY,
          sourceWidth: source.value.width,
          sourceHeight: source.value.height,
          outputScale: SUPER_RESOLUTION_SCALE,
          parentArtifactIds: Object.freeze(ticket.inputs.map(binding => binding.artifactId)),
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
      if (outcome.status !== 'SUCCESS') throw serviceError(422, 'local_execution_verification_failed', 'Canonical model-backed execution did not pass workflow verification');

      const stored = await this.dependencies.persistFinal(ticket.scope, ticket.requestId, ticket.stepId, { width: candidate.width, height: candidate.height, data: candidate.data });
      const artifactId = this.dependencies.issueFinalId(stored.storageId, ticket.scope);
      await this.dependencies.admission.commit(ticket.ticketId, 'SUCCESS');
      await this.dependencies.uploads.consume(upload.uploadId, ticket.ticketId, ticket.scope, this.#now());
      return Object.freeze({ executionId: ticket.requestId, status: 'SUCCESS', artifactId, outcome });
    } catch (error) {
      await this.dependencies.admission.release(ticket.ticketId).catch(() => undefined);
      throw error;
    }
  }

  private async replayFinalized(ticket: LocalExecutionTicketV2): Promise<LocalSuperResolutionSubmission> {
    const finalization = await this.dependencies.admission.getFinalization(ticket.ticketId);
    if (!finalization || finalization.status === 'UNKNOWN') throw serviceError(409, 'local_finalization_unknown', 'Local execution was consumed without a recoverable terminal status');
    if (finalization.status === 'FAILED') {
      const outcome: ProductionOutcome = Object.freeze({ executionId: ticket.requestId, status: 'FAILED', verification: Object.freeze({ valid: false, checks: Object.freeze(['LOCAL_EXECUTION_TERMINAL_REPLAY']), errors: Object.freeze(['LOCAL_EXECUTION_PREVIOUSLY_FAILED']) }), artifacts: Object.freeze([]) });
      return Object.freeze({ executionId: ticket.requestId, status: 'FAILED', outcome });
    }
    const stored = await this.dependencies.loadPersistedFinal(ticket.requestId, ticket.scope);
    if (!stored) throw serviceError(409, 'local_finalization_artifact_unavailable', 'Committed super-resolution FINAL is unavailable');
    const artifactId = this.dependencies.issueFinalId(stored.storageId, ticket.scope);
    const outcome: ProductionOutcome = Object.freeze({ executionId: ticket.requestId, status: 'SUCCESS', verification: Object.freeze({ valid: true, checks: Object.freeze(['LOCAL_EXECUTION_TERMINAL_REPLAY']), errors: Object.freeze([]) }), artifacts: Object.freeze([]) });
    return Object.freeze({ executionId: ticket.requestId, status: 'SUCCESS', artifactId, outcome });
  }

  private async requireTicket(ticketId: string, auth: AuthenticatedScope, projectId: string): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw serviceError(404, 'local_ticket_not_found', 'Local execution ticket not found');
    assertSameScope(ticket.scope, { ...auth, projectId });
    assertSuperResolutionTicket(ticket);
    return ticket;
  }

  private async validateDurablePrepareTicket(ticket: LocalExecutionTicketV2, command: LocalSuperResolutionPrepareCommand, scope: AuthenticatedScope & { projectId: string }, executionId: string): Promise<void> {
    assertSameScope(ticket.scope, scope);
    assertSuperResolutionTicket(ticket);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local execution ticket has expired');
    if (ticket.requestId !== executionId || ticket.workflowId !== executionId || ticket.idempotencyKey !== ticketIdempotencyKey(command.clientRequestId)) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to another super-resolution execution');
    assertInputBinding(ticket, command.sourceArtifactId);
    if (!await this.dependencies.ownsArtifacts(scope, [command.sourceArtifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical super-resolution source is no longer authorized or available');
    const artifacts = await this.hydrateExactSource(scope, command.sourceArtifactId);
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical local execution input revalidation failed: ${decision.reasonCode}`);
  }

  private async revalidateCanonicalSource(ticket: LocalExecutionTicketV2): Promise<readonly CreativeArtifact[]> {
    assertSuperResolutionTicket(ticket);
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image') throw serviceError(409, 'local_input_contract_mismatch', 'Super-resolution requires exactly one canonical IMAGE input');
    const sourceBinding = ticket.inputs[0];
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical super-resolution source is no longer authorized or available');
    const artifacts = await this.hydrateExactSource(ticket.scope, sourceBinding.artifactId);
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical local execution input revalidation failed: ${decision.reasonCode}`);
    return artifacts;
  }

  private async hydrateExactSource(scope: AuthenticatedScope & { projectId: string }, sourceArtifactId: string): Promise<readonly CreativeArtifact[]> {
    try {
      const artifacts = await this.dependencies.hydrateArtifacts(scope, sourceArtifactId, []);
      const source = artifacts.find(artifact => artifact.id === sourceArtifactId && artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'COMPOSITE'));
      if (!source) throw new Error('Canonical super-resolution source was not hydrated');
      const pixels = requireSourcePixels(source);
      if (!artifactHash(source)) throw new Error('Canonical super-resolution source integrity hash is missing');
      assertOpaqueSource(pixels.data);
      const outputWidth = pixels.width * SUPER_RESOLUTION_SCALE; const outputHeight = pixels.height * SUPER_RESOLUTION_SCALE;
      assertX4Geometry(pixels.width, pixels.height, outputWidth, outputHeight);
      return artifacts;
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error;
      throw serviceError(409, 'local_input_lineage_unavailable', error instanceof Error ? error.message : 'Canonical super-resolution source is unavailable');
    }
  }

  private async ensurePlatformExecution(ticket: LocalExecutionTicketV2, artifacts: readonly CreativeArtifact[]): Promise<void> {
    if (this.#platform.hasExecution(ticket.requestId)) return;
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image') throw serviceError(409, 'local_execution_recovery_input', 'Durable super-resolution ticket lacks its IMAGE binding');
    const clientRequestId = clientRequestIdFromTicket(ticket);
    this.createPlatformExecution(ticket.requestId, ticket.scope, artifacts, clientRequestId, ticket.inputs[0].artifactId);
    const plan = await this.#platform.plan(ticket.requestId);
    assertReadyPlan(plan.status, plan.operations);
    const recovered = await this.#platform.prepareLocalExecutionV2(ticket.requestId);
    if (recovered.length !== 1 || !sameDurableTicket(recovered[0], ticket)) throw serviceError(409, 'local_execution_recovery_mismatch', 'Reconstructed canonical super-resolution execution does not match the durable ticket');
  }

  private createPlatformExecution(executionId: string, scope: AuthenticatedScope & { projectId: string }, artifacts: readonly CreativeArtifact[], clientRequestId: string, sourceArtifactId: string): void {
    this.#platform.createExecution({
      id: executionId,
      intent: 'increase image resolution four times locally',
      scope,
      inputArtifacts: artifacts,
      budget: { credits: 0, aiCalls: 0, retries: 0 },
      metadata: {
        operationIntent: SUPER_RESOLUTION_OPERATION,
        sourceArtifactId,
        idempotencyKey: clientRequestId,
        planningConstraints: { executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0 },
      },
    });
  }
}

function normalizePrepare(command: LocalSuperResolutionPrepareCommand): LocalSuperResolutionPrepareCommand {
  const projectId = command?.projectId?.trim(); const sourceArtifactId = command?.sourceArtifactId?.trim(); const clientRequestId = command?.clientRequestId?.trim();
  if (!projectId || !sourceArtifactId || !clientRequestId) throw serviceError(400, 'invalid_super_resolution_request', 'projectId, sourceArtifactId and clientRequestId are required');
  return Object.freeze({ projectId, sourceArtifactId, clientRequestId });
}

function assertReadyPlan(status: string | undefined, operations: readonly Readonly<{ type: string; id: string }>[]): void {
  if (status !== 'READY' || operations.length !== 1 || operations[0].type !== SUPER_RESOLUTION_OPERATION || operations[0].id !== SUPER_RESOLUTION_STEP_ID) throw serviceError(422, 'super_resolution_plan_blocked', `Canonical super-resolution plan is ${status ?? 'invalid'}`);
}

function assertSuperResolutionTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.operation.capability !== REAL_ESRGAN_UPSCALE_CAPABILITY || ticket.operation.type !== SUPER_RESOLUTION_OPERATION || ticket.operation.id !== SUPER_RESOLUTION_STEP_ID || ticket.stepId !== SUPER_RESOLUTION_STEP_ID || ticket.policy !== 'LOCAL_ONLY') throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not an accepted model-backed super-resolution contract');
  if (ticket.allowedExecutors.length !== 1 || ticket.allowedExecutors[0].kind !== 'MODEL') throw serviceError(409, 'local_ticket_executor_mismatch', 'Super-resolution must bind exactly one MODEL executor');
  const parameters = ticket.operation.parameters;
  if (!parameters || parameters.scale !== SUPER_RESOLUTION_SCALE || parameters.alphaPolicy !== SUPER_RESOLUTION_ALPHA_POLICY) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Super-resolution ticket parameters are invalid');
  requireOutputContract(ticket);
}

function assertInputBinding(ticket: LocalExecutionTicketV2, sourceArtifactId: string): void {
  if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || ticket.inputs[0].artifactId !== sourceArtifactId || !ticket.inputs[0].sha256) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to a different super-resolution source');
  requireOutputContract(ticket);
}

function requireOutputContract(ticket: LocalExecutionTicketV2) {
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || output.count !== 1 || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'image/png' || !Number.isInteger(output.width) || !Number.isInteger(output.height) || Number(output.width) < 1 || Number(output.height) < 1) throw serviceError(409, 'local_output_contract_error', 'Super-resolution ticket is not a single PNG COMPOSITE output contract');
  const pixels = Number(output.width) * Number(output.height);
  if (!Number.isSafeInteger(pixels) || pixels > MAX_SUPER_RESOLUTION_OUTPUT_PIXELS) throw serviceError(409, 'local_output_contract_unsafe', 'Super-resolution ticket exceeds the safe output pixel limit');
  return output;
}

function requireModelExecutor(ticket: LocalExecutionTicketV2, result: LocalExecutionResultV2): LocalExecutionModelExecutorBinding {
  const allowed = ticket.allowedExecutors[0];
  if (!allowed || allowed.kind !== 'MODEL' || result.executor.kind !== 'MODEL' || result.executor.modelId !== allowed.modelId || result.executor.version !== allowed.version) throw serviceError(400, 'local_executor_mismatch', 'Result is not the MODEL executor authorized by this Core ticket');
  if (result.runtime === 'BROWSER_JS') throw serviceError(400, 'local_runtime_mismatch', 'Model-backed execution cannot claim deterministic browser runtime');
  return allowed;
}

function requireSource(artifacts: readonly CreativeArtifact[], ticket: LocalExecutionTicketV2) {
  const binding = ticket.inputs[0]; const artifact = artifacts.find(value => value.id === binding.artifactId && value.kind === 'image');
  if (!artifact) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical super-resolution source is unavailable');
  return Object.assign(artifact, { value: requireSourcePixels(artifact) }) as CreativeArtifact & { value: { width: number; height: number; data: Uint8ClampedArray } };
}

function requireSourcePixels(artifact: CreativeArtifact): { width: number; height: number; data: Uint8ClampedArray } {
  const value = artifact.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
  if (!Number.isInteger(value?.width) || !Number.isInteger(value?.height) || Number(value?.width) < 1 || Number(value?.height) < 1 || !(value?.data instanceof Uint8ClampedArray) || value.data.length !== Number(value.width) * Number(value.height) * 4) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical source RGBA pixels are unavailable');
  return { width: Number(value.width), height: Number(value.height), data: value.data };
}

async function decodePngRgba(bytes: Uint8Array, expectedWidth: number, expectedHeight: number): Promise<Readonly<{ width: number; height: number; data: Uint8ClampedArray }>> {
  if (!bytes.byteLength) throw serviceError(400, 'local_image_empty', 'Local model image upload is empty');
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'png') throw serviceError(415, 'local_image_format_mismatch', 'Super-resolution model output must be PNG');
    const width = metadata.width; const height = metadata.height;
    if (!width || !height || width !== expectedWidth || height !== expectedHeight) throw serviceError(400, 'local_image_dimensions_mismatch', 'Uploaded super-resolution image dimensions do not match the ticket');
    const pixels = width * height;
    if (!Number.isSafeInteger(pixels) || pixels > MAX_SUPER_RESOLUTION_OUTPUT_PIXELS) throw serviceError(400, 'local_image_dimensions_unsafe', 'Uploaded super-resolution image exceeds the safe pixel limit');
    const result = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (result.info.width !== width || result.info.height !== height || result.info.channels !== 4) throw serviceError(400, 'local_image_decode_failed', 'Super-resolution PNG must decode to RGBA8');
    return Object.freeze({ width, height, data: new Uint8ClampedArray(result.data) });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) throw error;
    throw serviceError(400, 'local_image_decode_failed', 'Super-resolution PNG could not be decoded');
  }
}

function assertOpaqueSource(data: Uint8ClampedArray): void {
  for (let offset = 3; offset < data.length; offset += 4) if (data[offset] !== 255) throw serviceError(409, 'local_input_alpha_policy_mismatch', 'Super-resolution v1 accepts opaque source images only');
}
function assertOpaqueOutput(data: Uint8ClampedArray): void {
  for (let offset = 3; offset < data.length; offset += 4) if (data[offset] !== 255) throw serviceError(400, 'local_output_alpha_policy_mismatch', 'Super-resolution v1 output must be opaque RGBA8');
}
function assertX4Geometry(sourceWidth: number, sourceHeight: number, outputWidth: number, outputHeight: number): void {
  if (outputWidth !== sourceWidth * SUPER_RESOLUTION_SCALE || outputHeight !== sourceHeight * SUPER_RESOLUTION_SCALE) throw serviceError(409, 'local_output_geometry_mismatch', 'Super-resolution output contract must be exact x4 geometry');
  const pixels = outputWidth * outputHeight;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_SUPER_RESOLUTION_OUTPUT_PIXELS) throw serviceError(409, 'local_output_contract_unsafe', 'Super-resolution output exceeds the safe full-frame limit');
}
function ticketIdempotencyKey(clientRequestId: string): string { return `${clientRequestId}${IDEMPOTENCY_SUFFIX}`; }
function clientRequestIdFromTicket(ticket: LocalExecutionTicketV2): string {
  if (!ticket.idempotencyKey.endsWith(IDEMPOTENCY_SUFFIX)) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable super-resolution ticket idempotency key is malformed');
  const value = ticket.idempotencyKey.slice(0, -IDEMPOTENCY_SUFFIX.length);
  if (!value) throw serviceError(409, 'local_execution_recovery_parameters', 'Durable super-resolution ticket lacks client request identity');
  return value;
}
function superResolutionExecutionId(scope: AuthenticatedScope & { projectId: string }, clientRequestId: string): string {
  return `local-super-resolution-${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex').slice(0, 32)}`;
}
function sameDurableTicket(a: LocalExecutionTicketV2, b: LocalExecutionTicketV2): boolean {
  return a.ticketId === b.ticketId && a.version === b.version && a.nonce === b.nonce && a.idempotencyKey === b.idempotencyKey && a.requestId === b.requestId && a.workflowId === b.workflowId && a.stepId === b.stepId && canonicalJson(a.scope) === canonicalJson(b.scope) && canonicalJson(a.inputs) === canonicalJson(b.inputs) && canonicalJson(a.expectedOutputs) === canonicalJson(b.expectedOutputs) && canonicalJson(a.allowedExecutors) === canonicalJson(b.allowedExecutors) && canonicalJson(a.operation) === canonicalJson(b.operation);
}
function artifactHash(artifact: CreativeArtifact): string | undefined { const value = artifact.metadata?.sha256; return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value) ? value : undefined; }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown { if (Array.isArray(value)) return value.map(canonicalValue); if (!value || typeof value !== 'object') return value; return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)])); }
function assertSameScope(a: AuthenticatedScope & { projectId: string }, b: AuthenticatedScope & { projectId: string }): void { if (a.tenantId !== b.tenantId || a.userId !== b.userId || a.projectId !== b.projectId) throw serviceError(403, 'local_execution_scope_denied', 'Local execution scope denied'); }
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
