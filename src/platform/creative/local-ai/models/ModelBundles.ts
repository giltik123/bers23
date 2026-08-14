import { immutableClone } from '../immutable';
import type { DeviceCapabilityProfile, ModelBundle, ModelManifest, RuntimeCapabilities } from '../types';

const category = (model: ModelManifest) => model.capabilities.map((item) => item.toLowerCase()).join(' ');
export class ModelBundleBuilder {
  recommend(device: DeviceCapabilityProfile, runtimes: RuntimeCapabilities, catalog: readonly ModelManifest[]): ModelBundle {
    const id: ModelBundle['id'] = device.deviceClass === 'BROWSER' ? 'BROWSER' : device.deviceClass === 'MOBILE' ? device.tier === 'LOW' ? 'MOBILE_LOW' : 'MOBILE_HIGH' : (runtimes.CUDA === true || runtimes.METAL === true || runtimes.DIRECTML === true) && device.tier === 'HIGH' ? 'DESKTOP_GPU' : 'DESKTOP_STANDARD';
    const allowed = id === 'MOBILE_LOW' ? ['analysis', 'ocr'] : id === 'MOBILE_HIGH' ? ['analysis', 'ocr', 'segment', 'upscale', 'reason'] : ['analysis', 'ocr', 'segment', 'upscale', 'reason'];
    const compatible = catalog.filter((model) => model.supportedPlatforms.includes(device.platform) && allowed.some((cap) => category(model).includes(cap)) && runtimeAvailable(model, runtimes));
    const modelIds = compatible.sort((a, b) => a.sizeBytes - b.sizeBytes || a.modelId.localeCompare(b.modelId)).map((model) => model.modelId);
    return immutableClone({ id, modelIds, estimatedBytes: compatible.reduce((sum, model) => sum + model.sizeBytes, 0), reasoning: allowed.includes('reason') ? id === 'MOBILE_HIGH' || id === 'BROWSER' ? 'LIMITED' : 'YES' : 'NO', generation: 'NO' });
  }
}
function runtimeAvailable(model: ModelManifest, runtimes: RuntimeCapabilities): boolean { return model.supportedAccelerators.some((runtime) => runtimes[runtime] === true); }
