import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type {
  CreativeArtifact,
  LocalExecutionResultV2,
  LocalExecutionTicketV2,
  VerificationResult,
} from '../../../src/platform/creative/canonical/index.ts';
import { garmentTextureCompositeRgba8 } from '../../../src/platform/creative/deterministic/GarmentTextureComposite.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import type { PixelImage } from '../../../src/platform/creative/pipeline/ControlledLocalEdit.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { GarmentTextureCompositeProducerParametersV1 } from '../fashion/garmentTextureFinalLineage.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import type { PostgresLocalExecutionUploadStore } from './PostgresLocalExecutionUploadStore.ts';
import type { GarmentTextureCompositeInputDeliveryService } from './GarmentTextureCompositeInputDeliveryService.ts';
import {
  assertGarmentTextureCompositeTicket,
  garmentTextureCompositeContractError,
  garmentTextureCompositeOutputContract,
  garmentTextureCompositeParametersFromTicket,
} from './GarmentTextureCompositeExecutionContract.ts';

export type GarmentTextureCompositeSubmission = Readonly<{
  executionId: string;
  status: 'SUCCESS' | 'FAILED';
  artifactId?: string;
  verification: VerificationResult;
}>;

export type GarmentTextureCompositeSubmissionDependencies = Readonly<{
  admission: LocalExecutionLedgerV2;
  uploads: PostgresLocalExecutionUploadStore;
  delivery: Pick<GarmentTextureCompositeInputDeliveryService, 'deliver'>;
  maxUploadBytes: number;
  completeCanonicalExecution: (input: Readonly<{
    ticket: LocalExecutionTicketV2;
    result: LocalExecutionResultV2;
    artifact: CreativeArtifact;
  }>) => Promise<VerificationResult>;
  persistFinal: (
    scope: AuthenticatedScope & { projectId: string },
    executionId: string,
    operationId: string,
    image: PixelImage,
    lineage: Readonly<{
      sourceImageStorageId: string;
      producerOperation: 'GARMENT_TEXTURE_COMPOSITE';
      garmentWarpLayerId: string;
      garmentWarpLayerSha256: string;
      producerParameters: GarmentTextureCompositeProducerParametersV1;
    }>,
  ) => Promise<Readonly<{
    storageId: string;
    width: number;
    height: number;
    sourceImageStorageId?: string;
    producerOperation?: string;
    garmentWarpLayerId?: string;
    garmentWarpLayerSha256?: string;
    producerParametersSha256?: string;
  }>>;
  loadPersistedFinal: (
    executionId: string,
    scope: AuthenticatedScope & { projectId: string },
  ) => Promise<Readonly<{
    storageId: string;
    width: number;
    height: number;
    sourceImageStorageId?: string;
    producerOperation?: string;
    garmentWarpLayerId?: string;
    garmentWarpLayerSha256?: string;
    producerParametersSha256?: string;
  }> | undefined>;
  issueFinalId: (storageId: string, scope: AuthenticatedScope & { projectId: string }) => string;
  now?: () => number;
}>;

/**
 * Core-owned F4b.5b result authority.
 *
 * It does not issue tickets or choose execution routes. A pre-existing exact
 * Core LOCAL_ONLY ticket is revalidated through the purpose-bound delivery
 * service, which itself re-enters the transitive Project/Fashion authority.
 * Browser PNG bytes remain quarantine evidence: Core independently re-runs the
 * complete texture -> mesh warp -> feather -> source-over law and persists a
 * canonical Project FINAL only after byte equality and canonical verification.
 */
export class GarmentTextureCompositeSubmissionAuthority {
  readonly #now: () => number;
  readonly #maxUploadBytes: number;

  constructor(private readonly dependencies: GarmentTextureCompositeSubmissionDependencies) {
    this.#now = dependencies.now ?? Date.now;
    if (!Number.isSafeInteger(dependencies.maxUploadBytes) || dependencies.maxUploadBytes < 1) {
      throw new Error('Garment texture-composite maxUploadBytes must be a positive safe integer');
    }
    this.#maxUploadBytes = dependencies.maxUploadBytes;
  }

  async uploadImage(
    input: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>,
    auth: AuthenticatedScope,
  ) {
    const ticket = await this.requireTicket(input.ticketId, input.projectId, auth);
    if (this.#now() >= ticket.expiresAt) throw error(410, 'local_ticket_expired', 'Garment texture-composite ticket has expired');
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1) throw error(400, 'local_image_empty', 'Garment texture-composite image upload is empty');
    if (input.bytes.byteLength > this.#maxUploadBytes) throw error(413, 'local_image_upload_too_large', 'Garment texture-composite image upload exceeds the Core limit');
    const output = garmentTextureCompositeOutputContract(ticket);
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
    return Object.freeze({
      uploadId: upload.uploadId,
      kind: 'image' as const,
      role: 'COMPOSITE' as const,
      sha256: upload.sha256,
      sizeBytes: upload.sizeBytes,
      mimeType: upload.mimeType,
      width: upload.width,
      height: upload.height,
    });
  }

  async submit(
    input: Readonly<{ ticketId: string; projectId: string; result: unknown }>,
    auth: AuthenticatedScope,
  ): Promise<GarmentTextureCompositeSubmission> {
    const ticket = await this.requireTicket(input.ticketId, input.projectId, auth);
    const claim = await this.dependencies.admission.claimV2({
      ticketId: ticket.ticketId,
      result: input.result,
      callerScope: ticket.scope,
      now: this.#now(),
    });
    if (!claim.allowed) {
      if (claim.reasonCode === 'REPLAYED_TICKET') return this.replayFinalized(ticket);
      const status = claim.reasonCode === 'IN_PROGRESS' ? 409 : claim.reasonCode === 'EXPIRED_TICKET' ? 410 : 400;
      throw error(status, `local_result_${claim.reasonCode.toLowerCase()}`, `Garment texture-composite result admission denied: ${claim.reasonCode}`);
    }

    let committed = false;
    try {
      const delivered = await this.dependencies.delivery.deliver(ticket.ticketId, ticket.scope.projectId, {
        tenantId: ticket.scope.tenantId,
        userId: ticket.scope.userId,
      });
      const result = claim.result as LocalExecutionResultV2;
      assertResultExecutor(ticket, result);
      if (result.outputs.length !== 1) throw error(400, 'local_result_output_count', 'Garment texture composite requires exactly one COMPOSITE output');
      const submitted = result.outputs[0];
      const upload = await this.dependencies.uploads.load(submitted.uploadId, ticket.ticketId, ticket.scope, this.#now());
      if (!upload) throw error(400, 'local_upload_unavailable', 'Quarantined garment texture-composite output is unavailable or expired');
      if (
        upload.sha256 !== submitted.sha256
        || upload.sizeBytes !== submitted.sizeBytes
        || upload.kind !== submitted.kind
        || upload.role !== submitted.role
        || upload.mimeType !== submitted.mimeType
        || upload.width !== submitted.width
        || upload.height !== submitted.height
      ) throw error(400, 'local_upload_evidence_mismatch', 'Submitted garment texture-composite evidence does not match quarantined bytes');
      if (upload.kind !== 'image' || upload.role !== 'COMPOSITE' || upload.mimeType !== 'image/png') {
        throw error(400, 'local_upload_contract_mismatch', 'Quarantined garment texture-composite output is not a PNG COMPOSITE candidate');
      }

      const candidate = await decodePngRgba(upload.bytes, delivered.outputWidth, delivered.outputHeight);
      const p = delivered.producerParameters;
      const expected = garmentTextureCompositeRgba8(
        delivered.projectRgba,
        delivered.outputWidth,
        delivered.outputHeight,
        delivered.garmentSourceRgba,
        delivered.garmentSourceWidth,
        delivered.garmentSourceHeight,
        {
          sourcePointsQ16: delivered.sourcePointsQ16,
          destinationPointsQ16: delivered.destinationPointsQ16,
          triangles: delivered.triangles,
          outputWidth: delivered.outputWidth,
          outputHeight: delivered.outputHeight,
        },
        {
          textureTransform: p.textureTransform,
          featherRadius: p.featherRadius,
          colorSpacePolicy: p.colorSpacePolicy,
        },
      );
      assertExactPixels(expected, candidate.data);

      const artifact = admittedArtifact(ticket, result, delivered, upload.sha256, expected);
      const verification = await this.dependencies.completeCanonicalExecution({ ticket, result, artifact });
      if (!verification.valid) throw error(422, 'local_execution_verification_failed', 'Canonical garment texture-composite execution did not pass workflow verification');

      const stored = await this.dependencies.persistFinal(
        ticket.scope,
        ticket.requestId,
        ticket.stepId,
        { width: delivered.outputWidth, height: delivered.outputHeight, data: expected },
        {
          sourceImageStorageId: delivered.projectImageStorageId,
          producerOperation: 'GARMENT_TEXTURE_COMPOSITE',
          garmentWarpLayerId: delivered.garmentWarpLayerId,
          garmentWarpLayerSha256: delivered.garmentWarpLayerSha256,
          producerParameters: delivered.producerParameters,
        },
      );
      assertStoredFinalMatchesTicket(stored, ticket);
      const artifactId = this.dependencies.issueFinalId(stored.storageId, ticket.scope);
      await this.dependencies.admission.commit(ticket.ticketId, 'SUCCESS');
      committed = true;
      await this.dependencies.uploads.consume(upload.uploadId, ticket.ticketId, ticket.scope, this.#now());
      return Object.freeze({ executionId: ticket.requestId, status: 'SUCCESS', artifactId, verification });
    } catch (cause) {
      if (!committed) await this.dependencies.admission.release(ticket.ticketId).catch(() => undefined);
      throw cause;
    }
  }

  private async requireTicket(ticketId: string, projectId: string, auth: AuthenticatedScope): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw error(404, 'local_ticket_not_found', 'Garment texture-composite ticket not found');
    if (ticket.scope.tenantId !== auth.tenantId || ticket.scope.userId !== auth.userId || ticket.scope.projectId !== projectId) {
      throw error(403, 'local_ticket_scope_mismatch', 'Garment texture-composite ticket is outside the authenticated Project scope');
    }
    assertGarmentTextureCompositeTicket(ticket);
    return ticket;
  }

  private async replayFinalized(ticket: LocalExecutionTicketV2): Promise<GarmentTextureCompositeSubmission> {
    const finalization = await this.dependencies.admission.getFinalization(ticket.ticketId);
    if (!finalization || finalization.status === 'UNKNOWN') throw error(409, 'local_finalization_unknown', 'Garment texture-composite execution has no recoverable terminal status');
    if (finalization.status === 'FAILED') {
      return Object.freeze({
        executionId: ticket.requestId,
        status: 'FAILED',
        verification: Object.freeze({ valid: false, checks: Object.freeze([]), errors: Object.freeze(['DURABLE_GARMENT_TEXTURE_COMPOSITE_FAILED']) }),
      });
    }
    const stored = await this.dependencies.loadPersistedFinal(ticket.requestId, ticket.scope);
    if (!stored) throw error(409, 'local_finalization_artifact_unavailable', 'Committed garment texture-composite FINAL is unavailable');
    assertStoredFinalMatchesTicket(stored, ticket);
    const artifactId = this.dependencies.issueFinalId(stored.storageId, ticket.scope);
    return Object.freeze({
      executionId: ticket.requestId,
      status: 'SUCCESS',
      artifactId,
      verification: Object.freeze({ valid: true, checks: Object.freeze(['DURABLE_GARMENT_TEXTURE_FINAL_REPLAY']), errors: Object.freeze([]) }),
    });
  }
}

function admittedArtifact(
  ticket: LocalExecutionTicketV2,
  result: LocalExecutionResultV2,
  delivered: Awaited<ReturnType<GarmentTextureCompositeInputDeliveryService['deliver']>>,
  candidateSha256: string,
  expected: Uint8ClampedArray,
): CreativeArtifact {
  return Object.freeze({
    id: `core-verified-garment-texture:${ticket.ticketId}`,
    kind: 'image',
    value: Object.freeze({ width: delivered.outputWidth, height: delivered.outputHeight, data: expected, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb' }),
    producerOperationId: ticket.stepId,
    scope: ticket.scope,
    state: 'FINAL',
    role: 'COMPOSITE',
    image: Object.freeze({ width: delivered.outputWidth, height: delivered.outputHeight, format: 'RGBA8', orientation: 1 as const, colorSpace: 'srgb', alpha: true }),
    metadata: Object.freeze({
      artifactRole: 'COMPOSITE',
      localExecutionAdmission: 'ADMITTED',
      admissionClass: 'DETERMINISTIC_BYTE_EXACT',
      verificationScope: 'BYTE_EXACT_CORE_RECOMPUTE',
      ticketId: ticket.ticketId,
      executorKind: result.executor.kind,
      toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
      toolVersion: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
      runtime: result.runtime,
      accelerator: result.accelerator,
      candidateSha256,
      verifiedPixelSha256: createHash('sha256').update(expected).digest('hex'),
      sourceImageStorageId: delivered.projectImageStorageId,
      sourceImageSha256: delivered.projectImageSha256,
      garmentWarpLayerId: delivered.garmentWarpLayerId,
      garmentWarpLayerSha256: delivered.garmentWarpLayerSha256,
      producerParametersSha256: delivered.producerParametersSha256,
      destinationMeshSha256: delivered.destinationMeshSha256,
      integrityMetrics: Object.freeze({ verificationOutcome: 'PASS', pixelComparison: 'BYTE_EXACT' }),
      parentArtifactIds: Object.freeze([delivered.sourceArtifactId]),
    }),
  });
}

function assertResultExecutor(ticket: LocalExecutionTicketV2, result: LocalExecutionResultV2): void {
  if (
    result.ticketId !== ticket.ticketId
    || result.ticketVersion !== ticket.version
    || result.requestId !== ticket.requestId
    || result.workflowId !== ticket.workflowId
    || result.stepId !== ticket.stepId
    || result.nonce !== ticket.nonce
    || result.executor.kind !== 'DETERMINISTIC_TOOL'
    || result.executor.toolId !== GARMENT_TEXTURE_COMPOSITE_TOOL_ID
    || result.executor.version !== GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION
    || result.runtime !== 'BROWSER_JS'
    || result.accelerator !== 'cpu'
  ) throw error(400, 'local_executor_mismatch', 'Result is not the authorized deterministic garment texture-composite executor');
}

function assertStoredFinalMatchesTicket(
  stored: Awaited<ReturnType<GarmentTextureCompositeSubmissionDependencies['loadPersistedFinal']>> & {},
  ticket: LocalExecutionTicketV2,
): void {
  const output = garmentTextureCompositeOutputContract(ticket);
  const p = garmentTextureCompositeParametersFromTicket(ticket);
  if (
    stored.width !== Number(output.width)
    || stored.height !== Number(output.height)
    || stored.sourceImageStorageId !== p.projectImageStorageId
    || stored.producerOperation !== 'GARMENT_TEXTURE_COMPOSITE'
    || stored.garmentWarpLayerId !== p.garmentWarpLayerId
    || stored.garmentWarpLayerSha256 !== p.garmentWarpLayerSha256
    || stored.producerParametersSha256 !== p.producerParametersSha256
  ) throw error(409, 'local_finalization_artifact_mismatch', 'Committed garment texture-composite FINAL differs from the durable ticket lineage');
}

async function decodePngRgba(bytes: Uint8Array, width: number, height: number): Promise<Readonly<{ width: number; height: number; data: Uint8ClampedArray }>> {
  try {
    const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== width || decoded.info.height !== height || decoded.info.channels !== 4 || decoded.data.byteLength !== width * height * 4) {
      throw new Error('Decoded PNG geometry differs from the garment texture-composite ticket');
    }
    return Object.freeze({ width, height, data: new Uint8ClampedArray(decoded.data) });
  } catch (cause) {
    throw error(400, 'local_image_decode_failed', cause instanceof Error ? cause.message : 'Garment texture-composite PNG cannot be decoded');
  }
}

function assertExactPixels(expected: Uint8Array | Uint8ClampedArray, actual: Uint8Array | Uint8ClampedArray): void {
  if (expected.byteLength !== actual.byteLength) throw error(422, 'local_pixel_verification_failed', 'Garment texture-composite candidate length differs from Core recomputation');
  for (let index = 0; index < expected.byteLength; index += 1) {
    if (expected[index] !== actual[index]) throw error(422, 'local_pixel_verification_failed', `Garment texture-composite candidate differs from Core recomputation at byte ${index}`);
  }
}

function error(status: number, code: string, message: string): Error & { status: number; code: string } {
  return garmentTextureCompositeContractError(code, message, status);
}
