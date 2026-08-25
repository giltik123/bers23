import manifest from './lama-inpainting.manifest.json' with { type: 'json' };

export const LAMA_MODEL_ID = 'lama-big-places-inpainting' as const;
export const LAMA_VERSION = '1.0.0-candidate.1' as const;
export const LAMA_UPSTREAM_REVISION = '786f5936b27fb3dacd2b1ad799e4de968ea697e7' as const;

/**
 * C6 intentionally starts before checkpoint bytes are known. Keep this false until the
 * authoritative Drive acquisition has pinned the exact Big-LaMa checkpoint/config identity.
 * This prevents a structurally plausible forged manifest from becoming executable during
 * the discovery phase.
 */
export const LAMA_AUTHORITATIVE_CHECKPOINT_PINNED = false as const;

/**
 * Release-envelope predicate only. It grants neither installation nor Core execution authority.
 * Even after checkpoint identity is pinned, a separately pinned browser artifact, verified local
 * runtime and explicit production evidence are required.
 */
export function isExecutableLaMaRelease(value: unknown): boolean {
  if (!LAMA_AUTHORITATIVE_CHECKPOINT_PINNED) return false;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const release = value as Readonly<Record<string, unknown>>;
  if (release.modelId !== LAMA_MODEL_ID || release.version !== LAMA_VERSION) return false;
  if (release.status !== 'PRODUCTION_APPROVED' || release.artifactState !== 'SIGNED_RELEASE') return false;
  if (!isHttpsUrl(release.productionApprovalEvidence)) return false;
  if (typeof release.verificationKeyId !== 'string' || !release.verificationKeyId.trim()) return false;

  const upstream = objectRecord(release.upstream);
  if (!upstream || upstream.revision !== LAMA_UPSTREAM_REVISION) return false;
  const checkpoint = objectRecord(upstream.checkpoint);
  if (!checkpoint || checkpoint.identityState !== 'PINNED') return false;
  if (!positiveSafeInteger(checkpoint.checkpointSize) || !sha256(checkpoint.checkpointSha256)) return false;
  if (!positiveSafeInteger(checkpoint.configSize) || !sha256(checkpoint.configSha256)) return false;

  const artifact = objectRecord(release.bersArtifact);
  if (!artifact || artifact.state !== 'PINNED') return false;
  if (!positiveSafeInteger(artifact.size) || !sha256(artifact.sha256)) return false;

  const feasibility = objectRecord(release.runtimeFeasibility);
  if (!feasibility || feasibility.state !== 'VERIFIED') return false;
  const verifiedRuntime = feasibility.browserWasm === 'VERIFIED' || feasibility.browserWebGpu === 'VERIFIED';
  if (!verifiedRuntime) return false;

  const artifacts = objectRecord(release.artifacts);
  const model = objectRecord(artifacts?.model);
  if (!completeArtifact(model)) return false;
  return Number(model!.size) === Number(artifact.size) && model!.sha256 === artifact.sha256;
}

export const laMaReleaseState = Object.freeze({
  modelId: String(manifest.modelId),
  version: String(manifest.version),
  releaseStatus: String(manifest.status),
  artifactState: String(manifest.artifactState),
  checkpointIdentityState: String(manifest.upstream.checkpoint.identityState),
  runtimeFeasibilityState: String(manifest.runtimeFeasibility.state),
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
