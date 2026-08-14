import { immutableClone } from '../immutable';
import type { DeviceCapabilityProfile, ExecutionProvider, ModelManifest, ResourceDecision, RuntimeCapabilities } from '../types';
import { ResourceGovernor } from '../selection/ResourceGovernor';
abstract class CapabilityRuntime {
  abstract readonly kind: 'BROWSER' | 'MOBILE' | 'DESKTOP';
  supports(model: ModelManifest, device: DeviceCapabilityProfile, capabilities: RuntimeCapabilities): boolean {
    return model.supportedPlatforms.includes(device.platform) && capabilities[model.runtime] === true;
  }
  prepare(model: ModelManifest, device: DeviceCapabilityProfile): ResourceDecision { return new ResourceGovernor().evaluate(device, model); }
}
export class BrowserLocalRuntime extends CapabilityRuntime {
  readonly kind = 'BROWSER' as const;
  override supports(model: ModelManifest, device: DeviceCapabilityProfile, capabilities: RuntimeCapabilities): boolean {
    return device.deviceClass === 'BROWSER' && ['WEBGPU', 'WASM'].includes(model.runtime) && super.supports(model, device, capabilities);
  }
}
export class WebLocalRuntime extends BrowserLocalRuntime {
  selectProvider(capabilities: RuntimeCapabilities): ExecutionProvider | 'BLOCKED' { return capabilities.WEBGPU === true ? 'webgpu' : capabilities.WASM === true ? 'wasm' : 'BLOCKED'; }
}
export class MobileLocalRuntime extends CapabilityRuntime {
  readonly kind = 'MOBILE' as const;
  override supports(model: ModelManifest, device: DeviceCapabilityProfile, capabilities: RuntimeCapabilities): boolean {
    return device.deviceClass === 'MOBILE' && ['ANDROID', 'IOS'].includes(device.platform) && super.supports(model, device, capabilities);
  }
  override prepare(model: ModelManifest, device: DeviceCapabilityProfile): ResourceDecision {
    const base = super.prepare(model, device); const reasons = [...base.reasons];
    if (device.powerState === 'BATTERY' && device.batteryPercent !== 'UNKNOWN' && device.batteryPercent < 25 && model.energyScore < 0.7) reasons.push('Mobile energy budget exceeded');
    return immutableClone({ allowed: reasons.length === 0, reasons, suggestedTarget: reasons.length ? 'CLOUD' : 'LOCAL' });
  }
  selectProvider(device: DeviceCapabilityProfile, capabilities: RuntimeCapabilities): ExecutionProvider | 'BLOCKED' {
    if (this.prepare({ requiredRam: 0, requiredVram: 0, sizeBytes: 0, energyScore: 1 } as ModelManifest, device).allowed === false) return 'BLOCKED';
    if (device.platform === 'ANDROID' && capabilities.NNAPI === true) return 'nnapi';
    if (device.platform === 'IOS' && capabilities.METAL === true) return 'coreml';
    return capabilities.ONNX_RUNTIME === true ? 'cpu' : 'BLOCKED';
  }
}
export class DesktopLocalRuntime extends CapabilityRuntime {
  readonly kind = 'DESKTOP' as const;
  override supports(model: ModelManifest, device: DeviceCapabilityProfile, capabilities: RuntimeCapabilities): boolean {
    return device.deviceClass === 'DESKTOP' && super.supports(model, device, capabilities);
  }
  selectProvider(device: DeviceCapabilityProfile, capabilities: RuntimeCapabilities): ExecutionProvider | 'BLOCKED' {
    if (capabilities.CUDA === true) return 'cuda';
    if (device.platform === 'WINDOWS' && capabilities.DIRECTML === true) return 'dml';
    if (device.platform === 'MACOS' && capabilities.METAL === true) return 'coreml';
    return capabilities.ONNX_RUNTIME === true ? 'cpu' : 'BLOCKED';
  }
}
