import type {
  LocalExecutionTicketIssueRequestV2,
  LocalExecutionTicketV2,
} from '../../../src/platform/creative/canonical/localExecution.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
  GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
  GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
  GARMENT_TEXTURE_COMPOSITE_OPERATION,
  GARMENT_TEXTURE_COMPOSITE_STEP_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import type { GarmentTextureTransformQ16 } from '../../../src/platform/creative/deterministic/GarmentTextureCompositeParameters.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { GarmentTextureCompositeEvidenceAuthority, ResolvedGarmentTextureCompositeEvidence } from '../fashion/GarmentTextureCompositeEvidenceAuthority.ts';
import { normalizeGarmentTextureFinalLineageParameters } from '../fashion/garmentTextureFinalLineage.ts';
import {
  assertGarmentTextureCompositeTicket,
  garmentTextureCompositeExecutionId,
  garmentTextureCompositeParametersFromTicket,
  garmentTextureCompositeTicketIdempotencyKey,
} from './GarmentTextureCompositeExecutionContract.ts';
import type { GarmentTextureCompositeSubmissionAuthority } from './GarmentTextureCompositeSubmissionAuthority.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';

const CLIENT_REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const SHA = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type LocalGarmentTextureCompositePrepareCommand = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  garmentWarpLayerId: string;
  garmentWarpLayerSha256: string;
  textureTransform: GarmentTextureTransformQ16;
  featherRadius: number;
  clientRequestId: string;
}>;

export type GarmentTextureCompositeProductionPolicyInput = Readonly<{
  scope: AuthenticatedScope & { projectId: string };
  sourceArtifactId: string;
  operation: Readonly<{
    id: typeof GARMENT_TEXTURE_COMPOSITE_STEP_ID;
    version: typeof GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION;
    type: typeof GARMENT_TEXTURE_COMPOSITE_OPERATION;
    capability: typeof GARMENT_TEXTURE_COMPOSITE_CAPABILITY;
    parameters: Readonly<Record<string, unknown>>;
  }>;
}>;

export type GarmentTextureCompositeProductionPolicy = Readonly<{
  authorize(input: GarmentTextureCompositeProductionPolicyInput): void | Promise<void>;
}>;

type TicketIssuer = Readonly<{
  issue(input: LocalExecutionTicketIssueRequestV2): LocalExecutionTicketV2 | Promise<LocalExecutionTicketV2>;
}>;

type EvidenceAuthority = Pick<GarmentTextureCompositeEvidenceAuthority, 'resolve'>;
type SubmissionAuthority = Pick<GarmentTextureCompositeSubmissionAuthority, 'uploadImage' | 'submit'>;

export type LocalGarmentTextureCompositeExecutionServiceDependencies = Readonly<{
  tickets: TicketIssuer;
  admission: Pick<LocalExecutionLedgerV2, 'getByIdempotencyKeyV2'>;
  evidence: EvidenceAuthority;
  submission: SubmissionAuthority;
  policy: GarmentTextureCompositeProductionPolicy;
  now?: () => number;
}>;

type NormalizedPrepare = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  garmentWarpLayerId: string;
  garmentWarpLayerSha256: string;
  textureTransform: GarmentTextureTransformQ16;
  featherRadius: number;
  clientRequestId: string;
}>;

type PreparedBinding = Readonly<{
  evidence: ResolvedGarmentTextureCompositeEvidence;
  producer: ReturnType<typeof normalizeGarmentTextureFinalLineageParameters>;
  parameters: Readonly<Record<string, unknown>>;
}>;

/**
 * Core prepare facade for the F4b.5b deterministic texture-composite path.
 *
 * This service deliberately owns no routing tables and no provider/billing port.
 * Before ticket issuance it resolves the immutable F4b.4 evidence transitively,
 * closes producer parameters in Core, then requires an injected production-policy
 * decision. Only the existing Core v2 ticket authority may mint the zero-cloud
 * ticket. Upload and result handling remain delegated to the independently proven
 * byte-exact submission authority.
 */
export class LocalGarmentTextureCompositeExecutionService {
  readonly #now: () => number;

  constructor(private readonly dependencies: LocalGarmentTextureCompositeExecutionServiceDependencies) {
    this.#now = dependencies.now ?? Date.now;
  }

  async prepare(
    command: LocalGarmentTextureCompositePrepareCommand,
    auth: AuthenticatedScope,
  ): Promise<Readonly<{ executionId: string; ticket: LocalExecutionTicketV2 }>> {
    const normalized = normalizePrepare(command);
    const scope = Object.freeze({ ...auth, projectId: normalized.projectId });
    const executionId = garmentTextureCompositeExecutionId(scope, normalized.clientRequestId);
    const idempotencyKey = garmentTextureCompositeTicketIdempotencyKey(normalized.clientRequestId);
    const binding = await this.resolveBinding(scope, normalized);
    const operation = exactOperation(binding.parameters);
    await this.dependencies.policy.authorize({ scope, sourceArtifactId: normalized.sourceArtifactId, operation });

    const durable = await this.dependencies.admission.getByIdempotencyKeyV2(scope, idempotencyKey);
    if (durable) {
      this.assertDurableTicket(durable, normalized, binding, executionId, idempotencyKey);
      if (this.#now() >= durable.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Garment texture-composite ticket has expired');
      return Object.freeze({ executionId, ticket: durable });
    }

    const ticket = await this.dependencies.tickets.issue({
      ticketVersion: '2',
      requestId: executionId,
      workflowId: executionId,
      stepId: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
      operation,
      scope,
      inputs: Object.freeze([Object.freeze({
        artifactId: normalized.sourceArtifactId,
        kind: 'image',
        role: binding.evidence.project.role,
        sha256: binding.evidence.project.sha256,
      })]),
      managedInputs: Object.freeze([binding.evidence.view.binding, binding.evidence.representation.binding]),
      expectedOutputs: Object.freeze([Object.freeze({
        kind: 'image',
        role: 'COMPOSITE',
        count: 1,
        mimeTypes: Object.freeze(['image/png']),
        width: binding.evidence.project.width,
        height: binding.evidence.project.height,
      })]),
      policy: 'LOCAL_ONLY',
      idempotencyKey,
    });
    assertGarmentTextureCompositeTicket(ticket);
    this.assertDurableTicket(ticket, normalized, binding, executionId, idempotencyKey);
    return Object.freeze({ executionId, ticket });
  }

  uploadImage(input: Readonly<{ ticketId: string; projectId: string; bytes: Uint8Array }>, auth: AuthenticatedScope) {
    return this.dependencies.submission.uploadImage(input, auth);
  }

  submit(input: Readonly<{ ticketId: string; projectId: string; result: unknown }>, auth: AuthenticatedScope) {
    return this.dependencies.submission.submit(input, auth);
  }

  private async resolveBinding(
    scope: AuthenticatedScope & { projectId: string },
    command: NormalizedPrepare,
  ): Promise<PreparedBinding> {
    const evidence = await this.dependencies.evidence.resolve(scope, {
      sourceArtifactId: command.sourceArtifactId,
      layerId: command.garmentWarpLayerId,
      layerSha256: command.garmentWarpLayerSha256,
    });
    const producer = normalizeGarmentTextureFinalLineageParameters({
      schema: 'BERS_GARMENT_TEXTURE_COMPOSITE_Q16_V1',
      textureTransform: command.textureTransform,
      featherRadius: command.featherRadius,
      colorSpacePolicy: 'SRGB_GAMMA_ENCODED_RGBA8',
    });
    const parameters = Object.freeze({
      sourceArtifactId: command.sourceArtifactId,
      projectImageStorageId: evidence.project.storageId,
      projectImageSha256: evidence.project.sha256,
      garmentWarpLayerId: evidence.layer.id,
      garmentWarpLayerSha256: evidence.layer.contentSha256,
      garmentId: evidence.layer.garmentId,
      viewId: evidence.layer.viewId,
      viewSha256: evidence.layer.viewContentSha256,
      representationId: evidence.layer.representationId,
      representationSha256: evidence.layer.representationContentSha256,
      anchorSetId: evidence.layer.anchorSetId,
      anchorPayloadSha256: evidence.layer.anchorPayloadSha256,
      destinationMeshSha256: evidence.mesh.meshSha256,
      producerParameters: producer.document,
      producerParametersSha256: producer.sha256,
      deterministicTool: `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`,
      maxDimension: GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION,
      maxOutputPixels: GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS,
    });
    return Object.freeze({ evidence, producer, parameters });
  }

  private assertDurableTicket(
    ticket: LocalExecutionTicketV2,
    command: NormalizedPrepare,
    binding: PreparedBinding,
    executionId: string,
    idempotencyKey: string,
  ): void {
    assertGarmentTextureCompositeTicket(ticket);
    if (
      ticket.scope.projectId !== command.projectId
      || ticket.requestId !== executionId
      || ticket.workflowId !== executionId
      || ticket.idempotencyKey !== idempotencyKey
      || ticket.inputs.length !== 1
      || ticket.inputs[0].artifactId !== command.sourceArtifactId
      || ticket.inputs[0].sha256 !== binding.evidence.project.sha256
      || ticket.expectedOutputs[0]?.width !== binding.evidence.project.width
      || ticket.expectedOutputs[0]?.height !== binding.evidence.project.height
    ) throw serviceError(409, 'local_execution_idempotency_mismatch', 'clientRequestId is already bound to different garment texture-composite evidence');
    const actual = garmentTextureCompositeParametersFromTicket(ticket);
    if (!sameClosedParameters(actual, binding.parameters)) {
      throw serviceError(409, 'local_execution_idempotency_mismatch', 'Durable garment texture-composite ticket no longer matches the resolved immutable evidence');
    }
  }
}

function exactOperation(parameters: Readonly<Record<string, unknown>>) {
  return Object.freeze({
    id: GARMENT_TEXTURE_COMPOSITE_STEP_ID,
    version: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
    type: GARMENT_TEXTURE_COMPOSITE_OPERATION,
    capability: GARMENT_TEXTURE_COMPOSITE_CAPABILITY,
    parameters,
  });
}

function normalizePrepare(command: LocalGarmentTextureCompositePrepareCommand): NormalizedPrepare {
  if (!command || typeof command !== 'object') throw serviceError(400, 'invalid_garment_texture_composite_request', 'Garment texture-composite prepare request is required');
  const projectId = canonicalUuid(command.projectId, 'projectId');
  const garmentWarpLayerId = canonicalUuid(command.garmentWarpLayerId, 'garmentWarpLayerId');
  if (typeof command.sourceArtifactId !== 'string' || !command.sourceArtifactId.trim() || [...command.sourceArtifactId].length > 512 || /[\u0000-\u001f\u007f]/u.test(command.sourceArtifactId)) {
    throw serviceError(400, 'invalid_garment_texture_composite_request', 'sourceArtifactId is invalid');
  }
  if (!SHA.test(command.garmentWarpLayerSha256)) throw serviceError(400, 'invalid_garment_texture_composite_request', 'garmentWarpLayerSha256 must be canonical lowercase SHA-256');
  if (!CLIENT_REQUEST.test(command.clientRequestId)) throw serviceError(400, 'invalid_garment_texture_composite_request', 'clientRequestId must contain 1 to 200 safe identifier characters');
  let producer: ReturnType<typeof normalizeGarmentTextureFinalLineageParameters>;
  try {
    producer = normalizeGarmentTextureFinalLineageParameters({
      schema: 'BERS_GARMENT_TEXTURE_COMPOSITE_Q16_V1',
      textureTransform: command.textureTransform,
      featherRadius: command.featherRadius,
      colorSpacePolicy: 'SRGB_GAMMA_ENCODED_RGBA8',
    });
  } catch (cause) {
    throw serviceError(400, 'invalid_garment_texture_composite_request', cause instanceof Error ? cause.message : 'Garment texture-composite producer parameters are invalid');
  }
  return Object.freeze({
    projectId,
    sourceArtifactId: command.sourceArtifactId.trim(),
    garmentWarpLayerId,
    garmentWarpLayerSha256: command.garmentWarpLayerSha256,
    textureTransform: producer.document.textureTransform,
    featherRadius: producer.document.featherRadius,
    clientRequestId: command.clientRequestId,
  });
}

function canonicalUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw serviceError(400, 'invalid_garment_texture_composite_request', `${label} must be a canonical lowercase UUID`);
  return value;
}

function sameClosedParameters(actual: Readonly<Record<string, unknown>>, expected: Readonly<Record<string, unknown>>): boolean {
  return canonicalJson(actual) === canonicalJson(expected);
}
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalValue(child)]));
}
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
