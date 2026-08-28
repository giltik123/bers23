import type { Artifact, WorkflowOperation, WorkflowVerifierPort, VerificationResult } from '../../../src/platform/creative/workflow-engine/types.ts';
import { CROP_TOOL_ID, CROP_TOOL_VERSION } from '../../../src/platform/creative/deterministic/Crop.ts';
import { SUPER_RESOLUTION_ALPHA_POLICY, SUPER_RESOLUTION_SCALE } from '../../../src/platform/creative/super-resolution/SuperResolutionContract.ts';

export const PRODUCTION_WORKFLOW_VERIFICATION_VERSION = '6.42C3.1';

const CHECKS = Object.freeze({
  supported: 'PRODUCTION_OPERATION_SUPPORTED',
  imageKind: 'OUTPUT_KIND_IMAGE',
  providerReference: 'PROVIDER_IMAGE_REFERENCE_VALID',
  maskKind: 'OUTPUT_KIND_MASK',
  maskPixels: 'MASK_PIXELS_VALID',
  maskLineage: 'MASK_LINEAGE_VALID',
  deterministicPixels: 'DETERMINISTIC_PIXELS_VERIFIED',
  deterministicContract: 'DETERMINISTIC_TOOL_CONTRACT_VALID',
  deterministicGeometry: 'DETERMINISTIC_OUTPUT_GEOMETRY_VALID',
  localLineage: 'LOCAL_IMAGE_LINEAGE_VALID',
  modelContract: 'LOCAL_MODEL_CONTRACT_ADMITTED',
  modelScope: 'LOCAL_MODEL_VERIFICATION_SCOPE_VALID',
  modelGeometry: 'LOCAL_MODEL_OUTPUT_GEOMETRY_VALID',
} as const);

const ERRORS = Object.freeze({
  controlledOwned: 'CONTROLLED_INTEGRITY_VERIFICATION_REQUIRED',
  unsupported: 'UNSUPPORTED_OPERATION_VERIFICATION',
  outputRequired: 'OUTPUT_REQUIRED',
  wrongKind: 'OUTPUT_KIND_INVALID',
  malformedReference: 'PROVIDER_IMAGE_REFERENCE_INVALID',
  invalidMask: 'LOCAL_MASK_INVALID',
  invalidMaskLineage: 'LOCAL_MASK_LINEAGE_INVALID',
  invalidLocalImage: 'LOCAL_IMAGE_INVALID',
  invalidLocalImageLineage: 'LOCAL_IMAGE_LINEAGE_INVALID',
  invalidDeterministicSemantics: 'DETERMINISTIC_TOOL_VERIFICATION_SEMANTICS_INVALID',
  invalidDeterministicGeometry: 'DETERMINISTIC_OUTPUT_GEOMETRY_INVALID',
  invalidModelImage: 'LOCAL_MODEL_IMAGE_INVALID',
  invalidModelSemantics: 'LOCAL_MODEL_VERIFICATION_SEMANTICS_INVALID',
  invalidModelGeometry: 'LOCAL_MODEL_OUTPUT_GEOMETRY_INVALID',
} as const);

/**
 * Server-owned runtime verification policy for currently accepted production contracts.
 * Planner/client verification claims are intentionally ignored. This component performs no
 * provider call, network access, persistence, access-control or financial mutation.
 *
 * Deterministic outputs can carry byte-exact verification only when the admitted artifact
 * proves the exact reviewed deterministic contract. Model output cannot: without re-running
 * the model on a trusted server, Core proves only admitted executor identity, output
 * contract/geometry and canonical lineage. Metadata is required to state that weaker scope
 * explicitly so a model result cannot masquerade as deterministic proof.
 */
export class ProductionWorkflowVerifier implements WorkflowVerifierPort {
  async verify(operation: WorkflowOperation, artifacts: readonly Artifact[]): Promise<VerificationResult> {
    if (operation.type === 'verify') {
      if (operation.executionRoute !== 'INTERNAL' || operation.providerId || operation.requiredArtifacts?.length !== 1 || operation.outputBindings?.length !== 1 || operation.outputBindings[0].kind !== 'image') return invalid(operation.id, 'INTERNAL_VERIFY_CONTRACT_INVALID');
      if (artifacts.length !== 1) return invalid(operation.id, 'VERIFY_INPUT_REQUIRED');
      if (artifacts[0].kind !== 'image') return invalid(operation.id, ERRORS.wrongKind);
      if (!isImageReference(artifacts[0].value)) return invalid(operation.id, ERRORS.malformedReference);
      return freezeResult({ stepId: operation.id, valid: true, checks: [CHECKS.supported, CHECKS.imageKind, CHECKS.providerReference], errors: [] });
    }
    if (operation.type === 'segment') {
      if (operation.executionRoute !== 'ON_DEVICE' || operation.providerId) return invalid(operation.id, ERRORS.invalidMaskLineage);
      if (artifacts.length !== 1 || artifacts[0].kind !== 'mask') return invalid(operation.id, ERRORS.wrongKind, [CHECKS.supported]);
      if (!isCanonicalLocalMask(artifacts[0])) return invalid(operation.id, ERRORS.invalidMask, [CHECKS.supported, CHECKS.maskKind]);
      const parents = artifacts[0].metadata?.parentArtifactIds;
      if (!Array.isArray(parents) || !(operation.requiredArtifacts ?? []).every(id => parents.includes(id))) return invalid(operation.id, ERRORS.invalidMaskLineage, [CHECKS.supported, CHECKS.maskKind, CHECKS.maskPixels]);
      return freezeResult({ stepId: operation.id, valid: true, checks: [CHECKS.supported, CHECKS.maskKind, CHECKS.maskPixels, CHECKS.maskLineage], errors: [] });
    }
    if (operation.type === 'BACKGROUND_ISOLATION') {
      if (operation.executionRoute !== 'ON_DEVICE' || operation.providerId) return invalid(operation.id, ERRORS.invalidLocalImageLineage);
      if (artifacts.length !== 1 || artifacts[0].kind !== 'image') return invalid(operation.id, ERRORS.wrongKind, [CHECKS.supported]);
      if (!isCanonicalDeterministicImage(artifacts[0])) return invalid(operation.id, ERRORS.invalidLocalImage, [CHECKS.supported, CHECKS.imageKind]);
      const parents = artifacts[0].metadata?.parentArtifactIds;
      if (!Array.isArray(parents) || !(operation.requiredArtifacts ?? []).every(id => parents.includes(id))) return invalid(operation.id, ERRORS.invalidLocalImageLineage, [CHECKS.supported, CHECKS.imageKind, CHECKS.deterministicPixels]);
      return freezeResult({ stepId: operation.id, valid: true, checks: [CHECKS.supported, CHECKS.imageKind, CHECKS.deterministicPixels, CHECKS.localLineage], errors: [] });
    }
    if (operation.type === 'CROP') {
      if (operation.executionRoute !== 'ON_DEVICE' || operation.providerId) return invalid(operation.id, ERRORS.invalidDeterministicSemantics);
      if (artifacts.length !== 1 || artifacts[0].kind !== 'image') return invalid(operation.id, ERRORS.wrongKind, [CHECKS.supported]);
      if (!isCanonicalCropImage(operation, artifacts[0])) return invalid(operation.id, ERRORS.invalidDeterministicSemantics, [CHECKS.supported, CHECKS.imageKind]);
      const parents = artifacts[0].metadata?.parentArtifactIds;
      if (!Array.isArray(parents) || !(operation.requiredArtifacts ?? []).every(id => parents.includes(id))) return invalid(operation.id, ERRORS.invalidLocalImageLineage, [CHECKS.supported, CHECKS.imageKind, CHECKS.deterministicContract, CHECKS.deterministicPixels]);
      if (!hasValidCropGeometry(operation, artifacts[0])) return invalid(operation.id, ERRORS.invalidDeterministicGeometry, [CHECKS.supported, CHECKS.imageKind, CHECKS.deterministicContract, CHECKS.deterministicPixels, CHECKS.localLineage]);
      return freezeResult({ stepId: operation.id, valid: true, checks: [CHECKS.supported, CHECKS.imageKind, CHECKS.deterministicContract, CHECKS.deterministicPixels, CHECKS.localLineage, CHECKS.deterministicGeometry], errors: [] });
    }
    if (operation.type === 'SUPER_RESOLUTION') {
      if (operation.executionRoute !== 'ON_DEVICE' || operation.providerId) return invalid(operation.id, ERRORS.invalidModelSemantics);
      if (artifacts.length !== 1 || artifacts[0].kind !== 'image') return invalid(operation.id, ERRORS.wrongKind, [CHECKS.supported]);
      if (!isCanonicalModelAdmittedImage(artifacts[0])) return invalid(operation.id, ERRORS.invalidModelImage, [CHECKS.supported, CHECKS.imageKind]);
      const parents = artifacts[0].metadata?.parentArtifactIds;
      if (!Array.isArray(parents) || !(operation.requiredArtifacts ?? []).every(id => parents.includes(id))) return invalid(operation.id, ERRORS.invalidLocalImageLineage, [CHECKS.supported, CHECKS.imageKind, CHECKS.modelContract, CHECKS.modelScope]);
      if (!hasValidSuperResolutionGeometry(artifacts[0])) return invalid(operation.id, ERRORS.invalidModelGeometry, [CHECKS.supported, CHECKS.imageKind, CHECKS.modelContract, CHECKS.modelScope, CHECKS.localLineage]);
      return freezeResult({ stepId: operation.id, valid: true, checks: [CHECKS.supported, CHECKS.imageKind, CHECKS.modelContract, CHECKS.modelScope, CHECKS.localLineage, CHECKS.modelGeometry], errors: [] });
    }
    if (operation.type === 'CONTROLLED_LOCAL_EDIT') return invalid(operation.id, ERRORS.controlledOwned);
    if (operation.type !== 'image-edit') return invalid(operation.id, ERRORS.unsupported);
    if (artifacts.length === 0) return invalid(operation.id, ERRORS.outputRequired, [CHECKS.supported]);
    if (artifacts.some(artifact => artifact.kind !== 'image')) return invalid(operation.id, ERRORS.wrongKind, [CHECKS.supported]);
    if (artifacts.some(artifact => !isProviderImageReference(artifact.value))) return invalid(operation.id, ERRORS.malformedReference, [CHECKS.supported, CHECKS.imageKind]);
    return freezeResult({ stepId: operation.id, valid: true, checks: [CHECKS.supported, CHECKS.imageKind, CHECKS.providerReference], errors: [] });
  }
}

export const productionWorkflowVerifier: WorkflowVerifierPort = Object.freeze(new ProductionWorkflowVerifier());

function isCanonicalLocalMask(artifact: Artifact): boolean {
  if (!artifact.value || typeof artifact.value !== 'object' || Array.isArray(artifact.value)) return false;
  const value = artifact.value as Readonly<Record<string, unknown>>;
  const width = value.width; const height = value.height; const alpha = value.alpha;
  if (!Number.isInteger(width) || !Number.isInteger(height) || Number(width) < 1 || Number(height) < 1 || !(alpha instanceof Uint8Array) || alpha.length !== Number(width) * Number(height)) return false;
  if (value.coordinateSpace !== 'ORIGINAL') return false;
  return artifact.metadata?.artifactRole === 'MASK' && artifact.metadata?.localExecutionAdmission === 'ADMITTED';
}

function isCanonicalDeterministicImage(artifact: Artifact): boolean {
  if (!isPixelImage(artifact.value)) return false;
  const integrity = artifact.metadata?.integrityMetrics as Readonly<Record<string, unknown>> | undefined;
  return artifact.metadata?.artifactRole === 'COMPOSITE' && artifact.metadata?.localExecutionAdmission === 'ADMITTED' && integrity?.verificationOutcome === 'PASS';
}

function isCanonicalCropImage(operation: WorkflowOperation, artifact: Artifact): boolean {
  if (!isPixelImage(artifact.value)) return false;
  const metadata = artifact.metadata as Readonly<Record<string, unknown>> | undefined;
  if (!metadata || metadata.artifactRole !== 'COMPOSITE' || metadata.localExecutionAdmission !== 'ADMITTED') return false;
  if (metadata.admissionClass !== 'DETERMINISTIC_BYTE_EXACT' || metadata.verificationScope !== 'BYTE_EXACT_CORE_RECOMPUTE') return false;
  if (metadata.executorKind !== 'DETERMINISTIC_TOOL' || metadata.toolId !== CROP_TOOL_ID || metadata.toolVersion !== CROP_TOOL_VERSION) return false;
  if (metadata.runtime !== 'BROWSER_JS' || metadata.accelerator !== 'cpu') return false;
  if (!sha256(metadata.candidateSha256) || !sha256(metadata.verifiedPixelSha256)) return false;
  if (metadata.coordinateSpace !== 'CANONICAL_ORIENTATION_1_PIXEL_INDICES' || metadata.rectangleSemantics !== 'HALF_OPEN' || metadata.interpolation !== 'NONE' || metadata.borderPolicy !== 'REJECT_OUT_OF_BOUNDS') return false;
  const integrity = metadata.integrityMetrics as Readonly<Record<string, unknown>> | undefined;
  if (integrity?.verificationOutcome !== 'PASS' || integrity.pixelComparison !== 'BYTE_EXACT') return false;
  const input = operation.input;
  if (!input || input.deterministicTool !== `${CROP_TOOL_ID}@${CROP_TOOL_VERSION}` || input.coordinateSpace !== metadata.coordinateSpace || input.rectangleSemantics !== metadata.rectangleSemantics) return false;
  return true;
}

function hasValidCropGeometry(operation: WorkflowOperation, artifact: Artifact): boolean {
  if (!isPixelImage(artifact.value)) return false;
  const metadata = artifact.metadata as Readonly<Record<string, unknown>> | undefined;
  const rect = record(metadata?.cropRect);
  const input = operation.input;
  if (!rect || !input) return false;
  const x = exactInteger(rect.x, 0); const y = exactInteger(rect.y, 0); const width = exactInteger(rect.width, 1); const height = exactInteger(rect.height, 1);
  if (x === undefined || y === undefined || width === undefined || height === undefined) return false;
  if (input.x !== x || input.y !== y || input.width !== width || input.height !== height) return false;
  return artifact.value.width === width && artifact.value.height === height;
}

function isCanonicalModelAdmittedImage(artifact: Artifact): boolean {
  if (!isPixelImage(artifact.value)) return false;
  const metadata = artifact.metadata as Readonly<Record<string, unknown>> | undefined;
  if (!metadata || metadata.artifactRole !== 'COMPOSITE' || metadata.localExecutionAdmission !== 'ADMITTED') return false;
  if (metadata.admissionClass !== 'MODEL_CONTRACT' || metadata.executorKind !== 'MODEL') return false;
  if (typeof metadata.modelId !== 'string' || !metadata.modelId || typeof metadata.modelVersion !== 'string' || !metadata.modelVersion) return false;
  if (typeof metadata.runtime !== 'string' || !metadata.runtime || metadata.runtime === 'BROWSER_JS') return false;
  if (metadata.verificationScope !== 'CONTRACT_AND_LINEAGE_ONLY' || metadata.modelOutputSemantics !== 'UNATTESTED_DEVICE_INFERENCE') return false;
  if (metadata.postprocess !== 'CLAMP_0_1' || metadata.alphaPolicy !== SUPER_RESOLUTION_ALPHA_POLICY) return false;
  if (typeof metadata.candidateSha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(metadata.candidateSha256)) return false;
  const integrity = metadata.integrityMetrics as Readonly<Record<string, unknown>> | undefined;
  if (integrity?.verificationOutcome === 'PASS' || integrity?.pixelComparison === 'BYTE_EXACT') return false;
  return true;
}

function hasValidSuperResolutionGeometry(artifact: Artifact): boolean {
  if (!isPixelImage(artifact.value)) return false;
  const value = artifact.value;
  const metadata = artifact.metadata as Readonly<Record<string, unknown>> | undefined;
  const sourceWidth = metadata?.sourceWidth;
  const sourceHeight = metadata?.sourceHeight;
  const scale = metadata?.outputScale;
  if (!Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) || Number(sourceWidth) < 1 || Number(sourceHeight) < 1 || scale !== SUPER_RESOLUTION_SCALE) return false;
  if (value.width !== Number(sourceWidth) * SUPER_RESOLUTION_SCALE || value.height !== Number(sourceHeight) * SUPER_RESOLUTION_SCALE) return false;
  for (let offset = 3; offset < value.data.length; offset += 4) if (value.data[offset] !== 255) return false;
  return true;
}

function isPixelImage(value: unknown): value is Readonly<{ width: number; height: number; data: Uint8ClampedArray }> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Readonly<Record<string, unknown>>;
  const width = candidate.width; const height = candidate.height; const data = candidate.data;
  return Number.isInteger(width) && Number.isInteger(height) && Number(width) > 0 && Number(height) > 0 && data instanceof Uint8ClampedArray && data.length === Number(width) * Number(height) * 4;
}

function isImageReference(value: unknown): boolean {
  if (isPixelImage(value)) return true;
  return isProviderImageReference(value);
}

function isProviderImageReference(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Readonly<Record<string, unknown>>;
  if (typeof candidate.url !== 'string' || typeof candidate.hash !== 'string' || typeof candidate.mimeType !== 'string') return false;
  if (!/^[a-f0-9]{64}$/i.test(candidate.hash)) return false;
  if (!candidate.mimeType.toLowerCase().startsWith('image/')) return false;
  try { const url = new URL(candidate.url); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
}

function sha256(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value); }
function record(value: unknown): Readonly<Record<string, unknown>> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
function exactInteger(value: unknown, minimum: number): number | undefined { return Number.isSafeInteger(value) && Number(value) >= minimum ? Number(value) : undefined; }
function invalid(stepId: string, error: string, checks: readonly string[] = []): VerificationResult { return freezeResult({ stepId, valid: false, checks, errors: [error] }); }
function freezeResult(result: VerificationResult): VerificationResult { return Object.freeze({ stepId: result.stepId, valid: result.valid, checks: Object.freeze([...result.checks]), errors: Object.freeze([...result.errors]) }); }
