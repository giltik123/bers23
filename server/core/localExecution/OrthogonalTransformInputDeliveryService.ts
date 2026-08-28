import type { CreativeArtifact, LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/index.ts';
import {
  ORTHOGONAL_TRANSFORM_CAPABILITY,
  ORTHOGONAL_TRANSFORM_OPERATION,
  ORTHOGONAL_TRANSFORM_STEP_ID,
  ORTHOGONAL_TRANSFORM_TOOL_ID,
  ORTHOGONAL_TRANSFORM_TOOL_VERSION,
  normalizeOrthogonalTransformMode,
  orthogonalTransformOutputGeometry,
} from '../../../src/platform/creative/deterministic/OrthogonalTransform.ts';
import { ORTHOGONAL_TRANSFORM_TOOL_DEFINITION } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import { admitLocalExecutionInputs } from './LocalExecutionInputAdmission.ts';
import type { LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';

const TOOL = ORTHOGONAL_TRANSFORM_TOOL_DEFINITION;

export type OrthogonalTransformInputDelivery = Readonly<{
  ticketId: string;
  sourceArtifactId: string;
  sourceSha256: string;
  width: number;
  height: number;
  sourceRgba: Uint8Array;
}>;

export type OrthogonalTransformInputDeliveryDependencies = Readonly<{
  admission: LocalExecutionLedgerV2;
  ownsArtifacts: (scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: AuthenticatedScope & { projectId: string }, sourceId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
  now?: () => number;
}>;

/** Read-only capability-specific source delivery. No generic artifact read authority is exposed. */
export class OrthogonalTransformInputDeliveryService {
  readonly #now: () => number;
  constructor(private readonly dependencies: OrthogonalTransformInputDeliveryDependencies) { this.#now = dependencies.now ?? Date.now; }

  async deliver(input: Readonly<{ ticketId: string; projectId: string }>, auth: AuthenticatedScope): Promise<OrthogonalTransformInputDelivery> {
    const ticketId = input.ticketId?.trim(); const projectId = input.projectId?.trim();
    if (!ticketId || !projectId) throw serviceError(400, 'local_input_delivery_request_invalid', 'ticketId and projectId are required');
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw serviceError(404, 'local_ticket_not_found', 'Local orthogonal-transform ticket not found');
    assertSameScope(ticket, { ...auth, projectId });
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local orthogonal-transform ticket has expired');
    assertTicket(ticket);

    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || !ticket.inputs[0].sha256) throw serviceError(409, 'local_input_contract_mismatch', 'Orthogonal transform requires exactly one hash-bound IMAGE input');
    const binding = ticket.inputs[0];
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [binding.artifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical orthogonal-transform source is no longer available for this ticket');

    let artifacts: readonly CreativeArtifact[];
    try { artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, binding.artifactId, []); }
    catch { throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical orthogonal-transform source hydration failed'); }
    const admission = admitLocalExecutionInputs(ticket, artifacts);
    if (!admission.allowed) throw serviceError(409, `local_input_${admission.reasonCode.toLowerCase()}`, `Canonical orthogonal-transform input admission failed: ${admission.reasonCode}`);

    const source = artifacts.find(artifact => artifact.id === binding.artifactId && artifact.kind === 'image');
    const value = source?.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
    if (!Number.isSafeInteger(value?.width) || !Number.isSafeInteger(value?.height) || !(value?.data instanceof Uint8ClampedArray)) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical orthogonal-transform source RGBA pixels are unavailable');
    const width = Number(value.width); const height = Number(value.height);
    if (width < 1 || height < 1 || value.data.length !== width * height * 4 || source?.image?.orientation !== 1 || source.image.colorSpace !== 'srgb') throw serviceError(409, 'local_input_geometry_mismatch', 'Canonical orthogonal-transform source geometry is invalid');

    const parameters = ticket.operation.parameters as Readonly<Record<string, unknown>> | undefined;
    let mode;
    try { mode = normalizeOrthogonalTransformMode(parameters?.mode); }
    catch { throw serviceError(409, 'local_ticket_parameter_mismatch', 'Orthogonal-transform ticket mode is invalid'); }
    const geometry = orthogonalTransformOutputGeometry(width, height, mode);
    const output = ticket.expectedOutputs[0];
    if (ticket.expectedOutputs.length !== 1 || output.width !== geometry.width || output.height !== geometry.height) throw serviceError(409, 'local_output_geometry_mismatch', 'Orthogonal-transform ticket geometry is not derived from the canonical source');

    return Object.freeze({ ticketId, sourceArtifactId: binding.artifactId, sourceSha256: binding.sha256, width, height, sourceRgba: Uint8Array.from(value.data) });
  }
}

function assertTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY' || ticket.operation.type !== ORTHOGONAL_TRANSFORM_OPERATION || ticket.operation.capability !== ORTHOGONAL_TRANSFORM_CAPABILITY || ticket.operation.id !== ORTHOGONAL_TRANSFORM_STEP_ID || ticket.stepId !== ORTHOGONAL_TRANSFORM_STEP_ID) throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not an orthogonal-transform local-execution contract');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw serviceError(409, 'local_ticket_cost_mismatch', 'Orthogonal-transform ticket must remain zero-cloud');
  if (ticket.allowedExecutors.length !== 1) throw serviceError(409, 'local_ticket_executor_mismatch', 'Orthogonal-transform ticket must bind exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== ORTHOGONAL_TRANSFORM_TOOL_ID || executor.version !== ORTHOGONAL_TRANSFORM_TOOL_VERSION) throw serviceError(409, 'local_ticket_executor_mismatch', 'Orthogonal-transform deterministic executor binding is invalid');
  const parameters = ticket.operation.parameters;
  const exact = TOOL.parameters.exact;
  if (!parameters || parameters.deterministicTool !== exact.deterministicTool || parameters.coordinateSpace !== exact.coordinateSpace || parameters.mapping !== exact.mapping || parameters.interpolation !== exact.interpolation || parameters.rounding !== exact.rounding || parameters.alphaPolicy !== exact.alphaPolicy) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Orthogonal-transform ticket semantic parameters are invalid');
}

function assertSameScope(ticket: LocalExecutionTicketV2, scope: AuthenticatedScope & { projectId: string }): void {
  if (ticket.scope.tenantId !== scope.tenantId || ticket.scope.userId !== scope.userId || ticket.scope.projectId !== scope.projectId) throw serviceError(403, 'local_execution_scope_denied', 'Local orthogonal-transform input delivery scope denied');
}
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
