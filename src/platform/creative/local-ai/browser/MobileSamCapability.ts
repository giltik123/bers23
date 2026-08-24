import manifest from '../models/interactive-segmentation.manifest.json';
import type { ModelManifest, ModelStatus } from '../types';

export const MOBILE_SAM_CAPABILITY = 'INTERACTIVE_SEGMENTATION' as const;
export const MOBILE_SAM_MODEL_ID = 'mobilesam-vit-t' as const;
export const MOBILE_SAM_MODEL_VERSION = '1.0.2' as const;

/**
 * Device suitability descriptor for the signed split MobileSAM release.
 * Artifact trust is still re-verified by MobileSamBrowserSegmentation before runtime load.
 * A CANDIDATE release is intentionally not promoted to READY here.
 */
export const MOBILE_SAM_BROWSER_MODEL: ModelManifest = Object.freeze({
  modelId: manifest.modelId,
  version: manifest.version,
  family: 'MobileSAM',
  capabilities: Object.freeze([MOBILE_SAM_CAPABILITY]),
  modelFormat: 'ONNX',
  runtime: 'WASM',
  sizeBytes: manifest.artifacts.encoder.size + manifest.artifacts.decoder.size,
  requiredRam: 256,
  requiredVram: 0,
  supportedPlatforms: Object.freeze(['BROWSER' as const]),
  supportedAccelerators: Object.freeze(['WASM' as const]),
  estimatedLatency: 2_000,
  qualityScore: .9,
  energyScore: .8,
  privacyLevel: 'PRIVATE',
  license: manifest.license,
  publisher: manifest.verificationKeyId,
  downloadUri: manifest.artifacts.encoder.url,
  sha256: manifest.upstream.checkpointSha256,
  signature: `signed-release-pack:${manifest.verificationKeyId}`,
  status: releaseStatus(String(manifest.status)),
  stabilityScore: .9,
});

export const MOBILE_SAM_RELEASE_APPROVED = MOBILE_SAM_BROWSER_MODEL.status === 'READY';

function releaseStatus(status: string): ModelStatus {
  return status === 'PRODUCTION_APPROVED' ? 'READY' : 'AVAILABLE';
}
