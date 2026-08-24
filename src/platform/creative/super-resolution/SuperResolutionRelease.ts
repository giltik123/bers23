import manifest from '../local-ai/models/super-resolution.manifest.json';

/**
 * Shared release-availability predicate used by both Core execution policy and browser UI.
 * A status flag alone is deliberately insufficient: an executable release must name the
 * materialized signed ONNX artifact and external approval evidence. Cryptographic artifact
 * verification still happens in the Local AI install/trust path before bytes become READY.
 */
export function isExecutableRealEsrganRelease(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const release = value as Readonly<Record<string, unknown>>;
  if (release.status !== 'PRODUCTION_APPROVED' || release.artifactState !== 'SIGNED_RELEASE') return false;
  if (typeof release.verificationKeyId !== 'string' || release.verificationKeyId.trim().length < 1) return false;
  if (!isHttpsUrl(release.productionApprovalEvidence)) return false;
  const artifacts = release.artifacts;
  if (!artifacts || typeof artifacts !== 'object' || Array.isArray(artifacts)) return false;
  const model = (artifacts as Readonly<Record<string, unknown>>).model;
  if (!model || typeof model !== 'object' || Array.isArray(model)) return false;
  const artifact = model as Readonly<Record<string, unknown>>;
  return isHttpsUrl(artifact.url)
    && isHttpsUrl(artifact.signatureUrl)
    && Number.isInteger(artifact.size)
    && Number(artifact.size) > 0
    && typeof artifact.sha256 === 'string'
    && /^[a-f0-9]{64}$/.test(artifact.sha256);
}

export const superResolutionReleaseState = Object.freeze({
  modelId: String(manifest.modelId),
  version: String(manifest.version),
  releaseStatus: String(manifest.status),
  artifactState: String(manifest.artifactState),
  productionAvailable: isExecutableRealEsrganRelease(manifest),
});

export const SUPER_RESOLUTION_PRODUCTION_AVAILABLE = superResolutionReleaseState.productionAvailable;

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}
