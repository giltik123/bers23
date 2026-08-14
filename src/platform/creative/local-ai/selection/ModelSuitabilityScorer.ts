import { immutableClone } from '../immutable';
import type { DeviceCapabilityProfile, ModelManifest, RuntimeCapabilities, SuitabilityScore } from '../types';
import { ResourceGovernor } from './ResourceGovernor';
export class ModelSuitabilityScorer {
  score(model: ModelManifest, operationCapabilities: readonly string[], device: DeviceCapabilityProfile, runtimes: RuntimeCapabilities): SuitabilityScore {
    const reasons: string[] = []; const capability = operationCapabilities.every((item) => model.capabilities.includes(item));
    if (!capability) reasons.push('Operation capabilities do not match');
    if (!model.supportedPlatforms.includes(device.platform)) reasons.push('Platform is unsupported');
    if (runtimes[model.runtime] !== true) reasons.push('Runtime is unavailable');
    if (model.status !== 'READY') reasons.push(`Model status is ${model.status}`);
    const resource = new ResourceGovernor().evaluate(device, model); if (!resource.allowed) reasons.push(...resource.reasons);
    const factors = { quality: model.qualityScore, latency: Math.max(0, 1 - model.estimatedLatency / 60_000), memory: resource.allowed ? 1 : 0, vram: device.vramMb === 'UNKNOWN' ? 0.5 : device.vramMb >= model.requiredVram ? 1 : 0, energy: model.energyScore, privacy: model.privacyLevel === 'PRIVATE' ? 1 : 0.7, compatibility: reasons.length ? 0 : 1, stability: model.stabilityScore };
    const score = Object.values(factors).reduce((sum, value) => sum + value, 0) / Object.keys(factors).length;
    return immutableClone({ modelId: model.modelId, eligible: reasons.length === 0, score, factors, reasons });
  }
}
