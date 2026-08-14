import { immutableClone } from '../immutable';
import type { DeviceCapabilityProfile, ModelManifest, PrivacyMode, ResourceDecision } from '../types';
export class ResourceGovernor {
  evaluate(device: DeviceCapabilityProfile, model: ModelManifest, concurrentJobs = 0, privacy: PrivacyMode = 'NORMAL'): ResourceDecision {
    const reasons: string[] = [];
    if (device.ramMb !== 'UNKNOWN' && device.ramMb < model.requiredRam) reasons.push('Insufficient RAM');
    if (device.vramMb !== 'UNKNOWN' && device.vramMb < model.requiredVram) reasons.push('Insufficient VRAM');
    if (device.storageFreeBytes !== 'UNKNOWN' && device.storageFreeBytes < model.sizeBytes) reasons.push('Insufficient storage');
    if (device.batteryPercent !== 'UNKNOWN' && device.powerState !== 'CHARGING' && device.batteryPercent < 15) reasons.push('Battery is too low');
    if (device.thermalState === 'HIGH' || device.thermalState === 'CRITICAL') reasons.push('Thermal limit reached');
    if (device.ramPressure === 'HIGH' || device.ramPressure === 'CRITICAL') reasons.push('RAM pressure is too high');
    if (device.backgroundRestricted === true) reasons.push('Background inference is restricted');
    if (concurrentJobs >= (device.tier === 'EXTREME' ? 4 : device.tier === 'HIGH' ? 2 : 1)) reasons.push('Concurrent job limit reached');
    return immutableClone({ allowed: reasons.length === 0, reasons, suggestedTarget: reasons.length === 0 ? 'LOCAL' : privacy === 'LOCAL_ONLY' || privacy === 'OFFLINE_ONLY' ? 'BLOCKED' : 'CLOUD' });
  }
}
