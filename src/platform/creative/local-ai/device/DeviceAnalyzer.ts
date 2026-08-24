import { immutableClone } from '../immutable';
import type { DeviceCapabilityProfile, DeviceProvider, DeviceSignals, DeviceTier } from '../types';

const unknown = <T>(value: T | undefined): T | 'UNKNOWN' => value === undefined ? 'UNKNOWN' : value;

export class DeviceAnalyzer {
  constructor(private readonly provider: DeviceProvider) {}

  async analyze(): Promise<DeviceCapabilityProfile> {
    const signal = await this.provider.signals();
    return immutableClone({
      platform: unknown(signal.platform), deviceClass: unknown(signal.deviceClass), cpuCores: unknown(signal.cpuCores), ramMb: unknown(signal.ramMb),
      gpu: unknown(signal.gpu), vramMb: unknown(signal.vramMb), npu: unknown(signal.npu), architecture: unknown(signal.architecture),
      browser: unknown(signal.browser), webgpu: unknown(signal.webgpu), wasm: unknown(signal.wasm), webnn: unknown(signal.webnn), nnapi: unknown(signal.nnapi),
      cuda: unknown(signal.cuda), directml: unknown(signal.directml), metal: unknown(signal.metal), vulkan: unknown(signal.vulkan),
      storageFreeBytes: unknown(signal.storageFreeBytes), batteryPercent: unknown(signal.batteryPercent), powerState: unknown(signal.powerState),
      thermalState: unknown(signal.thermalState), network: unknown(signal.network), tier: tier(signal),
      ramPressure: unknown(signal.ramPressure), backgroundRestricted: unknown(signal.backgroundRestricted),
    });
  }
}

function tier(signal: DeviceSignals): DeviceTier {
  // CPU and RAM are essential evidence for a general local-model device tier. Disk capacity is
  // intentionally excluded: large storage does not imply compute capability.
  if (!finitePositive(signal.cpuCores) || !finitePositive(signal.ramMb)) return 'UNKNOWN';

  const accelerated = [signal.webgpu, signal.webnn, signal.nnapi, signal.cuda, signal.directml, signal.metal, signal.vulkan]
    .some((value) => value === true);
  const knownVram = finiteNonNegative(signal.vramMb) ? signal.vramMb : undefined;

  if (signal.cpuCores >= 16 && signal.ramMb >= 32_768 && knownVram !== undefined && knownVram >= 16_384) return 'EXTREME';
  if (signal.cpuCores >= 8 && signal.ramMb >= 16_384 && (accelerated || (knownVram !== undefined && knownVram >= 4_096))) return 'HIGH';
  if (signal.cpuCores >= 4 && signal.ramMb >= 8_192) return 'MEDIUM';
  return 'LOW';
}

function finitePositive(value: number | undefined): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
function finiteNonNegative(value: number | undefined): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
