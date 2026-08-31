import type { Artifact, WorkflowOperation, VerificationResult } from '../../../src/platform/creative/workflow-engine/types.ts';
import {
  GARMENT_MESH_WARP_OPERATION,
  GARMENT_MESH_WARP_TOOL_ID,
  GARMENT_MESH_WARP_TOOL_VERSION,
} from '../../../src/platform/creative/deterministic/GarmentMeshWarp.ts';
import { GARMENT_MESH_WARP_TOOL_DEFINITION } from '../../../src/platform/creative/deterministic/DeterministicToolRegistry.ts';

const SHA = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const EXACT = GARMENT_MESH_WARP_TOOL_DEFINITION.parameters.exact;
const REQUIRED_EVIDENCE_KEYS = Object.freeze([
  'sourceArtifactId','garmentId','viewId','representationId','anchorSetId',
  'projectImageStorageId','projectImageSha256','viewSha256','representationSha256','anchorPayloadSha256','destinationMeshSha256',
] as const);
const EXACT_SEMANTIC_KEYS = Object.freeze([
  'deterministicTool','meshSchema','sourceCoordinateSpace','destinationCoordinateSpace','fixedPointBits',
  'rasterization','interpolation','rounding','alphaPolicy','uncoveredPixels','maxOutputPixels','maxRasterWork',
] as const);

/**
 * F4b.4 verifier for the server-recomputed garment layer only.
 * It grants no route, target, executor, persistence, Billing or Project-FINAL authority.
 */
export function verifyGarmentMeshWarpWorkingArtifact(operation: WorkflowOperation, artifacts: readonly Artifact[]): VerificationResult {
  if (operation.type !== GARMENT_MESH_WARP_OPERATION) return invalid(operation.id, 'GARMENT_MESH_WARP_OPERATION_REQUIRED');
  if (operation.executionRoute !== 'ON_DEVICE' || operation.providerId) return invalid(operation.id, 'GARMENT_MESH_WARP_ROUTE_INVALID');
  if (artifacts.length !== 1 || artifacts[0].kind !== 'image') return invalid(operation.id, 'GARMENT_MESH_WARP_OUTPUT_INVALID');
  const artifact = artifacts[0];
  if (!isPixelImage(artifact.value)) return invalid(operation.id, 'GARMENT_MESH_WARP_PIXELS_INVALID');
  const metadata = record(artifact.metadata);
  const input = record(operation.input);
  if (!metadata || !input) return invalid(operation.id, 'GARMENT_MESH_WARP_SEMANTICS_INVALID');

  if (
    metadata.artifactRole !== 'WORKING'
    || metadata.localExecutionAdmission !== 'ADMITTED'
    || metadata.admissionClass !== 'DETERMINISTIC_BYTE_EXACT'
    || metadata.verificationScope !== 'BYTE_EXACT_CORE_RECOMPUTE'
    || metadata.persistenceAuthority !== 'FASHION_INTERMEDIATE_ONLY'
    || metadata.executorKind !== 'DETERMINISTIC_TOOL'
    || metadata.toolId !== GARMENT_MESH_WARP_TOOL_ID
    || metadata.toolVersion !== GARMENT_MESH_WARP_TOOL_VERSION
    || metadata.runtime !== 'BROWSER_JS'
    || metadata.accelerator !== 'cpu'
    || !SHA.test(String(metadata.candidateSha256 ?? ''))
    || !SHA.test(String(metadata.verifiedPixelSha256 ?? ''))
  ) return invalid(operation.id, 'GARMENT_MESH_WARP_SEMANTICS_INVALID');

  for (const key of EXACT_SEMANTIC_KEYS) {
    if (input[key] !== EXACT[key] || metadata[key] !== EXACT[key]) return invalid(operation.id, 'GARMENT_MESH_WARP_TOOL_CONTRACT_INVALID');
  }
  if (Object.keys(input).sort().join('\n') !== [...REQUIRED_EVIDENCE_KEYS, ...EXACT_SEMANTIC_KEYS].sort().join('\n')) {
    return invalid(operation.id, 'GARMENT_MESH_WARP_OPERATION_SCHEMA_INVALID');
  }

  for (const key of ['garmentId','viewId','representationId','anchorSetId','projectImageStorageId'] as const) {
    if (!UUID.test(String(input[key] ?? '')) || metadata[key] !== input[key]) return invalid(operation.id, 'GARMENT_MESH_WARP_EVIDENCE_INVALID');
  }
  for (const key of ['projectImageSha256','viewSha256','representationSha256','anchorPayloadSha256','destinationMeshSha256'] as const) {
    if (!SHA.test(String(input[key] ?? '')) || metadata[key] !== input[key]) return invalid(operation.id, 'GARMENT_MESH_WARP_EVIDENCE_INVALID');
  }
  if (typeof input.sourceArtifactId !== 'string' || !input.sourceArtifactId || metadata.parentArtifactIds === undefined) return invalid(operation.id, 'GARMENT_MESH_WARP_LINEAGE_INVALID');
  const parents = Array.isArray(metadata.parentArtifactIds) ? metadata.parentArtifactIds : [];
  if (!parents.includes(input.sourceArtifactId) || !(operation.requiredArtifacts ?? []).every(id => parents.includes(id))) return invalid(operation.id, 'GARMENT_MESH_WARP_LINEAGE_INVALID');

  const width = artifact.value.width; const height = artifact.value.height;
  if (metadata.outputWidth !== width || metadata.outputHeight !== height) return invalid(operation.id, 'GARMENT_MESH_WARP_GEOMETRY_INVALID');
  const basisWidth = positiveInteger(metadata.basisViewWidth); const basisHeight = positiveInteger(metadata.basisViewHeight);
  if (basisWidth === undefined || basisHeight === undefined) return invalid(operation.id, 'GARMENT_MESH_WARP_GEOMETRY_INVALID');
  const integrity = record(metadata.integrityMetrics);
  if (!integrity || integrity.verificationOutcome !== 'PASS' || integrity.pixelComparison !== 'BYTE_EXACT') return invalid(operation.id, 'GARMENT_MESH_WARP_INTEGRITY_INVALID');

  return freeze({
    stepId: operation.id,
    valid: true,
    checks: Object.freeze([
      'GARMENT_MESH_WARP_WORKING_OUTPUT',
      'GARMENT_MESH_WARP_DETERMINISTIC_CONTRACT',
      'GARMENT_MESH_WARP_BYTE_EXACT_CORE_RECOMPUTE',
      'GARMENT_MESH_WARP_PROJECT_LINEAGE',
      'GARMENT_MESH_WARP_FASHION_INTERMEDIATE_ONLY',
    ]),
    errors: Object.freeze([]),
  });
}

function isPixelImage(value: unknown): value is Readonly<{ width: number; height: number; data: Uint8Array | Uint8ClampedArray }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const image = value as Readonly<Record<string, unknown>>;
  const width = positiveInteger(image.width); const height = positiveInteger(image.height);
  if (width === undefined || height === undefined) return false;
  const data = image.data;
  return (data instanceof Uint8Array || data instanceof Uint8ClampedArray) && data.byteLength === width * height * 4;
}
function record(value: unknown): Readonly<Record<string, unknown>> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
function positiveInteger(value: unknown): number | undefined { return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : undefined; }
function invalid(stepId: string, error: string): VerificationResult { return freeze({ stepId, valid: false, checks: Object.freeze([]), errors: Object.freeze([error]) }); }
function freeze<T>(value: T): T { if (value && typeof value === 'object') Object.freeze(value); return value; }
