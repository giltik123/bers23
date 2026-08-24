import manifest from '../../../src/platform/creative/local-ai/models/interactive-segmentation.manifest.json' with { type: 'json' };
import upscaleManifest from '../../../src/platform/creative/local-ai/models/super-resolution.manifest.json' with { type: 'json' };
import type { LocalExecutionModelBinding } from '../../../src/platform/creative/canonical/localExecution.ts';

export const MOBILE_SAM_LOCAL_CAPABILITY = 'local:mobilesam:segment:v1' as const;
export const REAL_ESRGAN_LOCAL_CAPABILITY = 'local:realesrgan:upscale:v1' as const;

const approvedMobileSam: readonly LocalExecutionModelBinding[] = manifest.status === 'PRODUCTION_APPROVED'
  ? Object.freeze([Object.freeze({ modelId: String(manifest.modelId), version: String(manifest.version) })])
  : Object.freeze([]);

const approvedRealEsrgan: readonly LocalExecutionModelBinding[] = isExecutableRealEsrganRelease(upscaleManifest)
  ? Object.freeze([Object.freeze({ modelId: String(upscaleManifest.modelId), version: String(upscaleManifest.version) })])
  : Object.freeze([]);

/**
 * Real-ESRGAN's release gate is deliberately stronger than a status flag. The model
 * binding remains non-executable until a dedicated promotion records a materialized,
 * signed ONNX release plus external approval evidence. Artifact signature verification
 * still belongs to the Local AI trust/install path; this predicate prevents incomplete
 * release metadata from becoming Core execution authority.
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

function isHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
}

/**
 * Core executable model policy. A signed CANDIDATE is discoverable by the device
 * substrate but is not executable authority until its release gate is satisfied.
 */
export const productionLocalModelsByCapability: Readonly<Record<string, readonly LocalExecutionModelBinding[]>> = Object.freeze({
  [MOBILE_SAM_LOCAL_CAPABILITY]: approvedMobileSam,
  [REAL_ESRGAN_LOCAL_CAPABILITY]: approvedRealEsrgan,
});

export const mobileSamProductionReleaseState = Object.freeze({
  modelId: String(manifest.modelId),
  version: String(manifest.version),
  releaseStatus: String(manifest.status),
  executable: approvedMobileSam.length === 1,
});

export const realEsrganProductionReleaseState = Object.freeze({
  modelId: String(upscaleManifest.modelId),
  version: String(upscaleManifest.version),
  releaseStatus: String(upscaleManifest.status),
  artifactState: String(upscaleManifest.artifactState),
  executable: approvedRealEsrgan.length === 1,
});
