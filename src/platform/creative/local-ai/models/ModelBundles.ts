import { DeviceCapabilitySnapshotBuilder } from '../device/DeviceCapabilitySnapshot';
import { immutableClone } from '../immutable';
import { ModelFleetPlanner, modelFleetKey } from '../selection/ModelFleetPlanner';
import type { DeviceCapabilityProfile, ModelBundle, ModelFleetRecommendationPolicy, ModelManifest, RuntimeCapabilities } from '../types';

/**
 * Backward-compatible advisory bundle surface. It now shares the same UNKNOWN/resource/budget
 * policy as the production recommendation path. This wrapper cannot prove trust by itself;
 * LocalAIPlatform.recommendFleet/installModel remain the trust-enforcing path.
 */
export class ModelBundleBuilder {
  recommend(device: DeviceCapabilityProfile, runtimes: RuntimeCapabilities, catalog: readonly ModelManifest[], policy?: ModelFleetRecommendationPolicy): ModelBundle {
    const snapshot = new DeviceCapabilitySnapshotBuilder().build(device, runtimes, 0);
    const recommendation = new ModelFleetPlanner().recommend({
      snapshot,
      catalog,
      trustedModelKeys: catalog.map(modelFleetKey),
      storageFreeBytes: device.storageFreeBytes,
      policy,
    });
    return immutableClone({
      id: bundleId(device, runtimes),
      modelIds: recommendation.modelIds,
      estimatedBytes: recommendation.estimatedBytes,
      reasoning: 'NO' as const,
      generation: 'NO' as const,
    });
  }
}

function bundleId(device: DeviceCapabilityProfile, runtimes: RuntimeCapabilities): ModelBundle['id'] {
  if (device.deviceClass === 'BROWSER') return 'BROWSER';
  if (device.deviceClass === 'MOBILE') return device.tier === 'LOW' ? 'MOBILE_LOW' : 'MOBILE_HIGH';
  const accelerated = runtimes.CUDA === true || runtimes.METAL === true || runtimes.DIRECTML === true;
  return accelerated && (device.tier === 'HIGH' || device.tier === 'EXTREME') ? 'DESKTOP_GPU' : 'DESKTOP_STANDARD';
}
