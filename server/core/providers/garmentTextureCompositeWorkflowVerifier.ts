import type {
  CreativeArtifact,
  LocalExecutionResultV2,
  LocalExecutionTicketV2,
  VerificationResult,
} from '../../../src/platform/creative/canonical/index.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_TOOL_ID,
  GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js';
import {
  assertGarmentTextureCompositeTicket,
  garmentTextureCompositeOutputContract,
  garmentTextureCompositeParametersFromTicket,
} from '../localExecution/GarmentTextureCompositeExecutionContract.ts';

const SHA = /^[0-9a-f]{64}$/;

/**
 * Final canonical verifier for the F4b.5b deterministic texture-composite path.
 *
 * Pixel equality is established by Core before this function is called. This
 * verifier closes the workflow-facing artifact identity: exact ticket/result,
 * Project parentage, Fashion evidence, producer-parameter hash, dimensions and
 * the byte-exact admission metadata must all agree. It grants no route, ticket,
 * persistence, provider or Billing authority.
 */
export function verifyGarmentTextureCompositeFinalArtifact(
  ticket: LocalExecutionTicketV2,
  result: LocalExecutionResultV2,
  artifact: CreativeArtifact,
): VerificationResult {
  const errors: string[] = [];
  try { assertGarmentTextureCompositeTicket(ticket); }
  catch { errors.push('TICKET_CONTRACT_INVALID'); }
  if (errors.length) return failed(errors);

  const output = garmentTextureCompositeOutputContract(ticket);
  const parameters = garmentTextureCompositeParametersFromTicket(ticket);
  if (
    result.ticketId !== ticket.ticketId
    || result.ticketVersion !== ticket.version
    || result.requestId !== ticket.requestId
    || result.workflowId !== ticket.workflowId
    || result.stepId !== ticket.stepId
    || result.nonce !== ticket.nonce
    || result.executor.kind !== 'DETERMINISTIC_TOOL'
    || result.executor.toolId !== GARMENT_TEXTURE_COMPOSITE_TOOL_ID
    || result.executor.version !== GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION
    || result.runtime !== 'BROWSER_JS'
    || result.accelerator !== 'cpu'
  ) errors.push('RESULT_TICKET_BINDING_INVALID');

  if (
    artifact.kind !== 'image'
    || artifact.role !== 'COMPOSITE'
    || artifact.state !== 'FINAL'
    || artifact.producerOperationId !== ticket.stepId
    || artifact.scope.tenantId !== ticket.scope.tenantId
    || artifact.scope.userId !== ticket.scope.userId
    || artifact.scope.projectId !== ticket.scope.projectId
  ) errors.push('FINAL_ARTIFACT_CONTRACT_INVALID');

  const image = artifact.value as Readonly<{ width?: unknown; height?: unknown; data?: unknown; format?: unknown; orientation?: unknown; colorSpace?: unknown }>;
  if (
    image?.width !== output.width
    || image?.height !== output.height
    || !(image?.data instanceof Uint8ClampedArray)
    || image.data.byteLength !== Number(output.width) * Number(output.height) * 4
    || image.format !== 'RGBA8'
    || image.orientation !== 1
    || image.colorSpace !== 'srgb'
  ) errors.push('FINAL_PIXEL_CONTRACT_INVALID');

  const metadata = artifact.metadata as Record<string, unknown> | undefined;
  const integrity = metadata?.integrityMetrics as Record<string, unknown> | undefined;
  const parents = metadata?.parentArtifactIds;
  if (
    metadata?.artifactRole !== 'COMPOSITE'
    || metadata?.localExecutionAdmission !== 'ADMITTED'
    || metadata?.admissionClass !== 'DETERMINISTIC_BYTE_EXACT'
    || metadata?.verificationScope !== 'BYTE_EXACT_CORE_RECOMPUTE'
    || metadata?.ticketId !== ticket.ticketId
    || metadata?.toolId !== GARMENT_TEXTURE_COMPOSITE_TOOL_ID
    || metadata?.toolVersion !== GARMENT_TEXTURE_COMPOSITE_TOOL_VERSION
    || metadata?.runtime !== 'BROWSER_JS'
    || metadata?.accelerator !== 'cpu'
    || metadata?.sourceImageStorageId !== parameters.projectImageStorageId
    || metadata?.sourceImageSha256 !== parameters.projectImageSha256
    || metadata?.garmentWarpLayerId !== parameters.garmentWarpLayerId
    || metadata?.garmentWarpLayerSha256 !== parameters.garmentWarpLayerSha256
    || metadata?.producerParametersSha256 !== parameters.producerParametersSha256
    || metadata?.destinationMeshSha256 !== parameters.destinationMeshSha256
    || typeof metadata?.candidateSha256 !== 'string'
    || !SHA.test(metadata.candidateSha256)
    || typeof metadata?.verifiedPixelSha256 !== 'string'
    || !SHA.test(metadata.verifiedPixelSha256)
    || integrity?.verificationOutcome !== 'PASS'
    || integrity?.pixelComparison !== 'BYTE_EXACT'
    || !Array.isArray(parents)
    || parents.length !== 1
    || parents[0] !== ticket.inputs[0].artifactId
  ) errors.push('FINAL_LINEAGE_METADATA_INVALID');

  return errors.length ? failed(errors) : Object.freeze({
    valid: true,
    checks: Object.freeze([
      'GARMENT_TEXTURE_TICKET_EXACT',
      'GARMENT_TEXTURE_RESULT_EXACT',
      'GARMENT_TEXTURE_PROJECT_PARENT_EXACT',
      'GARMENT_TEXTURE_FASHION_EVIDENCE_EXACT',
      'GARMENT_TEXTURE_PIXEL_CONTRACT_EXACT',
      'GARMENT_TEXTURE_BYTE_EXACT_CORE_RECOMPUTE',
    ]),
    errors: Object.freeze([]),
  });
}

function failed(errors: readonly string[]): VerificationResult {
  return Object.freeze({ valid: false, checks: Object.freeze([]), errors: Object.freeze([...errors]) });
}
