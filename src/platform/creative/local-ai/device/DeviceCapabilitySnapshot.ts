import { immutableClone } from '../immutable';
import type { DeviceCapabilityProfile, DeviceCapabilitySnapshot, RuntimeCapabilities, RuntimeKind } from '../types';

const PROFILE_SIGNAL_KEYS = [
  'platform', 'deviceClass', 'cpuCores', 'ramMb', 'gpu', 'vramMb', 'npu', 'architecture', 'browser',
  'webgpu', 'wasm', 'webnn', 'cuda', 'directml', 'metal', 'vulkan', 'storageFreeBytes', 'batteryPercent',
  'powerState', 'thermalState', 'network', 'ramPressure', 'backgroundRestricted',
] as const satisfies readonly (Exclude<keyof DeviceCapabilityProfile, 'tier'>)[];

const RUNTIME_KEYS = ['ONNX_RUNTIME', 'WEBGPU', 'WASM', 'NNAPI', 'DIRECTML', 'CUDA', 'METAL', 'VULKAN'] as const satisfies readonly RuntimeKind[];

/**
 * Privacy-conscious capability evidence snapshot. It intentionally has no stable device ID,
 * hardware fingerprint, tenant/project identity, provider identity or financial authority.
 */
export class DeviceCapabilitySnapshotBuilder {
  build(profile: DeviceCapabilityProfile, runtimeCapabilities: RuntimeCapabilities, capturedAt: number): DeviceCapabilitySnapshot {
    if (!Number.isFinite(capturedAt) || capturedAt < 0) throw new Error('Capability snapshot timestamp must be finite and non-negative');
    const observedSignals = PROFILE_SIGNAL_KEYS.filter((key) => profile[key] !== 'UNKNOWN').map(String).sort();
    const unknownSignals = PROFILE_SIGNAL_KEYS.filter((key) => profile[key] === 'UNKNOWN').map(String).sort();
    const observedRuntimes = RUNTIME_KEYS.filter((kind) => runtimeCapabilities[kind] !== 'UNKNOWN');
    const unknownRuntimes = RUNTIME_KEYS.filter((kind) => runtimeCapabilities[kind] === 'UNKNOWN');
    return immutableClone({
      schemaVersion: 1 as const,
      capturedAt,
      profile,
      runtimeCapabilities,
      evidence: { observedSignals, unknownSignals, observedRuntimes, unknownRuntimes },
    });
  }
}
