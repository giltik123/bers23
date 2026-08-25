import manifest from './efficient-sam-ti.manifest.json' with { type: 'json' };

export const EFFICIENT_SAM_MODEL_ID = 'efficient-sam-ti' as const;
export const EFFICIENT_SAM_VERSION = '1.0.0-candidate.1' as const;
export const EFFICIENT_SAM_UPSTREAM_REVISION = 'd525f622e6f640acf5a0fc37c7ca1f243da5bde0' as const;

/**
 * Release-envelope predicate only. It does not grant device/fleet/Core execution authority.
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
  return completeArtifact(record.encoder) && completeArtifact(record.decoder);
}

export const efficientSamReleaseState = Object.freeze({
  modelId: String(manifest.modelId),
  version: String(manifest.version),
  releaseStatus: String(manifest.status),
  artifactState: String(manifest.artifactState),
  productionAvailable: isExecutableEfficientSamRelease(manifest),
});

function completeArtifact(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const artifact = value as Readonly<Record<string, unknown>>;
  return isHttpsUrl(artifact.url)
    && isHttpsUrl(artifact.signatureUrl)
    && Number.isSafeInteger(artifact.size)
    && Number(artifact.size) > 0
    && typeof artifact.sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(artifact.sha256);
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
