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
      browser: unknown(signal.browser), webgpu: unknown(signal.webgpu), wasm: unknown(signal.wasm), webnn: unknown(signal.webnn),
      cuda: unknown(signal.cuda), directml: unknown(signal.directml), metal: unknown(signal.metal), vulkan: unknown(signal.vulkan),
      storageFreeBytes: unknown(signal.storageFreeBytes), batteryPercent: unknown(signal.batteryPercent), powerState: unknown(signal.powerState),
      thermalState: unknown(signal.thermalState), network: unknown(signal.network), tier: tier(signal),
      ramPressure: unknown(signal.ramPressure), backgroundRestricted: unknown(signal.backgroundRestricted),
    });
  }
}

function tier(signal: DeviceSignals): DeviceTier {
  const scores: number[] = [];
  if (finitePositive(signal.cpuCores)) scores.push(signal.cpuCores >= 16 ? 3 : signal.cpuCores >= 8 ? 2 : signal.cpuCores >= 4 ? 1 : 0);
  if (finiteNonNegative(signal.ramMb)) scores.push(signal.ramMb >= 32_768 ? 3 : signal.ramMb >= 16_384 ? 2 : signal.ramMb >= 8_192 ? 1 : 0);
  if (finiteNonNegative(signal.vramMb)) scores.push(signal.vramMb >= 16_384 ? 3 : signal.vramMb >= 8_192 ? 2 : signal.vramMb >= 2_048 ? 1 : 0);

  const acceleratorSignals = [signal.webgpu, signal.webnn, signal.cuda, signal.directml, signal.metal, signal.vulkan]
    .filter((value): value is boolean => value === true || value === false);
  if (acceleratorSignals.length > 0) scores.push(acceleratorSignals.some(Boolean) ? 2 : 0);

  if (finiteNonNegative(signal.storageFreeBytes)) scores.push(signal.storageFreeBytes >= 100e9 ? 2 : signal.storageFreeBytes >= 20e9 ? 1 : 0);

  // A single observation is not enough evidence to classify the whole device. UNKNOWN is
  // intentionally distinct from LOW so policy never treats missing telemetry as weak hardware.
  if (scores.length < 2) return 'UNKNOWN';
  const average = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return average >= 2.5 ? 'EXTREME' : average >= 1.6 ? 'HIGH' : average >= 0.7 ? 'MEDIUM' : 'LOW';
}

function finitePositive(value: number | undefined): value is number { return typeof value === 'number' && Number.isFinite(value) && value > 0; }
function finiteNonNegative(value: number | undefined): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
