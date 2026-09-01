import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { PostgresImageArtifactStore, StoredFinalImage } from '../artifacts/postgresImageArtifactStore.ts';
import { normalizeGarmentTextureFinalLineageParameters } from '../fashion/garmentTextureFinalLineage.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import {
  assertGarmentTextureCompositeTicket,
  garmentTextureCompositeExecutionId,
  garmentTextureCompositeOutputContract,
  garmentTextureCompositeParametersFromTicket,
  garmentTextureCompositeTicketIdempotencyKey,
} from './GarmentTextureCompositeExecutionContract.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const CLIENT_REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

type RecoveryLedger = Pick<LocalExecutionLedgerV2, 'getByIdempotencyKeyV2' | 'getFinalization'>;
type FinalReader = Pick<PostgresImageArtifactStore, 'loadFinalByExecution'>;

export type GarmentTextureCompositeFinalRecoveryDependencies = Readonly<{
  admission: RecoveryLedger;
  images: FinalReader;
  issueFinalId: (storageId: string, scope: AuthenticatedScope & { projectId: string }) => string;
}>;

export type GarmentTextureCompositeFinalRecoveryResult =
  | Readonly<{ status: 'NOT_PREPARED' }>
  | Readonly<{ status: 'PENDING'; executionId: string }>
  | Readonly<{ status: 'FAILED'; executionId: string }>
  | Readonly<{ status: 'SUCCESS'; executionId: string; artifactId: string }>;

/**
 * Read-only durable recovery for an already-admitted F4b.5b texture FINAL.
 *
 * This authority does not accept a ticket, execution or FINAL identifier from
 * the caller. It reconstructs those identities from the authenticated Project
 * scope and the exact server-derived texture phase request ID, then validates
 * the existing durable ticket/finalization and canonical FINAL lineage before
 * issuing a signed artifact identifier.
 *
 * Pixel equality is intentionally not recomputed here: the only path that can
 * commit SUCCESS already requires byte-exact Core recomputation and canonical
 * verification before FINAL persistence. Recovery verifies durable evidence;
 * it is not a second result-admission path.
 */
export class GarmentTextureCompositeFinalRecoveryAuthority {
  constructor(private readonly dependencies: GarmentTextureCompositeFinalRecoveryDependencies) {}

  async recover(
    input: Readonly<{ projectId: unknown; clientRequestId: unknown }>,
    auth: AuthenticatedScope,
  ): Promise<GarmentTextureCompositeFinalRecoveryResult> {
    const projectId = normalizeProjectId(input?.projectId);
    const clientRequestId = normalizeClientRequestId(input?.clientRequestId);
    const scope = Object.freeze({ ...auth, projectId });
    const idempotencyKey = garmentTextureCompositeTicketIdempotencyKey(clientRequestId);
    const expectedExecutionId = garmentTextureCompositeExecutionId(scope, clientRequestId);
    const ticket = await this.dependencies.admission.getByIdempotencyKeyV2(scope, idempotencyKey);
    if (!ticket) return Object.freeze({ status: 'NOT_PREPARED' });

    assertGarmentTextureCompositeTicket(ticket);
    assertTicketIdentity(ticket, scope, idempotencyKey, expectedExecutionId);
    const finalization = await this.dependencies.admission.getFinalization(ticket.ticketId);
    if (!finalization || finalization.status === 'UNKNOWN') {
      return Object.freeze({ status: 'PENDING', executionId: expectedExecutionId });
    }
    if (finalization.status === 'FAILED') {
      return Object.freeze({ status: 'FAILED', executionId: expectedExecutionId });
    }

    const stored = await this.dependencies.images.loadFinalByExecution(expectedExecutionId, scope);
    if (!stored) {
      throw recoveryError(409, 'garment_texture_final_recovery_artifact_unavailable', 'Committed garment texture-composite FINAL is unavailable');
    }
    assertStoredFinalMatchesTicket(stored, ticket);
    const artifactId = this.dependencies.issueFinalId(stored.storageId, scope);
    return Object.freeze({ status: 'SUCCESS', executionId: expectedExecutionId, artifactId });
  }
}

function assertTicketIdentity(
  ticket: Awaited<ReturnType<RecoveryLedger['getByIdempotencyKeyV2']>> & {},
  scope: AuthenticatedScope & { projectId: string },
  idempotencyKey: string,
  expectedExecutionId: string,
): void {
  if (
    ticket.scope.tenantId !== scope.tenantId
    || ticket.scope.userId !== scope.userId
    || ticket.scope.projectId !== scope.projectId
  ) throw recoveryError(403, 'garment_texture_final_recovery_scope_mismatch', 'Durable texture-composite ticket is outside the authenticated Project scope');
  if (
    ticket.requestId !== expectedExecutionId
    || ticket.workflowId !== expectedExecutionId
    || ticket.idempotencyKey !== idempotencyKey
  ) throw recoveryError(409, 'garment_texture_final_recovery_identity_mismatch', 'Durable texture-composite ticket identity does not match the requested phase');
}

function assertStoredFinalMatchesTicket(
  stored: StoredFinalImage,
  ticket: Awaited<ReturnType<RecoveryLedger['getByIdempotencyKeyV2']>> & {},
): void {
  const parameters = garmentTextureCompositeParametersFromTicket(ticket);
  const output = garmentTextureCompositeOutputContract(ticket);
  const producer = stored.producerParameters === undefined
    ? undefined
    : normalizeGarmentTextureFinalLineageParameters(stored.producerParameters);
  const same = stored.tenantId === ticket.scope.tenantId
    && stored.userId === ticket.scope.userId
    && stored.projectId === ticket.scope.projectId
    && stored.executionId === ticket.requestId
    && stored.operationId === ticket.stepId
    && stored.width === output.width
    && stored.height === output.height
    && stored.producerOperation === 'GARMENT_TEXTURE_COMPOSITE'
    && stored.sourceImageStorageId === parameters.projectImageStorageId
    && stored.garmentWarpLayerId === parameters.garmentWarpLayerId
    && stored.garmentWarpLayerSha256 === parameters.garmentWarpLayerSha256
    && stored.producerParametersSha256 === parameters.producerParametersSha256
    && producer?.sha256 === parameters.producerParametersSha256
    && producer?.canonicalJson === normalizeGarmentTextureFinalLineageParameters(parameters.producerParameters).canonicalJson;
  if (!same) {
    throw recoveryError(409, 'garment_texture_final_recovery_lineage_mismatch', 'Committed garment texture-composite FINAL does not match its durable ticket lineage');
  }
}

function normalizeProjectId(value: unknown): string {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (!UUID.test(normalized)) throw recoveryError(400, 'invalid_garment_texture_final_recovery_request', 'projectId must be a canonical UUID');
  return normalized;
}

function normalizeClientRequestId(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!CLIENT_REQUEST.test(normalized)) {
    throw recoveryError(400, 'invalid_garment_texture_final_recovery_request', 'clientRequestId must contain 1 to 200 safe identifier characters');
  }
  return normalized;
}

function recoveryError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
