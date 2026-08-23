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
  let score = 0; let observations = 0;
  if (signal.cpuCores !== undefined) { observations++; score += signal.cpuCores >= 16 ? 3 : signal.cpuCores >= 8 ? 2 : signal.cpuCores >= 4 ? 1 : 0; }
  if (signal.ramMb !== undefined) { observations++; score += signal.ramMb >= 32768 ? 3 : signal.ramMb >= 16384 ? 2 : signal.ramMb >= 8192 ? 1 : 0; }
  if (signal.vramMb !== undefined) { observations++; score += signal.vramMb >= 16384 ? 3 : signal.vramMb >= 8192 ? 2 : signal.vramMb >= 2048 ? 1 : 0; }
  const acceleratorSignals = [signal.webgpu, signal.webnn, signal.cuda, signal.directml, signal.metal, signal.vulkan];
  const acceleratorObserved = acceleratorSignals.some(value => value === true || value === false);
  if (acceleratorObserved) { observations++; score += acceleratorSignals.some(value => value === true) ? 2 : 0; }
  if (signal.storageFreeBytes !== undefined) { observations++; score += signal.storageFreeBytes >= 100e9 ? 2 : signal.storageFreeBytes >= 20e9 ? 1 : 0; }
  if (!observations) return 'UNKNOWN';
  const average = score / observations;
  return average >= 2.5 ? 'EXTREME' : average >= 1.6 ? 'HIGH' : average >= 0.7 ? 'MEDIUM' : 'LOW';
}
