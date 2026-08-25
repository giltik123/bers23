import manifest from './efficient-sam-ti.manifest.json' with { type: 'json' };

export const EFFICIENT_SAM_MODEL_ID = 'efficient-sam-ti' as const;
export const EFFICIENT_SAM_VERSION = '1.0.0-candidate.1' as const;
export const EFFICIENT_SAM_UPSTREAM_REVISION = 'd525f622e6f640acf5a0fc37c7ca1f243da5bde0' as const;

export const EFFICIENT_SAM_PINNED_ARTIFACTS = Object.freeze({
  encoder: Object.freeze({
    size: 24_799_761,
    sha256: '84ed466ffcc5c1f8d08409bc34a23bb364ab2c15e402cb12d4335a42be0e0951',
  }),
  decoder: Object.freeze({
    size: 16_565_728,
    sha256: 'a62f8fa5ea080447c0689418d69e58f1e83e0b7adf9c142e2bd9bcc8045c0b11',
  }),
});

/**
 * Release-envelope predicate only. It does not grant device/fleet/Core execution authority.
 * The candidate version is byte-bound to the exact official upstream split ONNX artifacts;
 * changing either artifact requires a new version rather than silently reusing this identity.
 * An executable production binding must additionally be admitted by the canonical v2 model policy.
 */
export function isExecutableEfficientSamRelease(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const release = value as Readonly<Record<string, unknown>>;
  if (release.modelId !== EFFICIENT_SAM_MODEL_ID || release.version !== EFFICIENT_SAM_VERSION) return false;
  if (release.status !== 'PRODUCTION_APPROVED' || release.artifactState !== 'SIGNED_RELEASE') return false;
  if (typeof release.verificationKeyId !== 'string' || release.verificationKeyId.trim().length < 1) return false;
  if (!isHttpsUrl(release.productionApprovalEvidence)) return false;
  const artifacts = release.artifacts;
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) return false;
  const record = artifacts as Readonly<Record<string, unknown>>;
  return exactArtifact(record.encoder, EFFICIENT_SAM_PINNED_ARTIFACTS.encoder)
    && exactArtifact(record.decoder, EFFICIENT_SAM_PINNED_ARTIFACTS.decoder);
}

export const efficientSamReleaseState = Object.freeze({
  modelId: String(manifest.modelId),
  version: String(manifest.version),
  releaseStatus: String(manifest.status),
  artifactState: String(manifest.artifactState),
  productionAvailable: isExecutableEfficientSamRelease(manifest),
});

function exactArtifact(
  value: unknown,
  expected: Readonly<{ size: number; sha256: string }>,
): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const artifact = value as Readonly<Record<string, unknown>>;
  return isHttpsUrl(artifact.url)
    && isHttpsUrl(artifact.signatureUrl)
    && artifact.size === expected.size
    && artifact.sha256 === expected.sha256;
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
