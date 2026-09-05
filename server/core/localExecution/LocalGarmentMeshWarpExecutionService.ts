import { createHash } from 'node:crypto';
import sharp from 'sharp';
import {
  CreativeExecutionPlatform,
  type CreativeArtifact,
  type CreativeExecutionPlatformRuntimeDependencies,
  type LocalExecutionResultV2,
  type LocalExecutionTicketV2,
  type VerificationResult,
} from '../../../src/platform/creative/canonical/index.ts';
import {
  GARMENT_MESH_WARP_MAX_DIMENSION,
  GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
  garmentMeshWarpRgba8,
} from '../../../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import { GARMENT_MESH_WARP_STEP_ID } from '../../../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../../../src/platform/creative/deterministic/GarmentMeshWarpRegistryDefinition.js';
import type { ArtifactAuthority, StoredProjectImageEvidence } from '../artifacts/artifactAuthority.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { GarmentDestinationMesh } from '../fashion/bodyAnchorGeometry.ts';
import type { PostgresGarmentWarpLayerStore } from '../fashion/postgresGarmentWarpLayerStore.ts';
import type { PostgresProjectBodyAnchorStore } from '../fashion/postgresProjectBodyAnchorStore.ts';
import {
  assertGarmentMeshWarpTicket,
  garmentMeshWarpContractError,
  garmentMeshWarpExecutionId,
  garmentMeshWarpManagedBindings,
  garmentMeshWarpOutputContract,
  garmentMeshWarpParametersFromTicket,
  garmentMeshWarpTicketIdempotencyKey,
  sameGarmentMeshWarpTicket,
  type GarmentMeshWarpTicketParameters,
} from './GarmentMeshWarpExecutionContract.ts';
import type { GarmentMeshWarpInputDeliveryService, GarmentMeshWarpDeliveredInput } from './GarmentMeshWarpInputDeliveryService.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import type { ManagedGarmentLocalExecutionInputAuthority } from './ManagedGarmentLocalExecutionInputAuthority.ts';
import type { PostgresLocalExecutionUploadStore } from './PostgresLocalExecutionUploadStore.ts';

const TOOL = GARMENT_MESH_WARP_TOOL_DEFINITION;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CLIENT_REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

type ProjectEvidenceAuthority = Pick<ArtifactAuthority, 'resolveStoredImageEvidence'>;
type ManagedInputAuthority = Pick<ManagedGarmentLocalExecutionInputAuthority, 'bindView' | 'bindParametricRepresentation'>;
type BodyAnchorAuthority = Pick<PostgresProjectBodyAnchorStore, 'deriveDestinationMesh'>;
type InputDeliveryAuthority = Pick<GarmentMeshWarpInputDeliveryService, 'deliver'>;
type WarpLayerAuthority = Pick<PostgresGarmentWarpLayerStore, 'persist' | 'loadByExecution'>;

export type LocalGarmentMeshWarpPrepareCommand = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  garmentId: string;
  representationId: string;
  anchorSetId: string;
  clientRequestId: string;
}>;

export type LocalGarmentMeshWarpResourceLimits = Readonly<{
  maxDimension: number;
  maxPixels: number;
  maxUploadBytes: number;
}>;

export type LocalGarmentMeshWarpSubmission =
  | Readonly<{ executionId: string; status: 'SUCCESS'; layerId: string; contentSha256: string; verification: VerificationResult }>
  | Readonly<{ executionId: string; status: 'FAILED'; verification: VerificationResult }>;

export type LocalGarmentMeshWarpServiceDependencies = Readonly<{
  platform: CreativeExecutionPlatformRuntimeDependencies;
  artifacts: ProjectEvidenceAuthority;
  managedInputs: ManagedInputAuthority;
  bodyAnchors: BodyAnchorAuthority;
  delivery: InputDeliveryAuthority;
  admission: LocalExecutionLedgerV2;
  uploads: PostgresLocalExecutionUploadStore;
  layers: WarpLayerAuthority;
  limits: LocalGarmentMeshWarpResourceLimits;
  now?: () => number;
}>;

type WarpBinding = Readonly<{
  garmentId: string;
  viewId: string;
  representationId: string;
  anchorSetId: string;
  projectImageStorageId: string;
  projectImageSha256: string;
  viewSha256: string;
  representationSha256: string;
  anchorPayloadSha256: string;
  destinationMeshSha256: string;
}>;

type PlatformExecutionEvidence = Readonly<{
  project: StoredProjectImageEvidence;
  binding: WarpBinding;
}>;

type ResolvedPrepareEvidence = PlatformExecutionEvidence & Readonly<{
  view: Awaited<ReturnType<ManagedInputAuthority['bindView']>>;
  representation: Awaited<ReturnType<ManagedInputAuthority['bindParametricRepresentation']>>;
  mesh: GarmentDestinationMesh;
}>;

/**
 * Core-owned F4b.4 execution authority.
 *
 * The browser receives only the admitted Garment basis-view pixels plus a
 * server-derived destination mesh. Its PNG result is quarantined evidence, never
 * authority. On submit Core re-runs the purpose-bound delivery/revalidation path,
 * recomputes garmentMeshWarpRgba8 byte-for-byte and persists only the immutable
 * Fashion WORKING intermediate. This service never creates or accepts a Project FINAL.
 */
export class LocalGarmentMeshWarpExecutionService {
  readonly #platform: CreativeExecutionPlatform;
  readonly #now: () => number;
  readonly #limits: LocalGarmentMeshWarpResourceLimits;

  constructor(private readonly dependencies: LocalGarmentMeshWarpServiceDependencies) {
    this.#platform = new CreativeExecutionPlatform(dependencies.platform);
    this.#now = dependencies.now ?? Date.now;
    this.#limits = normalizeLimits(dependencies.limits);
  }

  async prepare(command: LocalGarmentMeshWarpPrepareCommand, auth: AuthenticatedScope): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>> {
    const normalized = normalizePrepare(command);
    const scope = Object.freeze({ ...auth, projectId: normalized.projectId });
    const executionId = garmentMeshWarpExecutionId(scope, normalized.clientRequestId);
    const idempotencyKey = garmentMeshWarpTicketIdempotencyKey(normalized.clientRequestId);

    const durable = await this.dependencies.admission.getByIdempotencyKeyV2(scope, idempotencyKey);
    if (durable) {
      await this.validateDurablePrepareTicket(durable, normalized, scope, executionId);
      return Object.freeze({ executionId, ticket: durable });
    }

    const evidence = await this.resolvePrepareEvidence(scope, normalized);
    assertWithinLimits(evidence.project.width, evidence.project.height, this.#limits);
    if (!this.#platform.hasExecution(executionId)) this.createPlatformExecution(executionId, scope, normalized, evidence);
    const plan = await this.#platform.plan(executionId);
    assertReadyPlan(plan.status, plan.operations);
    const tickets = await this.#platform.prepareLocalExecutionV2(executionId, {
      managedInputsByStep: Object.freeze({
        [GARMENT_MESH_WARP_STEP_ID]: Object.freeze([evidence.view, evidence.representation]),
      }),
    });
    if (tickets.length !== 1) throw warpError(500, 'local_ticket_contract_error', 'Expected exactly one garment mesh-warp ticket');
    const ticket = tickets[0];
    assertGarmentMeshWarpTicket(ticket);
    assertTicketWithinLimits(ticket, this.#limits);
    if (ticket.idempotencyKey !== idempotencyKey || ticket.requestId !== executionId || ticket.workflowId !== executionId) {
      throw warpError(500, 'local_ticket_idempotency_contract', 'Canonical garment mesh-warp ticket identity is invalid');
    }
    assertTicketMatchesCommandAndEvidence(ticket, normalized, evidence);
    return Object.freeze({ executionId, ticket });
  }

  async uploadImage(input: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>, auth: AuthenticatedScope) {
    const ticket = await this.requireTicket(input.ticketId, input.projectId, auth);
    if (this.#now() >= ticket.expiresAt) throw warpError(410, 'local_ticket_expired', 'Garment mesh-warp ticket has expired');
    assertTicketWithinLimits(ticket, this.#limits);
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1) throw warpError(400, 'local_image_empty', 'Garment mesh-warp image upload is empty');
    if (input.bytes.byteLength > this.#limits.maxUploadBytes) throw warpError(413, 'local_image_upload_too_large', 'Garment mesh-warp image upload exceeds the Core upload limit');
    const output = garmentMeshWarpOutputContract(ticket);
    const decoded = await decodePngRgba(input.bytes, Number(output.width), Number(output.height));
    const upload = await this.dependencies.uploads.persist({
      ticketId: ticket.ticketId,
      scope: ticket.scope,
      kind: 'image',
      role: 'WORKING',
      mimeType: 'image/png',
      width: decoded.width,
      height: decoded.height,
      bytes: input.bytes,
      expiresAt: ticket.expiresAt,
      now: this.#now(),
    });
    return Object.freeze({
      uploadId: upload.uploadId,
      kind: 'image',
      role: 'WORKING' as const,
      sha256: upload.sha256,
      sizeBytes: upload.sizeBytes,
      mimeType: upload.mimeType,
      width: upload.width,
      height: upload.height,
    });
  }

  async submit(input: Readonly<{ ticketId: string; projectId: string; result: unknown }>, auth: AuthenticatedScope): Promise<LocalGarmentMeshWarpSubmission> {
    const ticket = await this.requireTicket(input.ticketId, input.projectId, auth);
    const claim = await this.dependencies.admission.claimV2({ ticketId: ticket.ticketId, result: input.result, callerScope: ticket.scope, now: this.#now() });
    if (!claim.allowed) {
      if (claim.reasonCode === 'REPLAYED_TICKET') return this.replayFinalized(ticket);
      const status = claim.reasonCode === 'IN_PROGRESS' ? 409 : claim.reasonCode === 'EXPIRED_TICKET' ? 410 : 400;
      throw warpError(status, `local_result_${claim.reasonCode.toLowerCase()}`, `Garment mesh-warp result admission denied: ${claim.reasonCode}`);
    }

    let committed = false;
    try {
      assertTicketWithinLimits(ticket, this.#limits);
      const delivered = await this.dependencies.delivery.deliver(ticket.ticketId, ticket.scope.projectId, {
        tenantId: ticket.scope.tenantId,
        userId: ticket.scope.userId,
      });
      assertDeliveredInputMatchesTicket(ticket, delivered);
      await this.ensurePlatformExecution(ticket, delivered);

      const result = claim.result as LocalExecutionResultV2;
      assertResultExecutor(ticket, result);
      if (result.outputs.length !== 1) throw warpError(400, 'local_result_output_count', 'Garment mesh warp requires exactly one WORKING output');
      const evidence = result.outputs[0];
      const upload = await this.dependencies.uploads.load(evidence.uploadId, ticket.ticketId, ticket.scope, this.#now());
      if (!upload) throw warpError(400, 'local_upload_unavailable', 'Quarantined garment mesh-warp output is unavailable or expired');
      if (
        upload.sha256 !== evidence.sha256
        || upload.sizeBytes !== evidence.sizeBytes
        || upload.kind !== evidence.kind
        || upload.role !== evidence.role
        || upload.mimeType !== evidence.mimeType
        || upload.width !== evidence.width
        || upload.height !== evidence.height
      ) throw warpError(400, 'local_upload_evidence_mismatch', 'Submitted garment mesh-warp evidence does not match quarantined bytes');
      if (upload.kind !== 'image' || upload.role !== 'WORKING' || upload.mimeType !== 'image/png') {
        throw warpError(400, 'local_upload_contract_mismatch', 'Quarantined garment mesh-warp output is not a PNG WORKING candidate');
      }

      const candidate = await decodePngRgba(upload.bytes, delivered.outputWidth, delivered.outputHeight);
      const expected = garmentMeshWarpRgba8(
        delivered.basisViewRgba,
        delivered.basisViewWidth,
        delivered.basisViewHeight,
        {
          sourcePointsQ16: delivered.sourcePointsQ16,
          destinationPointsQ16: delivered.destinationPointsQ16,
          triangles: delivered.triangles,
          outputWidth: delivered.outputWidth,
          outputHeight: delivered.outputHeight,
        },
      );
      assertExactPixels(expected, candidate.data);

      const parameters = garmentMeshWarpParametersFromTicket(ticket);
      const admittedArtifact = admittedWorkingArtifact(ticket, result, delivered, parameters, upload.sha256, expected);
      const existingOutcome = this.#platform.result(ticket.requestId);
      const outcome = existingOutcome ?? await this.#platform.completeLocalExecution(ticket.requestId, {
        ticketId: ticket.ticketId,
        stepId: ticket.stepId,
        artifact: admittedArtifact,
        latencyMs: result.metrics.latencyMs,
        memoryMb: result.metrics.memoryBytes === undefined ? undefined : result.metrics.memoryBytes / (1024 * 1024),
      });
      if (outcome.status !== 'SUCCESS' || !outcome.verification.valid) {
        throw warpError(422, 'local_execution_verification_failed', 'Canonical garment mesh-warp execution did not pass workflow verification');
      }

      const stored = await this.dependencies.layers.persist(
        { tenantId: ticket.scope.tenantId, userId: ticket.scope.userId },
        {
          projectId: ticket.scope.projectId,
          executionId: ticket.requestId,
          ticketId: ticket.ticketId,
          projectImageStorageId: delivered.projectImageStorageId,
          projectImageSha256: delivered.projectImageSha256,
          garmentId: parameters.garmentId,
          viewId: parameters.viewId,
          viewContentSha256: parameters.viewSha256,
          representationId: parameters.representationId,
          representationContentSha256: parameters.representationSha256,
          anchorSetId: parameters.anchorSetId,
          anchorPayloadSha256: parameters.anchorPayloadSha256,
          destinationMeshSha256: delivered.destinationMeshSha256,
          width: delivered.outputWidth,
          height: delivered.outputHeight,
          rgba: Uint8Array.from(expected),
        },
      );
      await this.dependencies.admission.commit(ticket.ticketId, 'SUCCESS');
      committed = true;
      await this.dependencies.uploads.consume(upload.uploadId, ticket.ticketId, ticket.scope, this.#now()).catch(() => false);
      return Object.freeze({ executionId: ticket.requestId, status: 'SUCCESS', layerId: stored.id, contentSha256: stored.contentSha256, verification: outcome.verification });
    } catch (error) {
      if (!committed) await this.dependencies.admission.release(ticket.ticketId).catch(() => undefined);
      throw error;
    }
  }

  private async replayFinalized(ticket: LocalExecutionTicketV2): Promise<LocalGarmentMeshWarpSubmission> {
    const finalization = await this.dependencies.admission.getFinalization(ticket.ticketId);
    if (!finalization || finalization.status === 'UNKNOWN') throw warpError(409, 'local_finalization_unknown', 'Garment mesh-warp execution has no recoverable terminal status');
    if (finalization.status === 'FAILED') return Object.freeze({
      executionId: ticket.requestId,
      status: 'FAILED',
      verification: Object.freeze({ valid: false, checks: Object.freeze([]), errors: Object.freeze(['DURABLE_GARMENT_WARP_FAILED']) }),
    });
    const stored = await this.dependencies.layers.loadByExecution(
      { tenantId: ticket.scope.tenantId, userId: ticket.scope.userId },
      ticket.scope.projectId,
      ticket.requestId,
    );
    if (!stored || stored.ticketId !== ticket.ticketId) throw warpError(409, 'local_finalization_artifact_unavailable', 'Committed Fashion garment warp layer is unavailable');
    const output = garmentMeshWarpOutputContract(ticket);
    if (stored.width !== output.width || stored.height !== output.height) throw warpError(409, 'local_finalization_artifact_mismatch', 'Committed Fashion garment warp layer geometry differs from the durable ticket');
    return Object.freeze({
      executionId: ticket.requestId,
      status: 'SUCCESS',
      layerId: stored.id,
      contentSha256: stored.contentSha256,
      verification: Object.freeze({ valid: true, checks: Object.freeze(['DURABLE_FASHION_INTERMEDIATE_REPLAY']), errors: Object.freeze([]) }),
    });
  }

  private async requireTicket(ticketIdValue: string, projectIdValue: string, auth: AuthenticatedScope): Promise<LocalExecutionTicketV2> {
    const ticketId = normalizeNonEmpty(ticketIdValue, 'ticketId');
    const projectId = normalizeUuid(projectIdValue, 'projectId');
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw warpError(404, 'local_ticket_not_found', 'Garment mesh-warp ticket not found');
    if (ticket.scope.tenantId !== auth.tenantId || ticket.scope.userId !== auth.userId || ticket.scope.projectId !== projectId) {
      throw warpError(403, 'local_ticket_scope_mismatch', 'Garment mesh-warp ticket is outside the authenticated Project scope');
    }
    assertGarmentMeshWarpTicket(ticket);
    return ticket;
  }

  private async validateDurablePrepareTicket(
    ticket: LocalExecutionTicketV2,
    command: LocalGarmentMeshWarpPrepareCommand,
    scope: AuthenticatedScope & { projectId: string },
    executionId: string,
  ): Promise<void> {
    if (ticket.scope.tenantId !== scope.tenantId || ticket.scope.userId !== scope.userId || ticket.scope.projectId !== scope.projectId) throw warpError(403, 'local_execution_scope_denied', 'Durable garment mesh-warp ticket scope mismatch');
    assertGarmentMeshWarpTicket(ticket);
    assertTicketWithinLimits(ticket, this.#limits);
    if (this.#now() >= ticket.expiresAt) throw warpError(410, 'local_ticket_expired', 'Garment mesh-warp ticket has expired');
    if (ticket.requestId !== executionId || ticket.workflowId !== executionId || ticket.idempotencyKey !== garmentMeshWarpTicketIdempotencyKey(command.clientRequestId)) {
      throw warpError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to another garment mesh-warp execution');
    }
    const evidence = await this.resolvePrepareEvidence(scope, command);
    assertTicketMatchesCommandAndEvidence(ticket, command, evidence);
  }

  private async resolvePrepareEvidence(
    scope: AuthenticatedScope & { projectId: string },
    command: LocalGarmentMeshWarpPrepareCommand,
  ): Promise<ResolvedPrepareEvidence> {
    const owner = Object.freeze({ tenantId: scope.tenantId, userId: scope.userId });
    const project = await this.dependencies.artifacts.resolveStoredImageEvidence(scope, command.sourceArtifactId);
    const representation = await this.dependencies.managedInputs.bindParametricRepresentation(owner, command.garmentId, command.representationId);
    const view = await this.dependencies.managedInputs.bindView(owner, command.garmentId, representation.basisViewId);
    const mesh = await this.dependencies.bodyAnchors.deriveDestinationMesh(owner, scope.projectId, command.anchorSetId, command.garmentId, command.representationId);

    const projectAfter = await this.dependencies.artifacts.resolveStoredImageEvidence(scope, command.sourceArtifactId);
    const representationAfter = await this.dependencies.managedInputs.bindParametricRepresentation(owner, command.garmentId, command.representationId);
    const viewAfter = await this.dependencies.managedInputs.bindView(owner, command.garmentId, representationAfter.basisViewId);
    if (canonicalJson(projectAfter) !== canonicalJson(project) || canonicalJson(representationAfter) !== canonicalJson(representation) || canonicalJson(viewAfter) !== canonicalJson(view)) {
      throw warpError(409, 'garment_mesh_warp_prepare_evidence_stale', 'Garment mesh-warp authority changed during ticket preparation');
    }
    assertMeshProvenance(command, project, representation, view, mesh);
    const binding = Object.freeze({
      garmentId: command.garmentId,
      viewId: view.viewId,
      representationId: representation.representationId,
      anchorSetId: command.anchorSetId,
      projectImageStorageId: project.storageId,
      projectImageSha256: project.sha256,
      viewSha256: view.contentSha256,
      representationSha256: representation.contentSha256,
      anchorPayloadSha256: mesh.provenance.anchorPayloadSha256,
      destinationMeshSha256: mesh.meshSha256,
    });
    return Object.freeze({ project, view, representation, mesh, binding });
  }

  private createPlatformExecution(
    executionId: string,
    scope: AuthenticatedScope & { projectId: string },
    command: LocalGarmentMeshWarpPrepareCommand,
    evidence: PlatformExecutionEvidence,
  ): void {
    const source = projectLineageArtifact(scope, command.sourceArtifactId, evidence.project);
    this.#platform.createExecution({
      id: executionId,
      intent: 'deterministically warp admitted garment geometry to the current Project body anchors',
      scope,
      inputArtifacts: Object.freeze([source]),
      budget: Object.freeze({ credits: 0, aiCalls: 0, retries: 0 }),
      metadata: Object.freeze({
        operationIntent: GARMENT_MESH_WARP_OPERATION,
        sourceArtifactId: command.sourceArtifactId,
        garmentMeshWarpBinding: evidence.binding,
        idempotencyKey: command.clientRequestId,
        planningConstraints: Object.freeze({ executionPolicy: 'LOCAL_ONLY', confirmationPolicy: 'BLOCK', maxCredits: 0, forbiddenTargets: Object.freeze(['CLOUD']) }),
      }),
    });
  }

  private async ensurePlatformExecution(ticket: LocalExecutionTicketV2, delivered: GarmentMeshWarpDeliveredInput): Promise<void> {
    if (this.#platform.hasExecution(ticket.requestId)) return;
    const parameters = garmentMeshWarpParametersFromTicket(ticket);
    const managed = garmentMeshWarpManagedBindings(ticket);
    const clientRequestId = clientRequestIdFromTicket(ticket);
    const project: StoredProjectImageEvidence = Object.freeze({
      artifactId: parameters.sourceArtifactId,
      projectId: ticket.scope.projectId,
      storageId: delivered.projectImageStorageId,
      role: ticket.inputs[0].role === 'ORIGINAL' ? 'ORIGINAL' : 'COMPOSITE',
      lifecycle: ticket.inputs[0].role === 'ORIGINAL' ? 'IMMUTABLE' : 'FINAL',
      width: delivered.outputWidth,
      height: delivered.outputHeight,
      sha256: delivered.projectImageSha256,
    });
    const command: LocalGarmentMeshWarpPrepareCommand = Object.freeze({
      projectId: ticket.scope.projectId,
      sourceArtifactId: parameters.sourceArtifactId,
      garmentId: parameters.garmentId,
      representationId: parameters.representationId,
      anchorSetId: parameters.anchorSetId,
      clientRequestId,
    });
    const evidence: PlatformExecutionEvidence = Object.freeze({ project, binding: bindingFromParameters(parameters) });
    this.createPlatformExecution(ticket.requestId, ticket.scope, command, evidence);
    const plan = await this.#platform.plan(ticket.requestId);
    assertReadyPlan(plan.status, plan.operations);
    const recovered = await this.#platform.prepareLocalExecutionV2(ticket.requestId, {
      managedInputsByStep: Object.freeze({ [GARMENT_MESH_WARP_STEP_ID]: Object.freeze([managed.view, managed.representation]) }),
    });
    if (recovered.length !== 1 || !sameGarmentMeshWarpTicket(recovered[0], ticket)) {
      throw warpError(409, 'local_execution_recovery_mismatch', 'Reconstructed garment mesh-warp execution does not match the durable ticket');
    }
  }
}

function normalizePrepare(command: LocalGarmentMeshWarpPrepareCommand): LocalGarmentMeshWarpPrepareCommand {
  if (!command || typeof command !== 'object') throw warpError(400, 'invalid_garment_mesh_warp_request', 'Garment mesh-warp request is required');
  const projectId = normalizeUuid(command.projectId, 'projectId');
  const garmentId = normalizeUuid(command.garmentId, 'garmentId');
  const representationId = normalizeUuid(command.representationId, 'representationId');
  const anchorSetId = normalizeUuid(command.anchorSetId, 'anchorSetId');
  const sourceArtifactId = normalizeNonEmpty(command.sourceArtifactId, 'sourceArtifactId');
  const clientRequestId = typeof command.clientRequestId === 'string' ? command.clientRequestId.trim() : '';
  if (!CLIENT_REQUEST.test(clientRequestId)) throw warpError(400, 'invalid_garment_mesh_warp_request', 'clientRequestId must contain 1 to 200 safe identifier characters');
  return Object.freeze({ projectId, sourceArtifactId, garmentId, representationId, anchorSetId, clientRequestId });
}

function normalizeLimits(value: LocalGarmentMeshWarpResourceLimits): LocalGarmentMeshWarpResourceLimits {
  if (!Number.isSafeInteger(value?.maxDimension) || value.maxDimension < 1 || value.maxDimension > GARMENT_MESH_WARP_MAX_DIMENSION) throw new Error('Garment mesh-warp Core maxDimension is invalid');
  if (!Number.isSafeInteger(value?.maxPixels) || value.maxPixels < 1 || value.maxPixels > GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS) throw new Error('Garment mesh-warp Core maxPixels is invalid');
  if (!Number.isSafeInteger(value?.maxUploadBytes) || value.maxUploadBytes < 1) throw new Error('Garment mesh-warp Core maxUploadBytes is invalid');
  return Object.freeze({ maxDimension: value.maxDimension, maxPixels: value.maxPixels, maxUploadBytes: value.maxUploadBytes });
}

function assertWithinLimits(width: number, height: number, limits: LocalGarmentMeshWarpResourceLimits): void {
  const pixels = width * height;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || width > limits.maxDimension || height > limits.maxDimension || !Number.isSafeInteger(pixels) || pixels > limits.maxPixels) {
    throw warpError(422, 'garment_mesh_warp_resource_limit_exceeded', 'Garment mesh-warp output exceeds Core resource limits');
  }
}

function assertTicketWithinLimits(ticket: LocalExecutionTicketV2, limits: LocalGarmentMeshWarpResourceLimits): void {
  const output = garmentMeshWarpOutputContract(ticket);
  assertWithinLimits(Number(output.width), Number(output.height), limits);
}

function assertReadyPlan(status: string | undefined, operations: readonly Readonly<{ id: string; type: string }>[]): void {
  if (status !== 'READY' || operations.length !== 1 || operations[0].id !== GARMENT_MESH_WARP_STEP_ID || operations[0].type !== GARMENT_MESH_WARP_OPERATION) {
    throw warpError(422, 'garment_mesh_warp_plan_blocked', `Canonical garment mesh-warp plan is ${status ?? 'invalid'}`);
  }
}

function assertTicketMatchesCommandAndEvidence(ticket: LocalExecutionTicketV2, command: LocalGarmentMeshWarpPrepareCommand, evidence: ResolvedPrepareEvidence): void {
  const parameters = garmentMeshWarpParametersFromTicket(ticket);
  const managed = garmentMeshWarpManagedBindings(ticket);
  const output = garmentMeshWarpOutputContract(ticket);
  if (ticket.inputs[0].artifactId !== command.sourceArtifactId || ticket.inputs[0].sha256 !== evidence.project.sha256 || ticket.inputs[0].role !== evidence.project.role) throw warpError(409, 'local_execution_idempotency_mismatch', 'Garment mesh-warp Project lineage differs from the durable ticket');
  if (parameters.sourceArtifactId !== command.sourceArtifactId || parameters.garmentId !== command.garmentId || parameters.representationId !== command.representationId || parameters.anchorSetId !== command.anchorSetId) throw warpError(409, 'local_execution_idempotency_mismatch', 'Garment mesh-warp command differs from the durable ticket');
  if (canonicalJson(bindingFromParameters(parameters)) !== canonicalJson(evidence.binding) || canonicalJson(managed.view) !== canonicalJson(evidence.view) || canonicalJson(managed.representation) !== canonicalJson(evidence.representation)) throw warpError(409, 'local_execution_idempotency_mismatch', 'Garment mesh-warp server evidence differs from the durable ticket');
  if (output.width !== evidence.project.width || output.height !== evidence.project.height) throw warpError(409, 'local_output_geometry_mismatch', 'Garment mesh-warp ticket output does not match Project geometry');
}

function assertMeshProvenance(
  command: LocalGarmentMeshWarpPrepareCommand,
  project: StoredProjectImageEvidence,
  representation: ResolvedPrepareEvidence['representation'],
  view: ResolvedPrepareEvidence['view'],
  mesh: GarmentDestinationMesh,
): void {
  const p = mesh.provenance;
  if (
    p.projectId !== command.projectId
    || p.projectId !== project.projectId
    || p.projectImageStorageId !== project.storageId
    || p.projectImageSha256 !== project.sha256
    || p.projectImageWidth !== project.width
    || p.projectImageHeight !== project.height
    || p.anchorSetId !== command.anchorSetId
    || p.garmentId !== command.garmentId
    || p.representationId !== command.representationId
    || p.representationContentSha256 !== representation.contentSha256
    || representation.basisViewId !== view.viewId
    || view.garmentId !== command.garmentId
    || representation.garmentId !== command.garmentId
  ) throw warpError(409, 'garment_mesh_warp_geometry_authority_mismatch', 'Server-derived garment mesh provenance does not match current authority');
}

function assertDeliveredInputMatchesTicket(ticket: LocalExecutionTicketV2, delivered: GarmentMeshWarpDeliveredInput): void {
  const parameters = garmentMeshWarpParametersFromTicket(ticket);
  const output = garmentMeshWarpOutputContract(ticket);
  if (
    delivered.ticketId !== ticket.ticketId
    || delivered.projectId !== ticket.scope.projectId
    || delivered.projectImageStorageId !== parameters.projectImageStorageId
    || delivered.projectImageSha256 !== parameters.projectImageSha256
    || delivered.outputWidth !== output.width
    || delivered.outputHeight !== output.height
    || delivered.garmentId !== parameters.garmentId
    || delivered.viewId !== parameters.viewId
    || delivered.representationId !== parameters.representationId
    || delivered.anchorSetId !== parameters.anchorSetId
    || delivered.destinationMeshSha256 !== parameters.destinationMeshSha256
  ) throw warpError(409, 'garment_mesh_warp_delivery_mismatch', 'Purpose-bound garment mesh-warp delivery differs from the durable ticket');
}

function assertResultExecutor(ticket: LocalExecutionTicketV2, result: LocalExecutionResultV2): void {
  const allowed = ticket.allowedExecutors[0];
  if (!allowed || allowed.kind !== 'DETERMINISTIC_TOOL' || result.executor.kind !== 'DETERMINISTIC_TOOL' || result.executor.toolId !== allowed.toolId || result.executor.version !== allowed.version) throw warpError(400, 'local_executor_mismatch', 'Result is not the deterministic garment mesh-warp executor authorized by Core');
  if (result.runtime !== 'BROWSER_JS' || result.accelerator !== 'cpu') throw warpError(400, 'local_runtime_mismatch', 'Garment mesh-warp v1 requires BROWSER_JS/cpu runtime identity');
}

function admittedWorkingArtifact(
  ticket: LocalExecutionTicketV2,
  result: LocalExecutionResultV2,
  delivered: GarmentMeshWarpDeliveredInput,
  parameters: GarmentMeshWarpTicketParameters,
  candidateSha256: string,
  expected: Uint8ClampedArray,
): CreativeArtifact {
  const exact = TOOL.parameters.exact;
  return Object.freeze({
    id: `core-verified-garment-mesh-warp:${ticket.ticketId}`,
    kind: 'image',
    value: Object.freeze({ width: delivered.outputWidth, height: delivered.outputHeight, data: expected, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' }),
    producerOperationId: ticket.stepId,
    scope: ticket.scope,
    state: 'AVAILABLE',
    role: 'WORKING',
    image: Object.freeze({ width: delivered.outputWidth, height: delivered.outputHeight, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb', alpha: true }),
    metadata: Object.freeze({
      artifactRole: 'WORKING',
      localExecutionAdmission: 'ADMITTED',
      admissionClass: 'DETERMINISTIC_BYTE_EXACT',
      verificationScope: 'BYTE_EXACT_CORE_RECOMPUTE',
      persistenceAuthority: 'FASHION_INTERMEDIATE_ONLY',
      ticketId: ticket.ticketId,
      executorKind: 'DETERMINISTIC_TOOL',
      toolId: GARMENT_MESH_WARP_TOOL_ID,
      toolVersion: GARMENT_MESH_WARP_TOOL_VERSION,
      runtime: result.runtime,
      accelerator: result.accelerator,
      candidateSha256,
      verifiedPixelSha256: createHash('sha256').update(expected).digest('hex'),
      projectImageStorageId: delivered.projectImageStorageId,
      projectImageSha256: delivered.projectImageSha256,
      garmentId: parameters.garmentId,
      viewId: parameters.viewId,
      viewSha256: parameters.viewSha256,
      representationId: parameters.representationId,
      representationSha256: parameters.representationSha256,
      anchorSetId: parameters.anchorSetId,
      anchorPayloadSha256: parameters.anchorPayloadSha256,
      destinationMeshSha256: parameters.destinationMeshSha256,
      basisViewWidth: delivered.basisViewWidth,
      basisViewHeight: delivered.basisViewHeight,
      outputWidth: delivered.outputWidth,
      outputHeight: delivered.outputHeight,
      deterministicTool: exact.deterministicTool,
      meshSchema: exact.meshSchema,
      sourceCoordinateSpace: exact.sourceCoordinateSpace,
      destinationCoordinateSpace: exact.destinationCoordinateSpace,
      fixedPointBits: exact.fixedPointBits,
      rasterization: exact.rasterization,
      interpolation: exact.interpolation,
      rounding: exact.rounding,
      alphaPolicy: exact.alphaPolicy,
      uncoveredPixels: exact.uncoveredPixels,
      maxOutputPixels: exact.maxOutputPixels,
      maxRasterWork: exact.maxRasterWork,
      integrityMetrics: Object.freeze({ verificationOutcome: 'PASS', pixelComparison: 'BYTE_EXACT' }),
      parentArtifactIds: Object.freeze([parameters.sourceArtifactId]),
    }),
  });
}

function projectLineageArtifact(scope: AuthenticatedScope & { projectId: string }, artifactId: string, project: StoredProjectImageEvidence): CreativeArtifact {
  return Object.freeze({
    id: artifactId,
    kind: 'image',
    value: Object.freeze({ storageId: project.storageId, sha256: project.sha256, width: project.width, height: project.height }),
    producerOperationId: 'canonical-project-storage',
    scope,
    state: 'AVAILABLE',
    role: project.role,
    image: Object.freeze({ width: project.width, height: project.height, format: 'PNG_RGBA8_LOSSLESS', orientation: 1 as const, colorSpace: 'srgb', alpha: true }),
    metadata: Object.freeze({ storageId: project.storageId, sha256: project.sha256 }),
  });
}

function bindingFromParameters(p: GarmentMeshWarpTicketParameters): WarpBinding {
  return Object.freeze({
    garmentId: p.garmentId,
    viewId: p.viewId,
    representationId: p.representationId,
    anchorSetId: p.anchorSetId,
    projectImageStorageId: p.projectImageStorageId,
    projectImageSha256: p.projectImageSha256,
    viewSha256: p.viewSha256,
    representationSha256: p.representationSha256,
    anchorPayloadSha256: p.anchorPayloadSha256,
    destinationMeshSha256: p.destinationMeshSha256,
  });
}

function clientRequestIdFromTicket(ticket: LocalExecutionTicketV2): string {
  const suffix = `:${GARMENT_MESH_WARP_STEP_ID}:local-v2`;
  if (!ticket.idempotencyKey.endsWith(suffix)) throw warpError(409, 'local_execution_recovery_idempotency', 'Durable garment mesh-warp ticket idempotency key is invalid');
  const value = ticket.idempotencyKey.slice(0, -suffix.length);
  if (!CLIENT_REQUEST.test(value)) throw warpError(409, 'local_execution_recovery_idempotency', 'Durable garment mesh-warp client request identity is invalid');
  return value;
}

async function decodePngRgba(bytes: Uint8Array, expectedWidth: number, expectedHeight: number): Promise<Readonly<{ width: number; height: number; data: Uint8ClampedArray }>> {
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.format !== 'png') throw warpError(415, 'local_image_format_mismatch', 'Garment mesh-warp output must be PNG');
    if (metadata.width !== expectedWidth || metadata.height !== expectedHeight) throw warpError(400, 'local_image_dimensions_mismatch', 'Garment mesh-warp PNG geometry does not match the Core ticket');
    const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== expectedWidth || decoded.info.height !== expectedHeight || decoded.info.channels !== 4 || decoded.data.byteLength !== expectedWidth * expectedHeight * 4) throw warpError(400, 'local_image_decode_failed', 'Garment mesh-warp PNG must decode to exact RGBA8 geometry');
    return Object.freeze({ width: expectedWidth, height: expectedHeight, data: new Uint8ClampedArray(decoded.data) });
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error) throw error;
    throw warpError(400, 'local_image_decode_failed', 'Garment mesh-warp PNG could not be decoded');
  }
}

function assertExactPixels(expected: Uint8ClampedArray, actual: Uint8ClampedArray): void {
  if (expected.byteLength !== actual.byteLength) throw warpError(422, 'local_garment_mesh_warp_pixel_mismatch', 'Garment mesh-warp candidate byte length differs from Core recomputation');
  for (let index = 0; index < expected.byteLength; index += 1) if (expected[index] !== actual[index]) throw warpError(422, 'local_garment_mesh_warp_pixel_mismatch', `Garment mesh-warp candidate differs from Core recomputation at byte ${index}`);
}

function normalizeUuid(value: unknown, field: string): string {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (!UUID.test(normalized) || normalized !== value) throw warpError(400, 'invalid_garment_mesh_warp_request', `${field} must be a canonical lowercase UUID`);
  return normalized;
}
function normalizeNonEmpty(value: unknown, field: string): string {
  if (typeof value !== 'string') throw warpError(400, 'invalid_garment_mesh_warp_request', `${field} is required`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || [...normalized].length > 512 || /[\u0000-\u001f\u007f]/u.test(normalized)) throw warpError(400, 'invalid_garment_mesh_warp_request', `${field} is invalid`);
  return normalized;
}
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)]));
}
function warpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return garmentMeshWarpContractError(code, message, status);
}
