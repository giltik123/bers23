import type { Artifact, WorkflowOperation, WorkflowVerifierPort, VerificationResult } from '../../../src/platform/creative/workflow-engine/types.ts';

export const PRODUCTION_WORKFLOW_VERIFICATION_VERSION = '6.41C2.1';

const CHECKS = Object.freeze({
  supported: 'PRODUCTION_OPERATION_SUPPORTED',
  imageKind: 'OUTPUT_KIND_IMAGE',
  providerReference: 'PROVIDER_IMAGE_REFERENCE_VALID',
} as const);

const ERRORS = Object.freeze({
  controlledOwned: 'CONTROLLED_INTEGRITY_VERIFICATION_REQUIRED',
  unsupported: 'UNSUPPORTED_OPERATION_VERIFICATION',
  outputRequired: 'OUTPUT_REQUIRED',
  wrongKind: 'OUTPUT_KIND_INVALID',
  malformedReference: 'PROVIDER_IMAGE_REFERENCE_INVALID',
} as const);

/**
 * Server-owned runtime verification policy for currently accepted production contracts.
 * Planner verification claims are intentionally ignored. This component performs no
 * provider call, network access, persistence, authorization or financial mutation.
 */
export class ProductionWorkflowVerifier implements WorkflowVerifierPort {
  async verify(operation: WorkflowOperation, artifacts: readonly Artifact[]): Promise<VerificationResult> {
    if (operation.type === 'CONTROLLED_LOCAL_EDIT') {
      return invalid(operation.id, ERRORS.controlledOwned);
    }
    if (operation.type !== 'image-edit') {
      return invalid(operation.id, ERRORS.unsupported);
    }
    if (artifacts.length === 0) {
      return invalid(operation.id, ERRORS.outputRequired, [CHECKS.supported]);
    }
    if (artifacts.some(artifact => artifact.kind !== 'image')) {
      return invalid(operation.id, ERRORS.wrongKind, [CHECKS.supported]);
    }
    if (artifacts.some(artifact => !isProviderImageReference(artifact.value))) {
      return invalid(operation.id, ERRORS.malformedReference, [CHECKS.supported, CHECKS.imageKind]);
    }
    return freezeResult({
      stepId: operation.id,
      valid: true,
      checks: [CHECKS.supported, CHECKS.imageKind, CHECKS.providerReference],
      errors: [],
    });
  }
}

export const productionWorkflowVerifier: WorkflowVerifierPort = Object.freeze(new ProductionWorkflowVerifier());

function isProviderImageReference(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Readonly<Record<string, unknown>>;
  if (typeof candidate.url !== 'string' || typeof candidate.hash !== 'string' || typeof candidate.mimeType !== 'string') return false;
  if (!/^[a-f0-9]{64}$/i.test(candidate.hash)) return false;
  if (!candidate.mimeType.toLowerCase().startsWith('image/')) return false;
  try {
    const url = new URL(candidate.url);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

function invalid(stepId: string, error: string, checks: readonly string[] = []): VerificationResult {
  return freezeResult({ stepId, valid: false, checks, errors: [error] });
}

function freezeResult(result: VerificationResult): VerificationResult {
  return Object.freeze({
    stepId: result.stepId,
    valid: result.valid,
    checks: Object.freeze([...result.checks]),
    errors: Object.freeze([...result.errors]),
  });
}
