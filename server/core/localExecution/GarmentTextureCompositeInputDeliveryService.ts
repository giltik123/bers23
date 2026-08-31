import type { LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { GarmentTextureCompositeEvidenceAuthority } from '../fashion/GarmentTextureCompositeEvidenceAuthority.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import {
  assertGarmentTextureCompositeTicket,
  garmentTextureCompositeContractError,
  garmentTextureCompositeManagedBindings,
  garmentTextureCompositeOutputContract,
  garmentTextureCompositeParametersFromTicket,
} from './GarmentTextureCompositeExecutionContract.ts';
import { normalizeGarmentTextureFinalLineageParameters } from '../fashion/garmentTextureFinalLineage.ts';

export type GarmentTextureCompositeDeliveredInput = Readonly<{
  ticketId: string;
  projectId: string;
  sourceArtifactId: string;
  projectImageStorageId: string;
  projectImageSha256: string;
  garmentWarpLayerId: string;
  garmentWarpLayerSha256: string;
  garmentId: string;
  viewId: string;
  viewSha256: string;
  representationId: string;
  representationSha256: string;
  anchorSetId: string;
  anchorPayloadSha256: string;
  destinationMeshSha256: string;
  outputWidth: number;
  outputHeight: number;
  garmentSourceWidth: number;
  garmentSourceHeight: number;
  sourcePointsQ16: Awaited<ReturnType<GarmentTextureCompositeEvidenceAuthority['resolve']>>['mesh']['sourcePointsQ16'];
  destinationPointsQ16: Awaited<ReturnType<GarmentTextureCompositeEvidenceAuthority['resolve']>>['mesh']['destinationPointsQ16'];
  triangles: Awaited<ReturnType<GarmentTextureCompositeEvidenceAuthority['resolve']>>['mesh']['triangles'];
  producerParameters: ReturnType<typeof normalizeGarmentTextureFinalLineageParameters>['document'];
  producerParametersSha256: string;
  projectRgba: Uint8Array;
  garmentSourceRgba: Uint8Array;
}>;

type TicketReader = Pick<LocalExecutionLedgerV2, 'getV2'>;
type EvidenceAuthority = Pick<GarmentTextureCompositeEvidenceAuthority, 'resolve'>;

export type GarmentTextureCompositeInputDeliveryDependencies = Readonly<{
  admission: TicketReader;
  evidence: EvidenceAuthority;
  now?: () => number;
}>;

/**
 * Purpose-bound browser delivery for garment-texture-composite@1.
 *
 * The durable ticket freezes the expected lineage, but it is never used as a
 * byte source. Every delivery re-enters the transitive Fashion evidence
 * authority, which re-authorizes Project/Garment bytes, re-derives geometry and
 * re-runs the immutable F4b.4 layer before any pixels can leave Core.
 */
export class GarmentTextureCompositeInputDeliveryService {
  readonly #now: () => number;

  constructor(private readonly dependencies: GarmentTextureCompositeInputDeliveryDependencies) {
    this.#now = dependencies.now ?? Date.now;
  }

  async deliver(ticketId: string, projectId: string, auth: AuthenticatedScope): Promise<GarmentTextureCompositeDeliveredInput> {
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw garmentTextureCompositeContractError('local_ticket_not_found', 'Garment texture-composite ticket not found', 404);
    if (ticket.scope.tenantId !== auth.tenantId || ticket.scope.userId !== auth.userId || ticket.scope.projectId !== projectId) {
      throw garmentTextureCompositeContractError('local_ticket_scope_mismatch', 'Garment texture-composite ticket is outside the authenticated Project scope', 403);
    }
    assertGarmentTextureCompositeTicket(ticket);
    if (this.#now() >= ticket.expiresAt) {
      throw garmentTextureCompositeContractError('local_ticket_expired', 'Garment texture-composite ticket has expired', 410);
    }

    const parameters = garmentTextureCompositeParametersFromTicket(ticket);
    const output = garmentTextureCompositeOutputContract(ticket);
    const managed = garmentTextureCompositeManagedBindings(ticket);
    const normalizedParameters = normalizeGarmentTextureFinalLineageParameters(parameters.producerParameters);
    if (normalizedParameters.sha256 !== parameters.producerParametersSha256) {
      throw garmentTextureCompositeContractError('local_ticket_parameter_mismatch', 'Garment texture-composite producer parameters changed identity');
    }

    const evidence = await this.dependencies.evidence.resolve(ticket.scope, {
      sourceArtifactId: parameters.sourceArtifactId,
      layerId: parameters.garmentWarpLayerId,
      layerSha256: parameters.garmentWarpLayerSha256,
    });
    assertEvidenceMatchesTicket(ticket, parameters, managed, output, evidence, normalizedParameters.sha256);

    return Object.freeze({
      ticketId: ticket.ticketId,
      projectId: ticket.scope.projectId,
      sourceArtifactId: parameters.sourceArtifactId,
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
      outputWidth: evidence.project.width,
      outputHeight: evidence.project.height,
      garmentSourceWidth: evidence.view.binding.width,
      garmentSourceHeight: evidence.view.binding.height,
      sourcePointsQ16: evidence.mesh.sourcePointsQ16,
      destinationPointsQ16: evidence.mesh.destinationPointsQ16,
      triangles: evidence.mesh.triangles,
      producerParameters: normalizedParameters.document,
      producerParametersSha256: normalizedParameters.sha256,
      projectRgba: Uint8Array.from(evidence.projectRgba),
      garmentSourceRgba: Uint8Array.from(evidence.garmentSourceRgba),
    });
  }
}

function assertEvidenceMatchesTicket(
  ticket: LocalExecutionTicketV2,
  parameters: ReturnType<typeof garmentTextureCompositeParametersFromTicket>,
  managed: ReturnType<typeof garmentTextureCompositeManagedBindings>,
  output: ReturnType<typeof garmentTextureCompositeOutputContract>,
  evidence: Awaited<ReturnType<EvidenceAuthority['resolve']>>,
  producerParametersSha256: string,
): void {
  const source = ticket.inputs[0];
  const layer = evidence.layer;
  const mesh = evidence.mesh;
  if (
    evidence.project.projectId !== ticket.scope.projectId
    || evidence.project.artifactId !== parameters.sourceArtifactId
    || source.artifactId !== parameters.sourceArtifactId
    || evidence.project.storageId !== parameters.projectImageStorageId
    || evidence.project.sha256 !== parameters.projectImageSha256
    || source.sha256 !== parameters.projectImageSha256
    || evidence.project.width !== Number(output.width)
    || evidence.project.height !== Number(output.height)
    || layer.id !== parameters.garmentWarpLayerId
    || layer.contentSha256 !== parameters.garmentWarpLayerSha256
    || layer.garmentId !== parameters.garmentId
    || layer.viewId !== parameters.viewId
    || layer.viewContentSha256 !== parameters.viewSha256
    || layer.representationId !== parameters.representationId
    || layer.representationContentSha256 !== parameters.representationSha256
    || layer.anchorSetId !== parameters.anchorSetId
    || layer.anchorPayloadSha256 !== parameters.anchorPayloadSha256
    || layer.destinationMeshSha256 !== parameters.destinationMeshSha256
    || mesh.meshSha256 !== parameters.destinationMeshSha256
    || producerParametersSha256 !== parameters.producerParametersSha256
    || canonicalJson(evidence.view.binding) !== canonicalJson(managed.view)
    || canonicalJson(evidence.representation.binding) !== canonicalJson(managed.representation)
  ) {
    throw garmentTextureCompositeContractError(
      'garment_texture_delivery_authority_mismatch',
      'Current Project/Fashion evidence no longer matches the immutable garment texture-composite ticket',
    );
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalValue(child)]));
}
