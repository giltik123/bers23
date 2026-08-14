import { immutableClone } from '../immutable';
import type { InferenceResult, LocalCloudComparison, ResultVerification } from '../types';
export class LocalResultVerifier {
  verify(result: InferenceResult, requirements: Readonly<{ mimeTypes?: readonly string[]; width?: number; height?: number; qualityThreshold?: number; maskThreshold?: number }> = {}): ResultVerification {
    const artifact = result.artifact; const quality = Number(artifact.metadata.quality ?? 1); const maskQuality = Number(artifact.metadata.maskQuality ?? 1);
    const checks = { artifact: Boolean(artifact.id && artifact.data), shape: Object.values(result.outputs).every((tensor) => tensor.dims.length > 0 && tensor.dims.every((d) => Number.isInteger(d) && d > 0)), mime: !requirements.mimeTypes || requirements.mimeTypes.includes(artifact.mimeType), dimensions: (!requirements.width || artifact.width === requirements.width) && (!requirements.height || artifact.height === requirements.height), quality: quality >= (requirements.qualityThreshold ?? 0), maskQuality: maskQuality >= (requirements.maskThreshold ?? 0) };
    const errors = Object.entries(checks).filter(([, valid]) => !valid).map(([name]) => `${name} validation failed`); return immutableClone({ valid: !errors.length, checks, errors });
  }
}
export function compareLocalCloud(local: Readonly<{ latencyMs: number; quality: number; cost: number }>, cloud: Readonly<{ latencyMs: number; quality: number; cost: number }>, qualityRequirement = 0): LocalCloudComparison {
  const localScore = local.quality >= qualityRequirement ? local.quality * 100 - local.latencyMs / 100 - local.cost * 10 : -Infinity; const cloudScore = cloud.quality >= qualityRequirement ? cloud.quality * 100 - cloud.latencyMs / 100 - cloud.cost * 10 : -Infinity; const target = localScore >= cloudScore ? 'LOCAL' : 'CLOUD'; return immutableClone({ target, localScore, cloudScore, reason: `${target} has the best quality, latency, and cost score` });
}
