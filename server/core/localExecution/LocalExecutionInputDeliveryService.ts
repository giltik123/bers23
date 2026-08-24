import type { CreativeArtifact, LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/index.ts';
import {
  BACKGROUND_ISOLATION_CAPABILITY,
  BACKGROUND_ISOLATION_TOOL_ID,
  BACKGROUND_ISOLATION_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';

export type BackgroundIsolationInputDelivery = Readonly<{
  ticketId: string;
  sourceArtifactId: string;
  maskArtifactId: string;
  sourceSha256: string;
  maskSha256: string;
  width: number;
  height: number;
  sourceRgba: Uint8Array;
  maskAlpha: Uint8Array;
}>;

export type LocalExecutionInputDeliveryDependencies = Readonly<{
  admission: LocalExecutionLedgerV2;
  ownsArtifacts: (scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: AuthenticatedScope & { projectId: string }, sourceId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
  now?: () => number;
}>;

/**
 * Read-only delivery boundary for bytes already bound by a Core-issued local ticket.
 * It never issues tickets, chooses executors, persists artifacts or mutates Project state.
 * The first consumer is deterministic background isolation; future local model adapters may
 * reuse the same pattern without inheriting deterministic-tool admission semantics.
 */
export class LocalExecutionInputDeliveryService {
  readonly #now: () => number;
  constructor(private readonly dependencies: LocalExecutionInputDeliveryDependencies) {
    this.#now = dependencies.now ?? Date.now;
  }

  async backgroundIsolation(
    input: Readonly<{ ticketId: string; projectId: string }>,
    auth: AuthenticatedScope,
  ): Promise<BackgroundIsolationInputDelivery> {
    const ticketId = input.ticketId?.trim(); const projectId = input.projectId?.trim();
    if (!ticketId || !projectId) throw serviceError(400, 'local_input_delivery_request_invalid', 'ticketId and projectId are required');
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw serviceError(404, 'local_ticket_not_found', 'Local execution ticket not found');
    assertSameScope(ticket, { ...auth, projectId });
    assertBackgroundIsolationTicket(ticket);
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local execution ticket has expired');

    const sourceBinding = ticket.inputs.find(binding => binding.kind === 'image');
    const maskBinding = ticket.inputs.find(binding => binding.kind === 'mask');
    if (ticket.inputs.length !== 2 || !sourceBinding?.sha256 || !maskBinding?.sha256) throw serviceError(409, 'local_input_contract_mismatch', 'Background isolation requires exact IMAGE + MASK bindings');
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId, maskBinding.artifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical local inputs are no longer available for this ticket');

    let artifacts: readonly CreativeArtifact[];
    try { artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, sourceBinding.artifactId, [maskBinding.artifactId]); }
    catch { throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical local input hydration or lineage validation failed'); }
    const decision = admitLocalExecutionInputs(ticket, artifacts);
    if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical local input admission failed: ${decision.reasonCode}`);

    const source = artifacts.find(artifact => artifact.id === sourceBinding.artifactId && artifact.kind === 'image');
    const mask = artifacts.find(artifact => artifact.id === maskBinding.artifactId && artifact.kind === 'mask');
    const sourceValue = source?.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
    const maskValue = mask?.value as Readonly<{ width?: unknown; height?: unknown; alpha?: unknown }> | undefined;
    if (!Number.isInteger(sourceValue?.width) || !Number.isInteger(sourceValue?.height) || !(sourceValue?.data instanceof Uint8ClampedArray)) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical source RGBA pixels are unavailable');
    if (!Number.isInteger(maskValue?.width) || !Number.isInteger(maskValue?.height) || !(maskValue?.alpha instanceof Uint8Array)) throw serviceError(409, 'canonical_mask_pixels_unavailable', 'Canonical MASK alpha pixels are unavailable');
    const width = Number(sourceValue.width); const height = Number(sourceValue.height);
    if (width < 1 || height < 1 || Number(maskValue.width) !== width || Number(maskValue.height) !== height || sourceValue.data.length !== width * height * 4 || maskValue.alpha.length !== width * height) throw serviceError(409, 'local_input_geometry_mismatch', 'Canonical local input geometry is invalid');

    return Object.freeze({
      ticketId: ticket.ticketId,
      sourceArtifactId: sourceBinding.artifactId,
      maskArtifactId: maskBinding.artifactId,
      sourceSha256: sourceBinding.sha256,
      maskSha256: maskBinding.sha256,
      width,
      height,
      sourceRgba: Uint8Array.from(sourceValue.data),
      maskAlpha: Uint8Array.from(maskValue.alpha),
    });
  }
}

function assertBackgroundIsolationTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY' || ticket.operation.type !== 'BACKGROUND_ISOLATION' || ticket.operation.capability !== BACKGROUND_ISOLATION_CAPABILITY || ticket.operation.id !== 'background-isolation' || ticket.stepId !== 'background-isolation') throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not a background isolation local-execution contract');
  if (ticket.allowedExecutors.length !== 1) throw serviceError(409, 'local_ticket_executor_mismatch', 'Background isolation ticket must bind exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== BACKGROUND_ISOLATION_TOOL_ID || executor.version !== BACKGROUND_ISOLATION_TOOL_VERSION) throw serviceError(409, 'local_ticket_executor_mismatch', 'Background isolation deterministic executor binding is invalid');
}
function assertSameScope(ticket: LocalExecutionTicketV2, scope: AuthenticatedScope & { projectId: string }): void {
  if (ticket.scope.tenantId !== scope.tenantId || ticket.scope.userId !== scope.userId || ticket.scope.projectId !== scope.projectId) throw serviceError(403, 'local_ticket_scope_mismatch', 'Local execution ticket is outside the authenticated scope');
}
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
