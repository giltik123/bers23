import type { CreativeArtifact, LocalExecutionTicketV2 } from '../../../src/platform/creative/canonical/index.ts';
import {
  BACKGROUND_ISOLATION_CAPABILITY,
  BACKGROUND_ISOLATION_TOOL_ID,
  BACKGROUND_ISOLATION_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/BackgroundIsolation.ts';
import {
  CROP_CAPABILITY,
  CROP_OPERATION,
  CROP_STEP_ID,
  CROP_TOOL_ID,
  CROP_TOOL_VERSION,
  normalizeCropRect,
} from '../../../src/platform/creative/deterministic/Crop.ts';
import {
  RESIZE_CAPABILITY,
  RESIZE_OPERATION,
  RESIZE_STEP_ID,
  RESIZE_TOOL_ID,
  RESIZE_TOOL_VERSION,
  normalizeResizeDimensions,
} from '../../../src/platform/creative/deterministic/Resize.ts';
import { RESIZE_TOOL_DEFINITION } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';
import {
  REAL_ESRGAN_UPSCALE_CAPABILITY,
  SUPER_RESOLUTION_ALPHA_POLICY,
  SUPER_RESOLUTION_OPERATION,
  SUPER_RESOLUTION_SCALE,
  SUPER_RESOLUTION_STEP_ID,
} from '../../../src/platform/creative/super-resolution/SuperResolutionContract.ts';
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

export type CropInputDelivery = Readonly<{
  ticketId: string;
  sourceArtifactId: string;
  sourceSha256: string;
  width: number;
  height: number;
  sourceRgba: Uint8Array;
}>;

export type ResizeInputDelivery = CropInputDelivery;
export type SuperResolutionInputDelivery = CropInputDelivery;

export type LocalExecutionInputDeliveryDependencies = Readonly<{
  admission: LocalExecutionLedgerV2;
  ownsArtifacts: (scope: AuthenticatedScope & { projectId: string }, artifactIds: readonly string[]) => Promise<boolean>;
  hydrateArtifacts: (scope: AuthenticatedScope & { projectId: string }, sourceId: string, maskIds: readonly string[]) => Promise<readonly CreativeArtifact[]>;
  now?: () => number;
}>;

/**
 * Read-only delivery boundary for bytes already bound by a Core-issued local ticket.
 * It never issues tickets, chooses executors, persists artifacts or mutates Project state.
 * Capability-specific methods revalidate the exact durable ticket before returning bytes,
 * so model/tool adapters do not gain a generic read endpoint for arbitrary canonical artifacts.
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
    const ticket = await this.requireTicket(input, auth);
    assertBackgroundIsolationTicket(ticket);

    const sourceBinding = ticket.inputs.find(binding => binding.kind === 'image');
    const maskBinding = ticket.inputs.find(binding => binding.kind === 'mask');
    if (ticket.inputs.length !== 2 || !sourceBinding?.sha256 || !maskBinding?.sha256) throw serviceError(409, 'local_input_contract_mismatch', 'Background isolation requires exact IMAGE + MASK bindings');
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId, maskBinding.artifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical local inputs are no longer available for this ticket');

    let artifacts: readonly CreativeArtifact[];
    try { artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, sourceBinding.artifactId, [maskBinding.artifactId]); }
    catch { throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical local input hydration or lineage validation failed'); }
    assertInputAdmission(ticket, artifacts);

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

  async crop(
    input: Readonly<{ ticketId: string; projectId: string }>,
    auth: AuthenticatedScope,
  ): Promise<CropInputDelivery> {
    const ticket = await this.requireTicket(input, auth);
    assertCropTicket(ticket);
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || !ticket.inputs[0].sha256) throw serviceError(409, 'local_input_contract_mismatch', 'Crop requires exactly one hash-bound IMAGE input');
    const sourceBinding = ticket.inputs[0];
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical Crop source is no longer available for this ticket');

    let artifacts: readonly CreativeArtifact[];
    try { artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, sourceBinding.artifactId, []); }
    catch { throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical Crop source hydration failed'); }
    assertInputAdmission(ticket, artifacts);
    const source = artifacts.find(artifact => artifact.id === sourceBinding.artifactId && artifact.kind === 'image');
    const value = source?.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
    if (!Number.isSafeInteger(value?.width) || !Number.isSafeInteger(value?.height) || !(value?.data instanceof Uint8ClampedArray)) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical Crop source RGBA pixels are unavailable');
    const width = Number(value.width); const height = Number(value.height);
    if (width < 1 || height < 1 || value.data.length !== width * height * 4) throw serviceError(409, 'local_input_geometry_mismatch', 'Canonical Crop source geometry is invalid');
    const parameters = ticket.operation.parameters as Readonly<Record<string, unknown>> | undefined;
    try { normalizeCropRect({ x: Number(parameters?.x), y: Number(parameters?.y), width: Number(parameters?.width), height: Number(parameters?.height) }, width, height); }
    catch { throw serviceError(409, 'local_ticket_parameter_mismatch', 'Crop ticket rectangle no longer fits the canonical source'); }

    return Object.freeze({
      ticketId: ticket.ticketId,
      sourceArtifactId: sourceBinding.artifactId,
      sourceSha256: sourceBinding.sha256,
      width,
      height,
      sourceRgba: Uint8Array.from(value.data),
    });
  }

  async resize(
    input: Readonly<{ ticketId: string; projectId: string }>,
    auth: AuthenticatedScope,
  ): Promise<ResizeInputDelivery> {
    const ticket = await this.requireTicket(input, auth);
    assertResizeTicket(ticket);
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || !ticket.inputs[0].sha256) throw serviceError(409, 'local_input_contract_mismatch', 'Resize requires exactly one hash-bound IMAGE input');
    const sourceBinding = ticket.inputs[0];
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical Resize source is no longer available for this ticket');

    let artifacts: readonly CreativeArtifact[];
    try { artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, sourceBinding.artifactId, []); }
    catch { throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical Resize source hydration failed'); }
    assertInputAdmission(ticket, artifacts);
    const source = artifacts.find(artifact => artifact.id === sourceBinding.artifactId && artifact.kind === 'image');
    const value = source?.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
    if (!Number.isSafeInteger(value?.width) || !Number.isSafeInteger(value?.height) || !(value?.data instanceof Uint8ClampedArray)) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical Resize source RGBA pixels are unavailable');
    const width = Number(value.width); const height = Number(value.height);
    if (width < 1 || height < 1 || value.data.length !== width * height * 4) throw serviceError(409, 'local_input_geometry_mismatch', 'Canonical Resize source geometry is invalid');
    const parameters = ticket.operation.parameters as Readonly<Record<string, unknown>> | undefined;
    try { normalizeResizeDimensions({ width: Number(parameters?.width), height: Number(parameters?.height) }, width, height); }
    catch { throw serviceError(409, 'local_ticket_parameter_mismatch', 'Resize ticket target dimensions are invalid for the canonical source'); }

    return Object.freeze({
      ticketId: ticket.ticketId,
      sourceArtifactId: sourceBinding.artifactId,
      sourceSha256: sourceBinding.sha256,
      width,
      height,
      sourceRgba: Uint8Array.from(value.data),
    });
  }

  async superResolution(
    input: Readonly<{ ticketId: string; projectId: string }>,
    auth: AuthenticatedScope,
  ): Promise<SuperResolutionInputDelivery> {
    const ticket = await this.requireTicket(input, auth);
    assertSuperResolutionTicket(ticket);
    if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || !ticket.inputs[0].sha256) throw serviceError(409, 'local_input_contract_mismatch', 'Super-resolution requires exactly one hash-bound IMAGE input');
    const sourceBinding = ticket.inputs[0];
    if (!await this.dependencies.ownsArtifacts(ticket.scope, [sourceBinding.artifactId])) throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical super-resolution source is no longer available for this ticket');

    let artifacts: readonly CreativeArtifact[];
    try { artifacts = await this.dependencies.hydrateArtifacts(ticket.scope, sourceBinding.artifactId, []); }
    catch { throw serviceError(409, 'local_input_lineage_unavailable', 'Canonical super-resolution source hydration failed'); }
    assertInputAdmission(ticket, artifacts);
    const source = artifacts.find(artifact => artifact.id === sourceBinding.artifactId && artifact.kind === 'image');
    const value = source?.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown }> | undefined;
    if (!Number.isInteger(value?.width) || !Number.isInteger(value?.height) || !(value?.data instanceof Uint8ClampedArray)) throw serviceError(409, 'canonical_source_pixels_unavailable', 'Canonical super-resolution source RGBA pixels are unavailable');
    const width = Number(value.width); const height = Number(value.height);
    if (width < 1 || height < 1 || value.data.length !== width * height * 4) throw serviceError(409, 'local_input_geometry_mismatch', 'Canonical super-resolution source geometry is invalid');
    for (let offset = 3; offset < value.data.length; offset += 4) if (value.data[offset] !== 255) throw serviceError(409, 'local_input_alpha_policy_mismatch', 'Super-resolution v1 accepts opaque canonical source images only');

    return Object.freeze({
      ticketId: ticket.ticketId,
      sourceArtifactId: sourceBinding.artifactId,
      sourceSha256: sourceBinding.sha256,
      width,
      height,
      sourceRgba: Uint8Array.from(value.data),
    });
  }

  private async requireTicket(input: Readonly<{ ticketId: string; projectId: string }>, auth: AuthenticatedScope): Promise<LocalExecutionTicketV2> {
    const ticketId = input.ticketId?.trim(); const projectId = input.projectId?.trim();
    if (!ticketId || !projectId) throw serviceError(400, 'local_input_delivery_request_invalid', 'ticketId and projectId are required');
    const ticket = await this.dependencies.admission.getV2(ticketId);
    if (!ticket) throw serviceError(404, 'local_ticket_not_found', 'Local execution ticket not found');
    assertSameScope(ticket, { ...auth, projectId });
    if (this.#now() >= ticket.expiresAt) throw serviceError(410, 'local_ticket_expired', 'Local execution ticket has expired');
    return ticket;
  }
}

function assertInputAdmission(ticket: LocalExecutionTicketV2, artifacts: readonly CreativeArtifact[]): void {
  const decision = admitLocalExecutionInputs(ticket, artifacts);
  if (!decision.allowed) throw serviceError(409, `local_input_${decision.reasonCode.toLowerCase()}`, `Canonical local input admission failed: ${decision.reasonCode}`);
}

function assertBackgroundIsolationTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY' || ticket.operation.type !== 'BACKGROUND_ISOLATION' || ticket.operation.capability !== BACKGROUND_ISOLATION_CAPABILITY || ticket.operation.id !== 'background-isolation' || ticket.stepId !== 'background-isolation') throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not a background isolation local-execution contract');
  if (ticket.allowedExecutors.length !== 1) throw serviceError(409, 'local_ticket_executor_mismatch', 'Background isolation ticket must bind exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== BACKGROUND_ISOLATION_TOOL_ID || executor.version !== BACKGROUND_ISOLATION_TOOL_VERSION) throw serviceError(409, 'local_ticket_executor_mismatch', 'Background isolation deterministic executor binding is invalid');
}

function assertCropTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY' || ticket.operation.type !== CROP_OPERATION || ticket.operation.capability !== CROP_CAPABILITY || ticket.operation.id !== CROP_STEP_ID || ticket.stepId !== CROP_STEP_ID) throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not a Crop local-execution contract');
  if (ticket.allowedExecutors.length !== 1) throw serviceError(409, 'local_ticket_executor_mismatch', 'Crop ticket must bind exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== CROP_TOOL_ID || executor.version !== CROP_TOOL_VERSION) throw serviceError(409, 'local_ticket_executor_mismatch', 'Crop deterministic executor binding is invalid');
  const parameters = ticket.operation.parameters;
  if (!parameters || parameters.deterministicTool !== `${CROP_TOOL_ID}@${CROP_TOOL_VERSION}` || parameters.coordinateSpace !== 'CANONICAL_ORIENTATION_1_PIXEL_INDICES' || parameters.rectangleSemantics !== 'HALF_OPEN' || !Number.isSafeInteger(parameters.x) || !Number.isSafeInteger(parameters.y) || !Number.isSafeInteger(parameters.width) || !Number.isSafeInteger(parameters.height)) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Crop ticket parameters are invalid');
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'image/png' || output.width !== parameters.width || output.height !== parameters.height) throw serviceError(409, 'local_output_contract_error', 'Crop ticket output geometry is invalid');
}

function assertResizeTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY' || ticket.operation.type !== RESIZE_OPERATION || ticket.operation.capability !== RESIZE_CAPABILITY || ticket.operation.id !== RESIZE_STEP_ID || ticket.stepId !== RESIZE_STEP_ID) throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not a Resize local-execution contract');
  if (ticket.allowedExecutors.length !== 1) throw serviceError(409, 'local_ticket_executor_mismatch', 'Resize ticket must bind exactly one executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== RESIZE_TOOL_ID || executor.version !== RESIZE_TOOL_VERSION) throw serviceError(409, 'local_ticket_executor_mismatch', 'Resize deterministic executor binding is invalid');
  const parameters = ticket.operation.parameters;
  const exact = RESIZE_TOOL_DEFINITION.parameters.exact;
  if (!parameters || !Number.isSafeInteger(parameters.width) || !Number.isSafeInteger(parameters.height) || parameters.deterministicTool !== exact.deterministicTool || parameters.coordinateSpace !== exact.coordinateSpace || parameters.interpolation !== exact.interpolation || parameters.fixedPointBits !== exact.fixedPointBits || parameters.rounding !== exact.rounding || parameters.borderPolicy !== exact.borderPolicy || parameters.alphaPolicy !== exact.alphaPolicy || parameters.maxOutputPixels !== exact.maxOutputPixels) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Resize ticket parameters are invalid');
  try { normalizeResizeDimensions({ width: Number(parameters.width), height: Number(parameters.height) }, 1, 1); }
  catch { throw serviceError(409, 'local_ticket_parameter_mismatch', 'Resize ticket target dimensions exceed v1 limits'); }
  const output = ticket.expectedOutputs[0];
  if (ticket.expectedOutputs.length !== 1 || output.kind !== 'image' || output.role !== 'COMPOSITE' || output.mimeTypes?.length !== 1 || output.mimeTypes[0] !== 'image/png' || output.width !== parameters.width || output.height !== parameters.height) throw serviceError(409, 'local_output_contract_error', 'Resize ticket output geometry is invalid');
}

function assertSuperResolutionTicket(ticket: LocalExecutionTicketV2): void {
  if (ticket.version !== '2' || ticket.issuer !== 'CORE' || ticket.policy !== 'LOCAL_ONLY' || ticket.operation.type !== SUPER_RESOLUTION_OPERATION || ticket.operation.capability !== REAL_ESRGAN_UPSCALE_CAPABILITY || ticket.operation.id !== SUPER_RESOLUTION_STEP_ID || ticket.stepId !== SUPER_RESOLUTION_STEP_ID) throw serviceError(409, 'local_ticket_capability_mismatch', 'Ticket is not a super-resolution local-execution contract');
  if (ticket.allowedExecutors.length !== 1 || ticket.allowedExecutors[0].kind !== 'MODEL') throw serviceError(409, 'local_ticket_executor_mismatch', 'Super-resolution ticket must bind exactly one MODEL executor');
  const parameters = ticket.operation.parameters;
  if (!parameters || parameters.scale !== SUPER_RESOLUTION_SCALE || parameters.alphaPolicy !== SUPER_RESOLUTION_ALPHA_POLICY) throw serviceError(409, 'local_ticket_parameter_mismatch', 'Super-resolution ticket parameters are invalid');
}

function assertSameScope(ticket: LocalExecutionTicketV2, scope: AuthenticatedScope & { projectId: string }): void {
  if (ticket.scope.tenantId !== scope.tenantId || ticket.scope.userId !== scope.userId || ticket.scope.projectId !== scope.projectId) throw serviceError(403, 'local_ticket_scope_mismatch', 'Local execution ticket is outside the authenticated scope');
}
function serviceError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }