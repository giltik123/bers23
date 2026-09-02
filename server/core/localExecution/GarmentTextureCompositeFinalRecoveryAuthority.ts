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
const SHA = /^[0-9a-f]{64}$/;
const CLIENT_REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const MAX_SOURCE_ARTIFACT_ID_LENGTH = 512;
const RESOLVED_EVIDENCE_KEYS = Object.freeze([
  'anchorPayloadSha256',
  'anchorSetId',
  'destinationMeshSha256',
  'projectImageHeight',
  'projectImageSha256',
  'projectImageStorageId',
  'projectImageWidth',
  'representationContentSha256',
  'representationId',
] as const);

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

export type GarmentTextureCompositeFinalRecoveryIntent = Readonly<{
  projectId: unknown;
  clientRequestId: unknown;
  sourceArtifactId: unknown;
  garmentId: unknown;
}>;

export type GarmentTextureCompositeResolvedEvidenceBinding = Readonly<{
  projectImageStorageId: string;
  projectImageSha256: string;
  projectImageWidth: number;
  projectImageHeight: number;
  representationId: string;
  representationContentSha256: string;
  anchorSetId: string;
  anchorPayloadSha256: string;
  destinationMeshSha256: string;
}>;

export type GarmentTextureCompositeResolvedEvidenceRecoveryIntent = GarmentTextureCompositeFinalRecoveryIntent & Readonly<{
  evidence: GarmentTextureCompositeResolvedEvidenceBinding;
}>;

/**
 * Read-only durable recovery for an already-admitted F4b.5b texture FINAL.
 *
 * This authority never accepts ticket, execution, storage or FINAL identifiers
 * from a browser caller. Low-level `recover` reconstructs those identities from
 * authenticated Project scope and the exact server-derived texture phase ID.
 *
 * Product orchestration may use `recoverForIntent` for stable source + garment
 * binding, or the stronger `recoverForResolvedEvidence` after server-owned
 * readiness resolution. The latter additionally proves that the durable ticket
 * was prepared from the currently selected Project image, PARAMETRIC
 * representation, body-anchor payload and derived destination mesh before any
 * finalization or FINAL lookup. The evidence object is an internal server
 * binding; browser evidence IDs remain forbidden by the product intent schema.
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
    return this.recoverNormalized(projectId, clientRequestId, auth);
  }

  async recoverForIntent(
    input: GarmentTextureCompositeFinalRecoveryIntent,
    auth: AuthenticatedScope,
  ): Promise<GarmentTextureCompositeFinalRecoveryResult> {
    const projectId = normalizeProjectId(input?.projectId);
    const clientRequestId = normalizeClientRequestId(input?.clientRequestId);
    const sourceArtifactId = normalizeSourceArtifactId(input?.sourceArtifactId);
    const garmentId = normalizeGarmentId(input?.garmentId);
    return this.recoverNormalized(projectId, clientRequestId, auth, Object.freeze({ sourceArtifactId, garmentId }));
  }

  async recoverForResolvedEvidence(
    input: GarmentTextureCompositeResolvedEvidenceRecoveryIntent,
    auth: AuthenticatedScope,
  ): Promise<GarmentTextureCompositeFinalRecoveryResult> {
    const projectId = normalizeProjectId(input?.projectId);
    const clientRequestId = normalizeClientRequestId(input?.clientRequestId);
    const sourceArtifactId = normalizeSourceArtifactId(input?.sourceArtifactId);
    const garmentId = normalizeGarmentId(input?.garmentId);
    const evidence = normalizeResolvedEvidence(input?.evidence);
    return this.recoverNormalized(
      projectId,
      clientRequestId,
      auth,
      Object.freeze({ sourceArtifactId, garmentId }),
      evidence,
    );
  }

  private async recoverNormalized(
    projectId: string,
    clientRequestId: string,
    auth: AuthenticatedScope,
    expectedIntent?: Readonly<{ sourceArtifactId: string; garmentId: string }>,
    expectedEvidence?: GarmentTextureCompositeResolvedEvidenceBinding,
  ): Promise<GarmentTextureCompositeFinalRecoveryResult> {
    const scope = Object.freeze({ ...auth, projectId });
    const idempotencyKey = garmentTextureCompositeTicketIdempotencyKey(clientRequestId);
    const expectedExecutionId = garmentTextureCompositeExecutionId(scope, clientRequestId);
    const ticket = await this.dependencies.admission.getByIdempotencyKeyV2(scope, idempotencyKey);
    if (!ticket) return Object.freeze({ status: 'NOT_PREPARED' });

    assertGarmentTextureCompositeTicket(ticket);
    assertTicketIdentity(ticket, scope, idempotencyKey, expectedExecutionId);
    if (expectedIntent) assertTicketStableIntent(ticket, expectedIntent);
    if (expectedEvidence) assertTicketResolvedEvidence(ticket, expectedEvidence);

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

function assertTicketStableIntent(
  ticket: Awaited<ReturnType<RecoveryLedger['getByIdempotencyKeyV2']>> & {},
  expected: Readonly<{ sourceArtifactId: string; garmentId: string }>,
): void {
  const parameters = garmentTextureCompositeParametersFromTicket(ticket);
  const managed = ticket.managedInputs;
  const projectInput = ticket.inputs[0];
  const view = managed?.[0];
  const representation = managed?.[1];
  const same = parameters.sourceArtifactId === expected.sourceArtifactId
    && parameters.garmentId === expected.garmentId
    && ticket.inputs.length === 1
    && projectInput?.artifactId === expected.sourceArtifactId
    && managed?.length === 2
    && view?.kind === 'GARMENT_VIEW'
    && view.garmentId === expected.garmentId
    && representation?.kind === 'GARMENT_REPRESENTATION'
    && representation.garmentId === expected.garmentId;
  if (!same) {
    throw recoveryError(
      409,
      'garment_texture_final_recovery_intent_mismatch',
      'Durable texture-composite ticket does not match the requested stable Try-On intent',
    );
  }
}

function assertTicketResolvedEvidence(
  ticket: Awaited<ReturnType<RecoveryLedger['getByIdempotencyKeyV2']>> & {},
  expected: GarmentTextureCompositeResolvedEvidenceBinding,
): void {
  const parameters = garmentTextureCompositeParametersFromTicket(ticket);
  const output = garmentTextureCompositeOutputContract(ticket);
  const projectInput = ticket.inputs[0];
  const representation = ticket.managedInputs?.[1];
  const same = parameters.projectImageStorageId === expected.projectImageStorageId
    && parameters.projectImageSha256 === expected.projectImageSha256
    && projectInput?.sha256 === expected.projectImageSha256
    && Number(output.width) === expected.projectImageWidth
    && Number(output.height) === expected.projectImageHeight
    && parameters.representationId === expected.representationId
    && parameters.representationSha256 === expected.representationContentSha256
    && representation?.kind === 'GARMENT_REPRESENTATION'
    && representation.representationId === expected.representationId
    && representation.contentSha256 === expected.representationContentSha256
    && parameters.anchorSetId === expected.anchorSetId
    && parameters.anchorPayloadSha256 === expected.anchorPayloadSha256
    && parameters.destinationMeshSha256 === expected.destinationMeshSha256;
  if (!same) {
    throw recoveryError(
      409,
      'garment_texture_final_recovery_evidence_mismatch',
      'Durable texture-composite ticket does not match current server-resolved Try-On evidence',
    );
  }
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

function normalizeResolvedEvidence(value: unknown): GarmentTextureCompositeResolvedEvidenceBinding {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw recoveryError(400, 'invalid_garment_texture_final_recovery_request', 'resolved evidence binding must be an object');
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (keys.length !== RESOLVED_EVIDENCE_KEYS.length || keys.some((key, index) => key !== RESOLVED_EVIDENCE_KEYS[index])) {
    throw recoveryError(400, 'invalid_garment_texture_final_recovery_request', 'resolved evidence binding has unknown or missing fields');
  }
  return Object.freeze({
    projectImageStorageId: normalizeEvidenceUuid(record.projectImageStorageId, 'projectImageStorageId'),
    projectImageSha256: normalizeEvidenceSha(record.projectImageSha256, 'projectImageSha256'),
    projectImageWidth: normalizeDimension(record.projectImageWidth, 'projectImageWidth'),
    projectImageHeight: normalizeDimension(record.projectImageHeight, 'projectImageHeight'),
    representationId: normalizeEvidenceUuid(record.representationId, 'representationId'),
    representationContentSha256: normalizeEvidenceSha(record.representationContentSha256, 'representationContentSha256'),
    anchorSetId: normalizeEvidenceUuid(record.anchorSetId, 'anchorSetId'),
    anchorPayloadSha256: normalizeEvidenceSha(record.anchorPayloadSha256, 'anchorPayloadSha256'),
    destinationMeshSha256: normalizeEvidenceSha(record.destinationMeshSha256, 'destinationMeshSha256'),
  });
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

function normalizeSourceArtifactId(value: unknown): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || normalized.length > MAX_SOURCE_ARTIFACT_ID_LENGTH || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    throw recoveryError(400, 'invalid_garment_texture_final_recovery_request', 'sourceArtifactId is outside the accepted stable intent contract');
  }
  return normalized;
}

function normalizeGarmentId(value: unknown): string {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (!UUID.test(normalized)) throw recoveryError(400, 'invalid_garment_texture_final_recovery_request', 'garmentId must be a canonical UUID');
  return normalized;
}

function normalizeEvidenceUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw recoveryError(400, 'invalid_garment_texture_final_recovery_request', `${label} must be a canonical lowercase UUID`);
  }
  return value;
}

function normalizeEvidenceSha(value: unknown, label: string): string {
  if (typeof value !== 'string' || !SHA.test(value)) {
    throw recoveryError(400, 'invalid_garment_texture_final_recovery_request', `${label} must be canonical lowercase SHA-256`);
  }
  return value;
}

function normalizeDimension(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw recoveryError(400, 'invalid_garment_texture_final_recovery_request', `${label} must be a positive safe integer`);
  }
  return Number(value);
}

function recoveryError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
