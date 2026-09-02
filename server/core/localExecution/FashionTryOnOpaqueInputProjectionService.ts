import type { LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/localExecution.ts';
import {
  FASHION_TRYON_EXECUTION_MIME,
  FASHION_TRYON_MESH_PHASE,
  FASHION_TRYON_PREPARED_EXECUTION_VERSION,
  FASHION_TRYON_TEXTURE_PHASE,
  encodeFashionTryOnMeshExecutionEnvelope,
  encodeFashionTryOnTextureExecutionEnvelope,
  normalizeFashionTryOnPreparedExecutionDescriptor,
  type FashionTryOnPreparedExecutionDescriptorV1,
} from '../../../src/platform/creative/canonical/fashionTryOnPreparedExecution.ts';
import {
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import {
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { GarmentMeshWarpInputDeliveryService } from './GarmentMeshWarpInputDeliveryService.ts';
import {
  assertGarmentMeshWarpTicket,
  garmentMeshWarpOutputContract,
} from './GarmentMeshWarpExecutionContract.ts';
import type { GarmentTextureCompositeInputDeliveryService } from './GarmentTextureCompositeInputDeliveryService.ts';
import {
  assertGarmentTextureCompositeTicket,
  garmentTextureCompositeOutputContract,
} from './GarmentTextureCompositeExecutionContract.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type TicketReader = Pick<LocalExecutionLedgerV2, 'getV2'>;
type MeshDelivery = Pick<GarmentMeshWarpInputDeliveryService, 'deliver'>;
type TextureDelivery = Pick<GarmentTextureCompositeInputDeliveryService, 'deliver'>;

export type FashionTryOnOpaqueInputProjectionDependencies = Readonly<{
  admission: TicketReader;
  garmentWarp: MeshDelivery;
  textureComposite: TextureDelivery;
  now?: () => number;
}>;

export type FashionTryOnPreparedLookup = Readonly<{
  ticketId: unknown;
  projectId: unknown;
}>;

/**
 * Product projection over already accepted purpose-bound input authorities.
 *
 * Descriptor methods expose only the random durable ticket handle, deterministic
 * phase/tool binding, output geometry and expiry. The descriptor is explicitly
 * non-authorizing: each call authenticates the Project scope and reloads the
 * immutable v2 ticket.
 *
 * Input methods then re-enter the existing mesh/texture delivery authorities,
 * which independently revalidate current Project/Garment/body-anchor/layer
 * evidence before bytes leave Core. Internal IDs/SHA/provenance are consumed
 * only to build a minimal deterministic envelope and never appear in its wire
 * metadata.
 */
export class FashionTryOnOpaqueInputProjectionService {
  readonly #now: () => number;

  constructor(private readonly dependencies: FashionTryOnOpaqueInputProjectionDependencies) {
    this.#now = dependencies.now ?? Date.now;
  }

  async describeGarmentWarp(
    input: FashionTryOnPreparedLookup,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnPreparedExecutionDescriptorV1> {
    const lookup = normalizeLookup(input);
    const ticket = await this.requireScopedTicket(lookup, auth);
    assertGarmentMeshWarpTicket(ticket);
    return this.meshDescriptor(ticket);
  }

  async loadGarmentWarpInput(input: FashionTryOnPreparedLookup, auth: AuthenticatedScope): Promise<Uint8Array> {
    const lookup = normalizeLookup(input);
    // Delivery rehydrates the durable ticket and current source/managed/anchor
    // evidence itself; no prior descriptor result is trusted here.
    const delivered = await this.dependencies.garmentWarp.deliver(lookup.ticketId, lookup.projectId, auth);
    return encodeFashionTryOnMeshExecutionEnvelope({
      basisViewRgba: delivered.basisViewRgba,
      basisViewWidth: delivered.basisViewWidth,
      basisViewHeight: delivered.basisViewHeight,
      sourcePointsQ16: delivered.sourcePointsQ16,
      destinationPointsQ16: delivered.destinationPointsQ16,
      triangles: delivered.triangles,
      outputWidth: delivered.outputWidth,
      outputHeight: delivered.outputHeight,
    });
  }

  async describeTextureComposite(
    input: FashionTryOnPreparedLookup,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnPreparedExecutionDescriptorV1> {
    const lookup = normalizeLookup(input);
    const ticket = await this.requireScopedTicket(lookup, auth);
    assertGarmentTextureCompositeTicket(ticket);
    return this.textureDescriptor(ticket);
  }

  async loadTextureCompositeInput(input: FashionTryOnPreparedLookup, auth: AuthenticatedScope): Promise<Uint8Array> {
    const lookup = normalizeLookup(input);
    const delivered = await this.dependencies.textureComposite.deliver(lookup.ticketId, lookup.projectId, auth);
    return encodeFashionTryOnTextureExecutionEnvelope({
      projectRgba: delivered.projectRgba,
      garmentSourceRgba: delivered.garmentSourceRgba,
      garmentSourceWidth: delivered.garmentSourceWidth,
      garmentSourceHeight: delivered.garmentSourceHeight,
      sourcePointsQ16: delivered.sourcePointsQ16,
      destinationPointsQ16: delivered.destinationPointsQ16,
      triangles: delivered.triangles,
      outputWidth: delivered.outputWidth,
      outputHeight: delivered.outputHeight,
      producerParameters: delivered.producerParameters,
    });
  }

  private async requireScopedTicket(
    lookup: Readonly<{ ticketId: string; projectId: string }>,
    auth: AuthenticatedScope,
  ): Promise<LocalExecutionTicketV2> {
    const ticket = await this.dependencies.admission.getV2(lookup.ticketId);
    if (!ticket) throw projectionError(404, 'fashion_tryon_opaque_ticket_not_found', 'Fashion Try-On execution handle was not found');
    if (
      ticket.scope.tenantId !== auth.tenantId
      || ticket.scope.userId !== auth.userId
      || ticket.scope.projectId !== lookup.projectId
    ) {
      throw projectionError(403, 'fashion_tryon_opaque_ticket_scope_mismatch', 'Fashion Try-On execution handle is outside the authenticated Project scope');
    }
    if (this.#now() >= ticket.expiresAt) {
      throw projectionError(410, 'fashion_tryon_opaque_ticket_expired', 'Fashion Try-On execution handle has expired');
    }
    return ticket;
  }

  private meshDescriptor(ticket: LocalExecutionTicketV2): FashionTryOnPreparedExecutionDescriptorV1 {
    const output = garmentMeshWarpOutputContract(ticket);
    return normalizeFashionTryOnPreparedExecutionDescriptor(Object.freeze({
      version: FASHION_TRYON_PREPARED_EXECUTION_VERSION,
      ticketId: ticket.ticketId,
      phase: FASHION_TRYON_MESH_PHASE,
      toolId: GARMENT_MESH_WARP_TOOL_ID,
      toolVersion: GARMENT_MESH_WARP_TOOL_VERSION,
      outputWidth: Number(output.width),
      outputHeight: Number(output.height),
      mimeType: FASHION_TRYON_EXECUTION_MIME,
      expiresAt: ticket.expiresAt,
    }));
  }

  private textureDescriptor(ticket: LocalExecutionTicketV2): FashionTryOnPreparedExecutionDescriptorV1 {
    const output = garmentTextureCompositeOutputContract(ticket);
    return normalizeFashionTryOnPreparedExecutionDescriptor(Object.freeze({
      version: FASHION_TRYON_PREPARED_EXECUTION_VERSION,
      ticketId: ticket.ticketId,
      phase: FASHION_TRYON_TEXTURE_PHASE,
      toolId: GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
      toolVersion: GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
      outputWidth: Number(output.width),
      outputHeight: Number(output.height),
      mimeType: FASHION_TRYON_EXECUTION_MIME,
      expiresAt: ticket.expiresAt,
    }));
  }
}

function normalizeLookup(input: FashionTryOnPreparedLookup): Readonly<{ ticketId: string; projectId: string }> {
  if (!input || typeof input !== 'object') throw projectionError(400, 'invalid_fashion_tryon_prepared_lookup', 'Fashion Try-On prepared lookup is required');
  const ticketId = canonicalUuid(input.ticketId, 'ticketId');
  const projectId = canonicalUuid(input.projectId, 'projectId');
  return Object.freeze({ ticketId, projectId });
}

function canonicalUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw projectionError(400, 'invalid_fashion_tryon_prepared_lookup', `${label} must be a canonical lowercase UUID`);
  }
  return value;
}

function projectionError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
