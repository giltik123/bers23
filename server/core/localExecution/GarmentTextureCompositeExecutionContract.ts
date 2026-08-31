import { createHash } from 'node:crypto';
import type {
  LocalExecutionManagedGarmentParametricRepresentationInputBinding,
  LocalExecutionManagedGarmentViewInputBinding,
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
import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import {
  normalizeGarmentTextureFinalLineageParameters,
  type GarmentTextureCompositeProducerParametersV1,
} from '../fashion/garmentTextureFinalLineage.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;
const CLIENT_REQUEST = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
export const GARMENT_TEXTURE_COMPOSITE_IDEMPOTENCY_SUFFIX = `:${GARMENT_TEXTURE_COMPOSITE_STEP_ID}:local-v2`;

export type GarmentTextureCompositeTicketParameters = Readonly<{
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
  producerParameters: GarmentTextureCompositeProducerParametersV1;
  producerParametersSha256: string;
  deterministicTool: string;
  maxDimension: number;
  maxOutputPixels: number;
}>;

export type GarmentTextureCompositeManagedBindings = Readonly<{
  view: LocalExecutionManagedGarmentViewInputBinding;
  representation: LocalExecutionManagedGarmentParametricRepresentationInputBinding;
}>;

export function assertGarmentTextureCompositeTicket(ticket: LocalExecutionTicketV2): void {
  if (
    ticket.version !== '2'
    || ticket.issuer !== 'CORE'
    || ticket.operation.capability !== GARMENT_TEXTURE_COMPOSITE_CAPABILITY
    || ticket.operation.type !== GARMENT_TEXTURE_COMPOSITE_OPERATION
    || ticket.operation.id !== GARMENT_TEXTURE_COMPOSITE_STEP_ID
    || ticket.stepId !== GARMENT_TEXTURE_COMPOSITE_STEP_ID
    || ticket.policy !== 'LOCAL_ONLY'
  ) throw contractError('local_ticket_capability_mismatch', 'Ticket is not the exact deterministic garment texture-composite contract');
  if (ticket.cost.paidCloudCredits !== 0 || ticket.cost.providerCalls !== 0) {
    throw contractError('local_ticket_cost_mismatch', 'Garment texture-composite ticket must remain zero-cloud');
  }
  if (ticket.allowedExecutors.length !== 1) throw contractError('local_ticket_executor_mismatch', 'Garment texture composite must bind exactly one deterministic executor');
  const executor = ticket.allowedExecutors[0];
  if (executor.kind !== 'DETERMINISTIC_TOOL' || executor.toolId !== GARMENT_TEXTURE_COMPOSITE_TOOL_ID || executor.version !== GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION) {
    throw contractError('local_ticket_executor_mismatch', 'Garment texture-composite executor binding is invalid');
  }
  if (
    ticket.inputs.length !== 1
    || ticket.inputs[0].kind !== 'image'
    || !['ORIGINAL', 'COMPOSITE'].includes(String(ticket.inputs[0].role))
    || typeof ticket.inputs[0].sha256 !== 'string'
    || !SHA.test(ticket.inputs[0].sha256)
  ) throw contractError('local_ticket_input_contract_mismatch', 'Garment texture composite requires exactly one SHA-bound Project IMAGE input');

  const p = garmentTextureCompositeParametersFromTicket(ticket);
  const managed = garmentTextureCompositeManagedBindings(ticket);
  assertManagedBindingsMatchParameters(managed, p);
  const source = ticket.inputs[0];
  if (source.artifactId !== p.sourceArtifactId || source.sha256 !== p.projectImageSha256) {
    throw contractError('local_ticket_input_contract_mismatch', 'Project IMAGE input does not match texture-composite parameters');
  }
  if (p.deterministicTool !== `${GARMENT_TEXTURE_COMPOSITE_TOOL_ID}@${GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION}`) {
    throw contractError('local_ticket_parameter_mismatch', 'Garment texture-composite deterministic tool identity is invalid');
  }
  if (p.maxDimension !== GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION || p.maxOutputPixels !== GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS) {
    throw contractError('local_ticket_parameter_mismatch', 'Garment texture-composite resource-policy identity is invalid');
  }
  const normalized = normalizeGarmentTextureFinalLineageParameters(p.producerParameters);
  if (normalized.sha256 !== p.producerParametersSha256) {
    throw contractError('local_ticket_parameter_mismatch', 'Garment texture-composite producer-parameter SHA-256 is invalid');
  }
  garmentTextureCompositeOutputContract(ticket);
}

export function garmentTextureCompositeParametersFromTicket(ticket: LocalExecutionTicketV2): GarmentTextureCompositeTicketParameters {
  const value = ticket.operation.parameters;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw contractError('local_ticket_parameter_mismatch', 'Garment texture-composite ticket parameters are missing');
  const p = value as Record<string, unknown>;
  const requiredKeys = [
    'anchorPayloadSha256','anchorSetId','destinationMeshSha256','deterministicTool','garmentId','garmentWarpLayerId','garmentWarpLayerSha256','maxDimension','maxOutputPixels','producerParameters','producerParametersSha256','projectImageSha256','projectImageStorageId','representationId','representationSha256','sourceArtifactId','viewId','viewSha256',
  ];
  if (Object.keys(p).sort().join('|') !== requiredKeys.join('|')) {
    throw contractError('local_ticket_parameter_mismatch', 'Garment texture-composite ticket parameter schema is open or incomplete');
  }
  for (const key of ['projectImageStorageId','garmentWarpLayerId','garmentId','viewId','representationId','anchorSetId'] as const) {
    if (typeof p[key] !== 'string' || !UUID.test(p[key] as string)) throw contractError('local_ticket_parameter_mismatch', `Garment texture-composite ${key} is invalid`);
  }
  for (const key of ['projectImageSha256','garmentWarpLayerSha256','viewSha256','representationSha256','anchorPayloadSha256','destinationMeshSha256','producerParametersSha256'] as const) {
    if (typeof p[key] !== 'string' || !SHA.test(p[key] as string)) throw contractError('local_ticket_parameter_mismatch', `Garment texture-composite ${key} is invalid`);
  }
  if (typeof p.sourceArtifactId !== 'string' || !p.sourceArtifactId.trim() || [...p.sourceArtifactId].length > 512 || /[\u0000-\u001f\u007f]/u.test(p.sourceArtifactId)) {
    throw contractError('local_ticket_parameter_mismatch', 'Garment texture-composite sourceArtifactId is invalid');
  }
  if (typeof p.deterministicTool !== 'string') throw contractError('local_ticket_parameter_mismatch', 'Garment texture-composite deterministicTool is invalid');
  for (const key of ['maxDimension','maxOutputPixels'] as const) {
    if (!Number.isSafeInteger(p[key]) || Number(p[key]) < 1) throw contractError('local_ticket_parameter_mismatch', `Garment texture-composite ${key} is invalid`);
  }
  try {
    normalizeGarmentTextureFinalLineageParameters(p.producerParameters);
  } catch (error) {
    throw contractError('local_ticket_parameter_mismatch', error instanceof Error ? error.message : 'Garment texture-composite producer parameters are invalid');
  }
  return Object.freeze(p as unknown as GarmentTextureCompositeTicketParameters);
}

export function garmentTextureCompositeManagedBindings(ticket: LocalExecutionTicketV2): GarmentTextureCompositeManagedBindings {
  const managed = ticket.managedInputs;
  if (!managed || managed.length !== 2) throw contractError('local_ticket_managed_input_mismatch', 'Garment texture composite requires exactly two managed Garment inputs');
  const view = managed[0];
  const representation = managed[1];
  if (view.kind !== 'GARMENT_VIEW' || representation.kind !== 'GARMENT_REPRESENTATION' || representation.tier !== 'PARAMETRIC' || representation.format !== 'BERS_PARAMETRIC_V1') {
    throw contractError('local_ticket_managed_input_mismatch', 'Garment texture-composite managed input order or representation tier is invalid');
  }
  return Object.freeze({ view, representation });
}

export function assertManagedBindingsMatchParameters(bindings: GarmentTextureCompositeManagedBindings, p: GarmentTextureCompositeTicketParameters): void {
  if (
    bindings.view.garmentId !== p.garmentId
    || bindings.view.viewId !== p.viewId
    || bindings.view.contentSha256 !== p.viewSha256
    || bindings.representation.garmentId !== p.garmentId
    || bindings.representation.representationId !== p.representationId
    || bindings.representation.contentSha256 !== p.representationSha256
    || bindings.representation.basisViewId !== p.viewId
  ) throw contractError('local_ticket_managed_input_mismatch', 'Managed Garment bindings do not match texture-composite ticket parameters');
}

export function garmentTextureCompositeOutputContract(ticket: LocalExecutionTicketV2) {
  const output = ticket.expectedOutputs[0];
  if (
    ticket.expectedOutputs.length !== 1
    || output.kind !== 'image'
    || output.role !== 'COMPOSITE'
    || output.count !== 1
    || output.mimeTypes?.length !== 1
    || output.mimeTypes[0] !== 'image/png'
    || !Number.isSafeInteger(output.width)
    || !Number.isSafeInteger(output.height)
    || Number(output.width) < 1
    || Number(output.height) < 1
    || Number(output.width) > GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION
    || Number(output.height) > GARMENT_TEXTURE_COMPOSITE_MAX_DIMENSION
    || Number(output.width) * Number(output.height) > GARMENT_TEXTURE_COMPOSITE_MAX_PIXELS
  ) throw contractError('local_output_contract_error', 'Garment texture composite output must be one bounded PNG COMPOSITE image');
  return output;
}

export function garmentTextureCompositeExecutionId(scope: AuthenticatedScope & { projectId: string }, clientRequestId: string): string {
  if (!CLIENT_REQUEST.test(clientRequestId)) throw contractError('invalid_garment_texture_composite_request', 'clientRequestId must contain 1 to 200 safe identifier characters');
  return `garment-texture-composite:${createHash('sha256').update(`${scope.tenantId}\0${scope.userId}\0${scope.projectId}\0${clientRequestId}`).digest('hex')}`;
}

export function garmentTextureCompositeTicketIdempotencyKey(clientRequestId: string): string {
  if (!CLIENT_REQUEST.test(clientRequestId)) throw contractError('invalid_garment_texture_composite_request', 'clientRequestId must contain 1 to 200 safe identifier characters');
  return `${clientRequestId}${GARMENT_TEXTURE_COMPOSITE_IDEMPOTENCY_SUFFIX}`;
}

export function sameGarmentTextureCompositeTicket(left: LocalExecutionTicketV2, right: LocalExecutionTicketV2): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

export function garmentTextureCompositeContractError(code: string, message: string, status = 409): Error & { code: string; status: number } {
  return Object.assign(new Error(message), { code, status });
}

function contractError(code: string, message: string): Error & { code: string; status: number } {
  return garmentTextureCompositeContractError(code, message);
}
function canonicalJson(value: unknown): string { return JSON.stringify(canonicalValue(value)); }
function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalValue(child)]));
}
