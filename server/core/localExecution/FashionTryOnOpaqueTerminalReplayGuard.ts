import type { LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { PostgresImageArtifactStore } from '../artifacts/postgresImageArtifactStore.ts';
import type { PostgresGarmentWarpLayerStore } from '../fashion/postgresGarmentWarpLayerStore.ts';
import {
  assertGarmentMeshWarpTicket,
  garmentMeshWarpOutputContract,
  garmentMeshWarpParametersFromTicket,
} from './GarmentMeshWarpExecutionContract.ts';
import {
  assertGarmentTextureCompositeTicket,
  garmentTextureCompositeOutputContract,
  garmentTextureCompositeParametersFromTicket,
} from './GarmentTextureCompositeExecutionContract.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

type TerminalReader = Pick<LocalExecutionLedgerV2, 'getV2' | 'getFinalization'>;
type WarpLayerReader = Pick<PostgresGarmentWarpLayerStore, 'loadByExecution'>;
type FinalReader = Pick<PostgresImageArtifactStore, 'loadFinalByExecution'>;

export type FashionTryOnOpaqueTerminalReplayDependencies = Readonly<{
  admission: TerminalReader;
  layers: WarpLayerReader;
  finals: FinalReader;
}>;

export type FashionTryOnOpaqueTerminalReplayLookup = Readonly<{
  ticketId: unknown;
  projectId: unknown;
}>;

export type FashionTryOnOpaqueTerminalReplayResult = Readonly<{
  status: 'SUCCESS' | 'FAILED';
}>;

/**
 * Read-only terminal replay guard for the opaque F4b.6b.4b candidate bridge.
 *
 * Durable ledger finalization is necessary but deliberately not sufficient for
 * SUCCESS. The guard reloads the purpose-bound ticket and proves that the
 * concrete committed mesh layer / texture FINAL still exists under the same
 * authenticated Project scope and still matches the ticket's immutable lineage.
 * It never returns layer, artifact, storage, SHA or ticket authority to product
 * code and never claims, commits, releases, uploads or persists anything.
 */
export class FashionTryOnOpaqueTerminalReplayGuard {
  constructor(private readonly dependencies: FashionTryOnOpaqueTerminalReplayDependencies) {}

  async tryRecoverGarmentWarp(
    input: FashionTryOnOpaqueTerminalReplayLookup,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnOpaqueTerminalReplayResult | undefined> {
    const ticket = await this.requireScopedTicket(input, auth);
    assertGarmentMeshWarpTicket(ticket);
    const status = await this.terminalStatus(ticket.ticketId);
    if (status === undefined) return undefined;
    if (status === 'FAILED') return failed();

    const stored = await this.dependencies.layers.loadByExecution(
      { tenantId: ticket.scope.tenantId, userId: ticket.scope.userId },
      ticket.scope.projectId,
      ticket.requestId,
    );
    if (!stored) {
      throw replayError(409, 'fashion_tryon_opaque_terminal_artifact_unavailable', 'Committed Fashion garment warp layer is unavailable');
    }

    const output = garmentMeshWarpOutputContract(ticket);
    const parameters = garmentMeshWarpParametersFromTicket(ticket);
    const matches = (
      stored.projectId === ticket.scope.projectId
      && stored.executionId === ticket.requestId
      && stored.ticketId === ticket.ticketId
      && stored.width === Number(output.width)
      && stored.height === Number(output.height)
      && stored.projectImageStorageId === parameters.projectImageStorageId
      && stored.projectImageSha256 === parameters.projectImageSha256
      && stored.garmentId === parameters.garmentId
      && stored.viewId === parameters.viewId
      && stored.viewContentSha256 === parameters.viewSha256
      && stored.representationId === parameters.representationId
      && stored.representationContentSha256 === parameters.representationSha256
      && stored.anchorSetId === parameters.anchorSetId
      && stored.anchorPayloadSha256 === parameters.anchorPayloadSha256
      && stored.destinationMeshSha256 === parameters.destinationMeshSha256
    );
    if (!matches) {
      throw replayError(409, 'fashion_tryon_opaque_terminal_artifact_mismatch', 'Committed Fashion garment warp layer differs from the durable ticket lineage');
    }
    return success();
  }

  async tryRecoverTextureComposite(
    input: FashionTryOnOpaqueTerminalReplayLookup,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnOpaqueTerminalReplayResult | undefined> {
    const ticket = await this.requireScopedTicket(input, auth);
    assertGarmentTextureCompositeTicket(ticket);
    const status = await this.terminalStatus(ticket.ticketId);
    if (status === undefined) return undefined;
    if (status === 'FAILED') return failed();

    const stored = await this.dependencies.finals.loadFinalByExecution(ticket.requestId, ticket.scope);
    if (!stored) {
      throw replayError(409, 'fashion_tryon_opaque_terminal_artifact_unavailable', 'Committed garment texture-composite FINAL is unavailable');
    }

    const output = garmentTextureCompositeOutputContract(ticket);
    const parameters = garmentTextureCompositeParametersFromTicket(ticket);
    const matches = (
      stored.tenantId === ticket.scope.tenantId
      && stored.userId === ticket.scope.userId
      && stored.projectId === ticket.scope.projectId
      && stored.executionId === ticket.requestId
      && stored.operationId === ticket.stepId
      && stored.role === 'COMPOSITE'
      && stored.lifecycle === 'FINAL'
      && stored.width === Number(output.width)
      && stored.height === Number(output.height)
      && stored.sourceImageStorageId === parameters.projectImageStorageId
      && stored.producerOperation === 'GARMENT_TEXTURE_COMPOSITE'
      && stored.garmentWarpLayerId === parameters.garmentWarpLayerId
      && stored.garmentWarpLayerSha256 === parameters.garmentWarpLayerSha256
      && stored.producerParametersSha256 === parameters.producerParametersSha256
    );
    if (!matches) {
      throw replayError(409, 'fashion_tryon_opaque_terminal_artifact_mismatch', 'Committed garment texture-composite FINAL differs from the durable ticket lineage');
    }
    return success();
  }

  private async requireScopedTicket(
    input: FashionTryOnOpaqueTerminalReplayLookup,
    auth: AuthenticatedScope,
  ): Promise<LocalExecutionTicketV2> {
    const lookup = normalizeLookup(input);
    const ticket = await this.dependencies.admission.getV2(lookup.ticketId);
    if (!ticket) {
      throw replayError(404, 'fashion_tryon_opaque_ticket_not_found', 'Fashion Try-On execution handle was not found');
    }
    if (
      ticket.scope.tenantId !== auth.tenantId
      || ticket.scope.userId !== auth.userId
      || ticket.scope.projectId !== lookup.projectId
    ) {
      throw replayError(403, 'fashion_tryon_opaque_ticket_scope_mismatch', 'Fashion Try-On execution handle is outside the authenticated Project scope');
    }
    return ticket;
  }

  private async terminalStatus(ticketId: string): Promise<'SUCCESS' | 'FAILED' | undefined> {
    const finalization = await this.dependencies.admission.getFinalization(ticketId);
    if (!finalization || finalization.status === 'UNKNOWN') return undefined;
    return finalization.status;
  }
}

function normalizeLookup(input: FashionTryOnOpaqueTerminalReplayLookup): Readonly<{ ticketId: string; projectId: string }> {
  if (!input || typeof input !== 'object') {
    throw replayError(400, 'invalid_fashion_tryon_opaque_terminal_lookup', 'Fashion Try-On terminal replay lookup is required');
  }
  return Object.freeze({
    ticketId: canonicalUuid(input.ticketId, 'ticketId'),
    projectId: canonicalUuid(input.projectId, 'projectId'),
  });
}

function canonicalUuid(value: unknown, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw replayError(400, 'invalid_fashion_tryon_opaque_terminal_lookup', `${label} must be a canonical lowercase UUID`);
  }
  return value;
}

function success(): FashionTryOnOpaqueTerminalReplayResult {
  return Object.freeze({ status: 'SUCCESS' });
}
function failed(): FashionTryOnOpaqueTerminalReplayResult {
  return Object.freeze({ status: 'FAILED' });
}
function replayError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
