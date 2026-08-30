import sharp from 'sharp';
import type { LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { GarmentDestinationMesh } from '../fashion/bodyAnchorGeometry.ts';
import type { PostgresProjectBodyAnchorStore } from '../fashion/postgresProjectBodyAnchorStore.ts';
import type { ArtifactAuthority, StoredProjectImageEvidence } from '../artifacts/artifactAuthority.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';
import type {
  ManagedGarmentLocalExecutionInputAuthority,
  RevalidatedManagedGarmentInput,
} from './ManagedGarmentLocalExecutionInputAuthority.ts';
import {
  assertGarmentMeshWarpTicket,
  garmentMeshWarpContractError,
  garmentMeshWarpManagedBindings,
  garmentMeshWarpOutputContract,
  garmentMeshWarpParametersFromTicket,
  type GarmentMeshWarpTicketParameters,
} from './GarmentMeshWarpExecutionContract.ts';

export type GarmentMeshWarpDeliveredInput = Readonly<{
  ticketId: string;
  projectId: string;
  projectImageStorageId: string;
  projectImageSha256: string;
  outputWidth: number;
  outputHeight: number;
  garmentId: string;
  viewId: string;
  representationId: string;
  anchorSetId: string;
  basisViewWidth: number;
  basisViewHeight: number;
  basisViewRgba: Uint8Array;
  sourcePointsQ16: GarmentDestinationMesh['sourcePointsQ16'];
  destinationPointsQ16: GarmentDestinationMesh['destinationPointsQ16'];
  triangles: GarmentDestinationMesh['triangles'];
  destinationMeshSha256: string;
}>;

type TicketReader = Pick<LocalExecutionLedgerV2, 'getV2'>;
type ManagedInputAuthority = Pick<ManagedGarmentLocalExecutionInputAuthority, 'revalidateTicket'>;
type BodyAnchorAuthority = Pick<PostgresProjectBodyAnchorStore, 'deriveDestinationMesh'>;
type ProjectArtifactAuthority = Pick<ArtifactAuthority, 'resolveStoredImageEvidence'>;

export type GarmentMeshWarpInputDeliveryDependencies = Readonly<{
  admission: TicketReader;
  managedInputs: ManagedInputAuthority;
  bodyAnchors: BodyAnchorAuthority;
  artifacts: ProjectArtifactAuthority;
  now?: () => number;
}>;

/**
 * Purpose-bound browser input delivery for garment-mesh-warp@1.
 *
 * This is deliberately not a generic Garment download endpoint. A caller must
 * present an exact, unexpired Core v2 ticket in its authenticated Project scope.
 * Before bytes leave Core we revalidate the durable Project image, both managed
 * Garment bindings and the body-anchor-derived destination mesh. Only the
 * Garment basis-view pixels and deterministic mesh are returned; Project pixels
 * are not part of the warp kernel and are never disclosed here.
 */
export class GarmentMeshWarpInputDeliveryService {
  readonly #now: () => number;
  constructor(private readonly dependencies: GarmentMeshWarpInputDeliveryDependencies) {
    this.#now = dependencies.now ?? Date.now;
  }

  async deliver(ticketId: string, projectId: string, auth: AuthenticatedScope): Promise<GarmentMeshWarpDeliveredInput> {
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw garmentMeshWarpContractError('local_ticket_not_found', 'Garment mesh-warp ticket not found', 404);
    assertSameScope(ticket, projectId, auth);
    assertGarmentMeshWarpTicket(ticket);
    if (this.#now() >= ticket.expiresAt) throw garmentMeshWarpContractError('local_ticket_expired', 'Garment mesh-warp ticket has expired', 410);

    const parameters = garmentMeshWarpParametersFromTicket(ticket);
    const output = garmentMeshWarpOutputContract(ticket);
    const projectEvidence = await this.resolveProjectEvidence(ticket, parameters);
    assertProjectEvidence(ticket, parameters, projectEvidence, Number(output.width), Number(output.height));

    const managed = await this.dependencies.managedInputs.revalidateTicket(ticket);
    assertRevalidatedManagedInputs(ticket, managed);
    const mesh = await this.dependencies.bodyAnchors.deriveDestinationMesh(
      { tenantId: ticket.scope.tenantId, userId: ticket.scope.userId },
      ticket.scope.projectId,
      parameters.anchorSetId,
      parameters.garmentId,
      parameters.representationId,
    );
    assertMeshMatchesTicket(parameters, projectEvidence, mesh, Number(output.width), Number(output.height));

    const view = managed[0];
    if (view.binding.kind !== 'GARMENT_VIEW') throw garmentMeshWarpContractError('managed_garment_input_authority_mismatch', 'First revalidated garment mesh-warp input is not the basis view');
    const decoded = await decodeCanonicalView(view.bytes, view.binding.width, view.binding.height);

    // Freeze the authority envelope, but intentionally do not Object.freeze a
    // typed-array view. A fresh copy prevents mutation from aliasing Core-owned
    // storage while remaining valid JavaScript across runtimes.
    return Object.freeze({
      ticketId: ticket.ticketId,
      projectId: ticket.scope.projectId,
      projectImageStorageId: projectEvidence.storageId,
      projectImageSha256: projectEvidence.sha256,
      outputWidth: Number(output.width),
      outputHeight: Number(output.height),
      garmentId: parameters.garmentId,
      viewId: parameters.viewId,
      representationId: parameters.representationId,
      anchorSetId: parameters.anchorSetId,
      basisViewWidth: decoded.width,
      basisViewHeight: decoded.height,
      basisViewRgba: Uint8Array.from(decoded.rgba),
      sourcePointsQ16: mesh.sourcePointsQ16,
      destinationPointsQ16: mesh.destinationPointsQ16,
      triangles: mesh.triangles,
      destinationMeshSha256: mesh.meshSha256,
    });
  }

  private async resolveProjectEvidence(ticket: LocalExecutionTicketV2, parameters: GarmentMeshWarpTicketParameters): Promise<StoredProjectImageEvidence> {
    try {
      return await this.dependencies.artifacts.resolveStoredImageEvidence(ticket.scope, parameters.sourceArtifactId);
    } catch (error) {
      if (error && typeof error === 'object' && 'status' in error) throw error;
      throw garmentMeshWarpContractError('local_input_lineage_unavailable', error instanceof Error ? error.message : 'Canonical Project image evidence is unavailable');
    }
  }
}

function assertSameScope(ticket: LocalExecutionTicketV2, projectId: string, auth: AuthenticatedScope): void {
  if (ticket.scope.tenantId !== auth.tenantId || ticket.scope.userId !== auth.userId || ticket.scope.projectId !== projectId) {
    throw garmentMeshWarpContractError('local_ticket_scope_mismatch', 'Garment mesh-warp ticket is outside the authenticated Project scope', 403);
  }
}

function assertProjectEvidence(
  ticket: LocalExecutionTicketV2,
  p: GarmentMeshWarpTicketParameters,
  evidence: StoredProjectImageEvidence,
  outputWidth: number,
  outputHeight: number,
): void {
  const source = ticket.inputs[0];
  if (
    evidence.projectId !== ticket.scope.projectId
    || evidence.artifactId !== p.sourceArtifactId
    || source.artifactId !== p.sourceArtifactId
    || source.sha256 !== evidence.sha256
    || evidence.storageId !== p.projectImageStorageId
    || evidence.sha256 !== p.projectImageSha256
    || evidence.width !== outputWidth
    || evidence.height !== outputHeight
  ) throw garmentMeshWarpContractError('local_input_authority_mismatch', 'Stored Project image evidence no longer matches the garment mesh-warp ticket');
}

function assertRevalidatedManagedInputs(ticket: LocalExecutionTicketV2, actual: readonly RevalidatedManagedGarmentInput[]): void {
  const expected = garmentMeshWarpManagedBindings(ticket);
  if (actual.length !== 2 || actual[0].binding.kind !== 'GARMENT_VIEW' || actual[1].binding.kind !== 'GARMENT_REPRESENTATION') {
    throw garmentMeshWarpContractError('managed_garment_input_authority_mismatch', 'Revalidated garment mesh-warp managed inputs are incomplete or reordered');
  }
  if (canonicalJson(actual[0].binding) !== canonicalJson(expected.view) || canonicalJson(actual[1].binding) !== canonicalJson(expected.representation)) {
    throw garmentMeshWarpContractError('managed_garment_input_authority_mismatch', 'Revalidated managed Garment evidence differs from the immutable ticket');
  }
}

export function assertMeshMatchesTicket(
  p: GarmentMeshWarpTicketParameters,
  project: StoredProjectImageEvidence,
  mesh: GarmentDestinationMesh,
  outputWidth: number,
  outputHeight: number,
): void {
  const provenance = mesh.provenance;
  if (
    mesh.meshSha256 !== p.destinationMeshSha256
    || provenance.anchorSetId !== p.anchorSetId
    || provenance.projectId !== project.projectId
    || provenance.projectImageStorageId !== p.projectImageStorageId
    || provenance.projectImageStorageId !== project.storageId
    || provenance.projectImageSha256 !== p.projectImageSha256
    || provenance.projectImageSha256 !== project.sha256
    || provenance.projectImageWidth !== outputWidth
    || provenance.projectImageHeight !== outputHeight
    || project.width !== outputWidth
    || project.height !== outputHeight
    || provenance.anchorPayloadSha256 !== p.anchorPayloadSha256
    || provenance.garmentId !== p.garmentId
    || provenance.representationId !== p.representationId
    || provenance.representationContentSha256 !== p.representationSha256
  ) throw garmentMeshWarpContractError('garment_mesh_warp_geometry_authority_mismatch', 'Server-derived garment destination mesh no longer matches the immutable ticket');
}

async function decodeCanonicalView(bytes: Uint8Array, expectedWidth: number, expectedHeight: number): Promise<Readonly<{ width: number; height: number; rgba: Uint8Array }>> {
  try {
    const decoded = await sharp(bytes).ensureAlpha().toColourspace('srgb').raw().toBuffer({ resolveWithObject: true });
    if (decoded.info.width !== expectedWidth || decoded.info.height !== expectedHeight || decoded.info.channels !== 4 || decoded.data.byteLength !== expectedWidth * expectedHeight * 4) {
      throw new Error('Managed Garment basis view decoded outside its canonical geometry');
    }
    return Object.freeze({ width: expectedWidth, height: expectedHeight, rgba: new Uint8Array(decoded.data) });
  } catch (error) {
    throw garmentMeshWarpContractError('managed_garment_input_integrity_mismatch', error instanceof Error ? error.message : 'Managed Garment basis view cannot be decoded');
  }
}

function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)]));
}
