import manifest from './lama-inpainting.manifest.json' with { type: 'json' };

export const LAMA_MODEL_ID = 'lama-big-places-inpainting' as const;
export const LAMA_VERSION = '1.0.0-candidate.1' as const;
export const LAMA_UPSTREAM_REVISION = '786f5936b27fb3dacd2b1ad799e4de968ea697e7' as const;
export const LAMA_ARCHIVE_NAME = 'big-lama.zip' as const;
export const LAMA_ARCHIVE_DRIVE_FILE_ID = '11RbsVSav3O-fReBsPHBE1nn8kcFIMnKp' as const;
export const LAMA_ARCHIVE_SIZE = 381_428_720 as const;
export const LAMA_ARCHIVE_SHA256 = 'd7161bba4d68b438f9fa7f09dcb750a223804c300c68d214a5e0be16251fba8d' as const;
export const LAMA_CHECKPOINT_PATH = 'big-lama/models/best.ckpt' as const;
export const LAMA_CHECKPOINT_SIZE = 410_046_389 as const;
export const LAMA_CHECKPOINT_SHA256 = 'fccb7adffd53ec0974ee5503c3731c2c2f1e7e07856fd9228cdcc0b46fd5d423' as const;
export const LAMA_CONFIG_PATH = 'big-lama/config.yaml' as const;
export const LAMA_CONFIG_SIZE = 3_947 as const;
export const LAMA_CONFIG_SHA256 = '4fdeed49926e13b101c4dd9e193acec9e58677dfdb4ba49dd6a3a8927964e2a7' as const;
export const LAMA_ONNX_SIZE = 208_593_659 as const;
export const LAMA_ONNX_SHA256 = '8bf7891efa16ea07de31fc98c5f0c017b399956cba0182813ddf23d9072792c7' as const;
export const LAMA_ONNX_OPSET = 18 as const;
export const LAMA_AUTHORITATIVE_CHECKPOINT_PINNED = true as const;

/**
 * Release-envelope predicate only. It grants neither installation nor Core execution authority.
 * This BERS model version is byte-bound to the authoritative Big-LaMa archive/checkpoint/config and
 * to the exact reproducible C8 ONNX bytes. A signed release is still non-executable until separate
 * production approval and VERIFIED runtime/device evidence are recorded.
 */
export function isExecutableLaMaRelease(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const release = value as Readonly<Record<string, unknown>>;
  if (release.modelId !== LAMA_MODEL_ID || release.version !== LAMA_VERSION) return false;
  if (release.status !== 'PRODUCTION_APPROVED' || release.artifactState !== 'SIGNED_RELEASE') return false;
  if (!isHttpsUrl(release.productionApprovalEvidence)) return false;
  if (typeof release.verificationKeyId !== 'string' || !release.verificationKeyId.trim()) return false;

  const upstream = objectRecord(release.upstream);
  if (!upstream || upstream.revision !== LAMA_UPSTREAM_REVISION) return false;
  const distribution = objectRecord(upstream.distribution);
  if (!distribution || distribution.authoritativeArchiveDriveFileId !== LAMA_ARCHIVE_DRIVE_FILE_ID) return false;
  const checkpoint = objectRecord(upstream.checkpoint);
  if (!checkpoint || checkpoint.identityState !== 'PINNED') return false;
  if (checkpoint.archiveName !== LAMA_ARCHIVE_NAME
    || checkpoint.archiveSize !== LAMA_ARCHIVE_SIZE
    || checkpoint.archiveSha256 !== LAMA_ARCHIVE_SHA256
    || checkpoint.checkpointPath !== LAMA_CHECKPOINT_PATH
    || checkpoint.checkpointSize !== LAMA_CHECKPOINT_SIZE
    || checkpoint.checkpointSha256 !== LAMA_CHECKPOINT_SHA256
    || checkpoint.configPath !== LAMA_CONFIG_PATH
    || checkpoint.configSize !== LAMA_CONFIG_SIZE
    || checkpoint.configSha256 !== LAMA_CONFIG_SHA256) return false;

  const artifact = objectRecord(release.bersArtifact);
  if (!artifact || artifact.state !== 'PINNED' || artifact.format !== 'ONNX') return false;
  if (artifact.size !== LAMA_ONNX_SIZE || artifact.sha256 !== LAMA_ONNX_SHA256 || artifact.opset !== LAMA_ONNX_OPSET) return false;

  const feasibility = objectRecord(release.runtimeFeasibility);
  if (!feasibility || feasibility.state !== 'VERIFIED') return false;
  const verifiedRuntime = feasibility.browserWasm === 'VERIFIED' || feasibility.browserWebGpu === 'VERIFIED';
  if (!verifiedRuntime) return false;

  const artifacts = objectRecord(release.artifacts);
  const model = objectRecord(artifacts?.model);
  if (!completeArtifact(model)) return false;
  return model!.size === LAMA_ONNX_SIZE && model!.sha256 === LAMA_ONNX_SHA256;
}

export const laMaReleaseState = Object.freeze({
  modelId: String(manifest.modelId),
  version: String(manifest.version),
  releaseStatus: String(manifest.status),
  artifactState: String(manifest.artifactState),
  checkpointIdentityState: String(manifest.upstream.checkpoint.identityState),
  runtimeFeasibilityState: String(manifest.runtimeFeasibility.state),
  bersArtifactState: String(manifest.bersArtifact.state),
  bersArtifactSize: Number(manifest.bersArtifact.size),
  bersArtifactSha256: String(manifest.bersArtifact.sha256),
  productionAvailable: isExecutableLaMaRelease(manifest),
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
function positiveSafeInteger(value: unknown): boolean {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
function sha256(value: unknown): value is string {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
