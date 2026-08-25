import manifest from './portrait-matting.manifest.json' with { type: 'json' };

export const MODNET_MODEL_ID = 'modnet-photographic-portrait-matting' as const;
export const MODNET_VERSION = '1.0.0-candidate.1' as const;
export const MODNET_UPSTREAM_REVISION = '28165a451e4610c9d77cfdf925a94610bb2810fb' as const;
export const MODNET_CHECKPOINT_NAME = 'modnet_photographic_portrait_matting.ckpt' as const;
export const MODNET_CHECKPOINT_SIZE = 26_255_603 as const;
export const MODNET_CHECKPOINT_SHA256 = '7c22235f0925deba15d4d63e53afcb654c47055bbcd98f56e393ab2584007ed8' as const;

/**
 * Release-envelope predicate only. It cannot authorize install, READY fleet state or Core execution.
 * This model/version is byte-bound to the authoritative upstream checkpoint. Any checkpoint change
 * requires a new BERS version, even if a replacement artifact is otherwise correctly signed.
 */
export function isExecutableModNetRelease(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const release = value as Readonly<Record<string, unknown>>;
  if (release.modelId !== MODNET_MODEL_ID || release.version !== MODNET_VERSION) return false;
  if (release.status !== 'PRODUCTION_APPROVED' || release.artifactState !== 'SIGNED_RELEASE') return false;
  if (typeof release.verificationKeyId !== 'string' || !release.verificationKeyId.trim()) return false;
  if (!isHttpsUrl(release.productionApprovalEvidence)) return false;

  const upstream = objectRecord(release.upstream);
  if (!upstream || upstream.revision !== MODNET_UPSTREAM_REVISION) return false;
  const checkpoint = objectRecord(upstream.checkpoint);
  if (!checkpoint || checkpoint.identityState !== 'PINNED') return false;
  if (checkpoint.name !== MODNET_CHECKPOINT_NAME) return false;
  if (checkpoint.size !== MODNET_CHECKPOINT_SIZE || checkpoint.sha256 !== MODNET_CHECKPOINT_SHA256) return false;

  const bersExport = objectRecord(release.bersExport);
  if (!bersExport || bersExport.state !== 'PINNED') return false;
  if (!positiveSafeInteger(bersExport.onnxSize) || !sha256(bersExport.onnxSha256)) return false;

  const artifacts = objectRecord(release.artifacts);
  const model = objectRecord(artifacts?.model);
  if (!completeArtifact(model)) return false;

  return Number(model!.size) === Number(bersExport.onnxSize)
    && model!.sha256 === bersExport.onnxSha256;
}

export const modNetReleaseState = Object.freeze({
  modelId: String(manifest.modelId),
  version: String(manifest.version),
  releaseStatus: String(manifest.status),
  artifactState: String(manifest.artifactState),
  checkpointIdentityState: String(manifest.upstream.checkpoint.identityState),
  exportState: String(manifest.bersExport.state),
  productionAvailable: isExecutableModNetRelease(manifest),
});

function completeArtifact(value: Readonly<Record<string, unknown>> | null): boolean {
  return !!value
    && isHttpsUrl(value.url)
    && isHttpsUrl(value.signatureUrl)
    && positiveSafeInteger(value.size)
    && sha256(value.sha256);
}

function objectRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}
function positiveSafeInteger(value: unknown): boolean { return Number.isSafeInteger(value) && Number(value) > 0; }
function sha256(value: unknown): value is string { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
