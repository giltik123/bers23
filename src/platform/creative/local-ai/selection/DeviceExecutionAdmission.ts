import { DeviceAnalyzer } from '../device/DeviceAnalyzer';
import { LocalRuntimeDetector } from '../device/LocalRuntimeDetector';
import { immutableClone } from '../immutable';
import type { DeviceCapabilityProfile, DeviceProvider, ModelManifest, PrivacyMode, ResourceDecision, RuntimeCapabilities, RuntimeProbe, SuitabilityScore } from '../types';
import { ModelSuitabilityScorer } from './ModelSuitabilityScorer';
import { ResourceGovernor } from './ResourceGovernor';

export type DeviceExecutionAdmissionDecision =
  | Readonly<{ allowed: true; device: DeviceCapabilityProfile; runtimes: RuntimeCapabilities; suitability: SuitabilityScore; resource: ResourceDecision; model: ModelManifest }>
  | Readonly<{ allowed: false; device: DeviceCapabilityProfile; runtimes: RuntimeCapabilities; suitability: SuitabilityScore; resource: ResourceDecision; model: ModelManifest; reasons: readonly string[] }>;

/** Advisory hardware/model gate. It grants no Core scope, Artifact, Billing, or provider authority. */
export class DeviceExecutionAdmission {
  constructor(private readonly deviceProvider: DeviceProvider, private readonly runtimeProbe: RuntimeProbe) {}

  async admit(model: ModelManifest, requiredCapabilities: readonly string[], privacyMode: PrivacyMode = 'LOCAL_ONLY'): Promise<DeviceExecutionAdmissionDecision> {
    const base = await new DeviceAnalyzer(this.deviceProvider).analyze();
    const runtimes = await new LocalRuntimeDetector(this.runtimeProbe).detect();
    const device = immutableClone({ ...base, runtimeCapabilities: runtimes }) as DeviceCapabilityProfile;
    const suitability = new ModelSuitabilityScorer().score(model, requiredCapabilities, device, runtimes);
    const resource = new ResourceGovernor().evaluate(device, model, 0, privacyMode);
    const reasons = Object.freeze([...new Set([...suitability.reasons, ...resource.reasons])]);
    if (!suitability.eligible || !resource.allowed) return immutableClone({ allowed: false as const, device, runtimes, suitability, resource, model, reasons });
    return immutableClone({ allowed: true as const, device, runtimes, suitability, resource, model });
  }
}
