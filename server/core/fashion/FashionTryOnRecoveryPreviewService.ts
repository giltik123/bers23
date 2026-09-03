import type { AuthenticatedScope } from '../application/creativeExecutionService.ts';
import type { StoredProjectImageEvidence } from '../artifacts/artifactAuthority.ts';
import type { FashionTryOnFinalResult, FashionTryOnFinalResultService } from './FashionTryOnFinalResultService.ts';
import type { FashionTryOnOrchestrationIntentV1 } from './FashionTryOnOrchestrationContract.ts';

export const FASHION_TRYON_RECOVERY_PREVIEW_TTL_MS = 120_000;

const DELIVERY_PREFIX = '/api/core/artifacts/results/';

type FinalResultReader = Pick<FashionTryOnFinalResultService, 'result'>;
type PreviewEvidence = Pick<StoredProjectImageEvidence,
  'artifactId' | 'projectId' | 'storageId' | 'role' | 'lifecycle'
>;

export type FashionTryOnPreviewDeliveryPort = Readonly<{
  resolveFinalEvidence(
    scope: AuthenticatedScope & Readonly<{ projectId: string }>,
    artifactId: string,
  ): Promise<PreviewEvidence>;
  mintFinalDelivery(
    scope: AuthenticatedScope & Readonly<{ projectId: string }>,
    storageId: string,
    expiresAt: number,
  ): string;
}>;

export type FashionTryOnRecoveryPreviewDependencies = Readonly<{
  result: FinalResultReader;
  delivery: FashionTryOnPreviewDeliveryPort;
  now: () => number;
}>;

type NonReadyFinalResult = Exclude<FashionTryOnFinalResult, Readonly<{ status: 'FINAL_READY'; artifactId: string }>>;

export type FashionTryOnRecoveryPreviewResult =
  | NonReadyFinalResult
  | Readonly<{
      status: 'PREVIEW_READY';
      projectId: string;
      sourceArtifactId: string;
      garmentId: string;
      artifactId: string;
      previewUrl: string;
      previewExpiresAt: number;
    }>;

/**
 * Read-only recovery preview capability for an already committed deterministic
 * Try-On FINAL.
 *
 * The caller supplies only the same stable product intent used by prepare,
 * continue and result. Stable FINAL identity is recovered inside Core, resolved
 * to durable evidence, converted to one short-lived delivery URL, then checked
 * against the same stable intent a second time before the URL is returned.
 *
 * The second result check intentionally happens after minting. If current
 * Project/Garment/body-anchor evidence changed during recovery, the fresh URL is
 * discarded and never crosses the product boundary. Project Accept/history,
 * execution, persistence and external-execution selection remain outside this service.
 */
export class FashionTryOnRecoveryPreviewService {
  constructor(private readonly dependencies: FashionTryOnRecoveryPreviewDependencies) {}

  async preview(
    input: FashionTryOnOrchestrationIntentV1 | unknown,
    auth: AuthenticatedScope,
  ): Promise<FashionTryOnRecoveryPreviewResult> {
    const initial = await this.dependencies.result.result(input, auth);
    if (initial.status !== 'FINAL_READY') return initial;

    const scope = Object.freeze({ ...auth, projectId: initial.projectId });
    const evidence = await this.dependencies.delivery.resolveFinalEvidence(scope, initial.artifactId);
    assertFinalEvidence(initial, evidence);

    const now = this.dependencies.now();
    if (!Number.isFinite(now) || now < 0) throw previewError('fashion_tryon_preview_clock_invalid', 'Try-On preview clock is invalid');
    const expiresAt = now + FASHION_TRYON_RECOVERY_PREVIEW_TTL_MS;
    if (!Number.isSafeInteger(expiresAt) || expiresAt <= now) {
      throw previewError('fashion_tryon_preview_expiry_invalid', 'Try-On preview expiry is invalid');
    }

    const previewUrl = this.dependencies.delivery.mintFinalDelivery(scope, evidence.storageId, expiresAt);
    requirePreviewUrl(previewUrl);

    const confirmed = await this.dependencies.result.result(input, auth);
    if (confirmed.status !== 'FINAL_READY') return confirmed;
    if (!sameFinal(initial, confirmed)) return stale(initial);

    return Object.freeze({
      status: 'PREVIEW_READY',
      projectId: initial.projectId,
      sourceArtifactId: initial.sourceArtifactId,
      garmentId: initial.garmentId,
      artifactId: initial.artifactId,
      previewUrl,
      previewExpiresAt: expiresAt,
    });
  }
}

function assertFinalEvidence(
  result: Extract<FashionTryOnFinalResult, Readonly<{ status: 'FINAL_READY' }>>,
  evidence: PreviewEvidence,
): void {
  if (
    evidence.artifactId !== result.artifactId
    || evidence.projectId !== result.projectId
    || evidence.role !== 'COMPOSITE'
    || evidence.lifecycle !== 'FINAL'
    || typeof evidence.storageId !== 'string'
    || !evidence.storageId
  ) {
    throw previewError(
      'fashion_tryon_preview_evidence_mismatch',
      'Recovered Try-On FINAL evidence is outside the preview delivery contract',
    );
  }
}

function sameFinal(
  left: Extract<FashionTryOnFinalResult, Readonly<{ status: 'FINAL_READY' }>>,
  right: Extract<FashionTryOnFinalResult, Readonly<{ status: 'FINAL_READY' }>>,
): boolean {
  return left.projectId === right.projectId
    && left.sourceArtifactId === right.sourceArtifactId
    && left.garmentId === right.garmentId
    && left.artifactId === right.artifactId;
}

function stale(result: Extract<FashionTryOnFinalResult, Readonly<{ status: 'FINAL_READY' }>>): FashionTryOnRecoveryPreviewResult {
  return Object.freeze({
    status: 'TEXTURE_STALE',
    projectId: result.projectId,
    sourceArtifactId: result.sourceArtifactId,
    garmentId: result.garmentId,
  });
}

function requirePreviewUrl(value: string): void {
  if (
    typeof value !== 'string'
    || !value.startsWith(DELIVERY_PREFIX)
    || value.length <= DELIVERY_PREFIX.length
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) throw previewError('fashion_tryon_preview_delivery_invalid', 'Try-On preview delivery URL is invalid');
}

function previewError(code: string, message: string): Error & { status: 500; code: string } {
  return Object.assign(new Error(message), { status: 500 as const, code });
}
