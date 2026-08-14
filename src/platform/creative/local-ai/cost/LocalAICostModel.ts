import { immutableClone } from '../immutable';
import type { ModelManifest } from '../types';
export class LocalAICostModel {
  estimate(model: ModelManifest | undefined, cloudCredits: number, privacyValue: number) {
    const energyCost = model ? (1 - model.energyScore) * model.estimatedLatency / 1_000 : 0;
    const resourceCost = model ? model.requiredRam / 1024 + model.requiredVram / 1024 : 0;
    const localCost = energyCost + resourceCost;
    return immutableClone({ localCost, cloudCredits, latency: model?.estimatedLatency ?? 0, energyCost, resourceCost, privacyValue, preferred: model && localCost - privacyValue < cloudCredits ? 'LOCAL' as const : 'CLOUD' as const });
  }
}
