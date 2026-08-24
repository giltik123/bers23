import { immutableClone } from '../immutable';
import type { DeviceCapabilityProfile, DeviceCapabilitySnapshot, RuntimeCapabilities, RuntimeKind } from '../types';

const POLICY_SIGNAL_KEYS = ['platform', 'deviceClass', 'ramMb', 'vramMb', 'storageFreeBytes'] as const;
const RUNTIME_KEYS = ['ONNX_RUNTIME', 'WEBGPU', 'WASM', 'NNAPI', 'DIRECTML', 'CUDA', 'METAL', 'VULKAN'] as const satisfies readonly RuntimeKind[];
const RAM_BUCKETS_MB = Object.freeze([1_024, 2_048, 4_096, 8_192, 16_384, 32_768, 65_536, 131_072]);
const VRAM_BUCKETS_MB = Object.freeze([0, 512, 1_024, 2_048, 4_096, 6_144, 8_192, 12_288, 16_384, 24_576, 32_768, 49_152]);

/**
 * Minimal privacy-conscious capability evidence for fleet policy. Raw GPU/browser/architecture/NPU
 * strings never enter this contract; RAM and VRAM are rounded down to conservative resource buckets.
 */
export class DeviceCapabilitySnapshotBuilder {
  build(profile: DeviceCapabilityProfile, runtimeCapabilities: RuntimeCapabilities, capturedAt: number): DeviceCapabilitySnapshot {
    if (!Number.isFinite(capturedAt) || capturedAt < 0) throw new Error('Capability snapshot timestamp must be finite and non-negative');
    const fleetProfile = Object.freeze({
      platform: profile.platform,
      deviceClass: profile.deviceClass,
      tier: profile.tier,
      ramMb: resourceFloor(profile.ramMb, RAM_BUCKETS_MB),
      vramMb: resourceFloor(profile.vramMb, VRAM_BUCKETS_MB),
      storageFreeBytes: profile.storageFreeBytes,
    });
    const observedSignals = POLICY_SIGNAL_KEYS.filter((key) => profile[key] !== 'UNKNOWN').map(String).sort();
    const unknownSignals = POLICY_SIGNAL_KEYS.filter((key) => profile[key] === 'UNKNOWN').map(String).sort();
    const observedRuntimes = RUNTIME_KEYS.filter((kind) => runtimeCapabilities[kind] !== 'UNKNOWN');
    const unknownRuntimes = RUNTIME_KEYS.filter((kind) => runtimeCapabilities[kind] === 'UNKNOWN');
    return immutableClone({
      schemaVersion: 1 as const,
      capturedAt,
      profile: fleetProfile,
      runtimeCapabilities,
      evidence: { observedSignals, unknownSignals, observedRuntimes, unknownRuntimes },
    });
  }
}

function resourceFloor(value: number | 'UNKNOWN', buckets: readonly number[]): number | 'UNKNOWN' {
  if (value === 'UNKNOWN') return 'UNKNOWN';
  if (!Number.isFinite(value) || value < 0) return 'UNKNOWN';
  let floor = 0;
  for (const bucket of buckets) {
    if (bucket > value) break;
    floor = bucket;
  }
  return floor;
}
