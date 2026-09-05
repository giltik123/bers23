import { createHash } from 'node:crypto';
import type {
  LocalExecutionManagedGarmentParametricRepresentationInputBinding,
  LocalExecutionManagedGarmentViewInputBinding,
  LocalExecutionTicketV2,
} from '../../../src/platform/creative/canonical/localExecution.ts';
import {
  GARMENT_MESH_WARP_CAPABILITY,
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_SCHEMA,
  GARMENT_MESH_WARP_STEP_ID,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/GarmentMeshWarpIdentity.js';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../../../src/platform/creative/deterministic/GarmentMeshWarpRegistryDefinition.js';
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';

const TOOL = GARMENT_MESH_WARP_TOOL_DEFINITION;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const CLIENT_REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
export const GARMENT_MESH_WARP_IDEMPOTENCY_SUFFIX = `:${GARMENT_MESH_WARP_STEP_ID}:local-v2`;

export type GarmentMeshWarpTicketParameters = Readonly<{
  sourceArtifactId: string;
  garmentId: string;
  viewId: string;
  representationId: string;
  anchorSetId: string;
  projectImageStorageId: string;
  projectImageSha256: string;
  viewSha256: string;
  representationSha256: string;
  anchorPayloadSha256: string;
  destinationMeshSha256: string;
  deterministicTool: string;
  meshSchema: string;
  sourceCoordinateSpace: string;
  destinationCoordinateSpace: string;
  fixedPointBits: number;
  rasterization: string;
  interpolation: string;
  rounding: string;
  alphaPolicy: string;
  uncoveredPixels: string;
  maxOutputPixels: number;
  maxRasterWork: number;
}>;

export type GarmentMeshWarpManagedBindings = Readonly<{
  view: LocalExecutionManagedGarmentViewInputBinding;
  representation: LocalExecutionManagedGarmentParametricRepresentationInputBinding;
}>;

export function assertGarmentMeshWarpTicket(ticket: LocalExecutionTicketV2): void {
  if (
    ticket.version !== '2'
    || ticket.issuer !== 'CORE'
    || ticket.operation.capability !== GARMENT_MESH_WARP_CAPABILITY
    || ticket.operation.type !== GARMENT_MESH_WARP_OPERATION
    || ticket.operation.id !== GARMENT_MESH_WARP_STEP_ID
    || ticket.stepId !== GARMENT_MESH_WARP_STEP_ID
    || ticket.policy !== 'LOCAL_ONLY'
  ) throw contractError('local_ticket_capability_mismatch', 'Ticket is not the exact deterministic garment mesh-warp contract');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) throw contractError('local_ticket_cost_mismatch', 'Garment mesh-warp ticket must remain zero-cloud');
  if (ticket.allowedExecutors.length !== 1) throw contractError('local_ticket_executor_mismatch', 'Garment mesh warp must bind exactly one deterministic executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== GARMENT_MESH_WARP_TOOL_ID || executor.version !== GARMENT_MESH_WARP_TOOL_VERSION) {
    throw contractError('local_ticket_executor_mismatch', 'Garment mesh-warp executor binding is invalid');
  }
  if (ticket.inputs.length !== 1 || ticket.inputs[0].kind !== 'image' || !['ORIGINAL', 'COMPOSITE'].includes(String(ticket.inputs[0].role)) || !ticket.inputs[0].sha256 || !SHA.test(ticket.inputs[0].sha256)) {
    throw contractError('local_ticket_input_contract_mismatch', 'Garment mesh warp requires exactly one SHA-bound Project IMAGE input');
  }
  const parameters = garmentMeshWarpParametersFromTicket(ticket);
  const bindings = garmentMeshWarpManagedBindings(ticket);
  assertManagedBindingsMatchParameters(bindings, parameters);
  const exact = TOOL.parameters.exact;
  const exactPairs: readonly [keyof GarmentMeshWarpTicketParameters, string | number | boolean][] = [
    ['deterministicTool', exact.deterministicTool],
    ['meshSchema', exact.meshSchema],
    ['sourceCoordinateSpace', exact.sourceCoordinateSpace],
    ['destinationCoordinateSpace', exact.destinationCoordinateSpace],
    ['fixedPointBits', exact.fixedPointBits],
    ['rasterization', exact.rasterization],
    ['interpolation', exact.interpolation],
    ['rounding', exact.rounding],
    ['alphaPolicy', exact.alphaPolicy],
    ['uncoveredPixels', exact.uncoveredPixels],
    ['maxOutputPixels', exact.maxOutputPixels],
    ['maxRasterWork', exact.maxRasterWork],
  ];
  if (exactPairs.some(([key, value]) => parameters[key] !== value)) throw contractError('local_ticket_parameter_mismatch', 'Garment mesh-warp deterministic semantic parameters are invalid');
  if (parameters.meshSchema !== GARMENT_MESH_WARP_SCHEMA) throw contractError('local_ticket_parameter_mismatch', 'Garment mesh-warp schema identity is invalid');
  garmentMeshWarpOutputContract(ticket);
}

export function garmentMeshWarpParametersFromTicket(ticket: LocalExecutionTicketV2): GarmentMeshWarpTicketParameters {
  const value = ticket.operation.parameters;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw contractError('local_ticket_parameter_mismatch', 'Garment mesh-warp ticket parameters are missing');
  const p = value as Record<string, unknown>;
  const requiredKeys = [
    'alphaPolicy','anchorPayloadSha256','anchorSetId','destinationCoordinateSpace','destinationMeshSha256','deterministicTool','fixedPointBits','garmentId','interpolation','maxOutputPixels','maxRasterWork','meshSchema','projectImageSha256','projectImageStorageId','rasterization','representationId','representationSha256','rounding','sourceArtifactId','sourceCoordinateSpace','uncoveredPixels','viewId','viewSha256',
  ];
  if (Object.keys(p).sort().join('|') !== requiredKeys.join('|')) throw contractError('local_ticket_parameter_mismatch', 'Garment mesh-warp ticket parameter schema is open or incomplete');
  for (const key of ['garmentId','viewId','representationId','anchorSetId','projectImageStorageId'] as const) if (typeof p[key] !== 'string' || !UUID.test(p[key] as string)) throw contractError('local_ticket_parameter_mismatch', `Garment mesh-warp ${key} is invalid`);
  for (const key of ['projectImageSha256','viewSha256','representationSha256','anchorPayloadSha256','destinationMeshSha256'] as const) if (typeof p[key] !== 'string' || !SHA.test(p[key] as string)) throw contractError('local_ticket_parameter_mismatch', `Garment mesh-warp ${key} is invalid`);
  if (typeof p.sourceArtifactId !== 'string' || !p.sourceArtifactId.trim() || [...p.sourceArtifactId].length > 512 || /[\u0000-\u001f\u007f]/u.test(p.sourceArtifactId)) throw contractError('local_ticket_parameter_mismatch', 'Garment mesh-warp sourceArtifactId is invalid');
  for (const key of ['deterministicTool','meshSchema','sourceCoordinateSpace','destinationCoordinateSpace','rasterization','interpolation','rounding','alphaPolicy','uncoveredPixels'] as const) if (typeof p[key] !== 'string') throw contractError('local_ticket_parameter_mismatch', `Garment mesh-warp ${key} is invalid`);
  for (const key of ['fixedPointBits','maxOutputPixels','maxRasterWork'] as const) if (!Number.isSafeInteger(p[key]) || Number(p[key]) < 1) throw contractError('local_ticket_parameter_mismatch', `Garment mesh-warp ${key} is invalid`);
  return Object.freeze(p as unknown as GarmentMeshWarpTicketParameters);
}

export function garmentMeshWarpManagedBindings(ticket: LocalExecutionTicketV2): GarmentMeshWarpManagedBindings {
  const managed = ticket.managedInputs;
  if (!managed || managed.length !== 2) throw contractError('local_ticket_managed_input_mismatch', 'Garment mesh warp requires exactly two managed Garment inputs');
  const view = managed[0]; const representation = managed[1];
  if (view.kind !== 'GARMENT_VIEW' || representation.kind !== 'GARMENT_REPRESENTATION' || representation.tier !== 'PARAMETRIC' || representation.format !== 'BERS_PARAMETRIC_V1') {
    throw contractError('local_ticket_managed_input_mismatch', 'Garment mesh-warp managed input order or representation tier is invalid');
  }
  return Object.freeze({ view, representation });
}

export function garmentMeshWarpOutputContract(ticket: LocalExecutionTicketV2) {
  const output = ticket.expectedOutputs[0];
  if (
    ticket.expectedOutputs.length !== 1
    || output.kind !== 'image'
    || output.role !== 'WORKING'
    || output.count !== 1
    || output.mimeTypes?.length !== 1
    || output.mimeTypes[0] !== 'image/png'
    || !Number.isSafeInteger(output.width)
    || !Number.isSafeInteger(output.height)
    || Number(output.width) < 1
    || Number(output.height) < 1
  ) throw contractError('local_output_contract_error', 'Garment mesh-warp output must be one bounded PNG WORKING image');
  return output;
}

export function assertManagedBindingsMatchParameters(bindings: GarmentMeshWarpManagedBindings, p: GarmentMeshWarpTicketParameters): void {
  if (
    bindings.view.garmentId !== p.garmentId
    || bindings.view.viewId !== p.viewId
    || bindings.view.contentSha256 !== p.viewSha256
    || bindings.representation.garmentId !== p.garmentId
    || bindings.representation.representationId !== p.representationId
    || bindings.representation.contentSha256 !== p.representationSha256
    || bindings.representation.basisViewId !== p.viewId
  ) throw contractError('local_ticket_managed_input_mismatch', 'Managed Garment bindings do not match garment mesh-warp ticket parameters');
}

export function garmentMeshWarpExecutionId(scope: AuthenticatedScope & { projectId: string }, clientRequestId: string): string {
  if (!CLIENT_REQUEST.test(clientRequestId)) throw contractError('invalid_garment_mesh_warp_request', 'clientRequestId must contain 1 to 200 safe identifier characters');
  return `garment-mesh-warp:${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex')}`;
}

export function garmentMeshWarpTicketIdempotencyKey(clientRequestId: string): string {
  if (!CLIENT_REQUEST.test(clientRequestId)) throw contractError('invalid_garment_mesh_warp_request', 'clientRequestId must contain 1 to 200 safe identifier characters');
  return `${clientRequestId}${GARMENT_MESH_WARP_IDEMPOTENCY_SUFFIX}`;
}

export function sameGarmentMeshWarpTicket(left: LocalExecutionTicketV2, right: LocalExecutionTicketV2): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function garmentMeshWarpContractError(code: string, message: string, status = 409): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}

function contractError(code: string, message: string): Error & { code: string; status: number } { return garmentMeshWarpContractError(code, message); }
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a],[b]) => a.localeCompare(b)).map(([key, child]) => [key, canonicalValue(child)]));
}
