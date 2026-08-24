import { immutableClone } from '../immutable';
import type { RuntimeCapabilities, TargetDecision, TargetRequest } from '../types';
import { LocalInferencePolicy } from '../policy/LocalInferencePolicy';
import { ModelSuitabilityScorer } from './ModelSuitabilityScorer';
import { ResourceGovernor } from './ResourceGovernor';
export class ExecutionTargetSelector {
  constructor(private readonly runtimes: RuntimeCapabilities) {}
  select(request: TargetRequest): TargetDecision {
    const scorer = new ModelSuitabilityScorer(); const candidates = request.models.map((model) => scorer.score(model, request.operation.requiredCapabilities, request.device, this.runtimes)).sort((a, b) => b.score - a.score || a.modelId.localeCompare(b.modelId));
    const bestScore = candidates.find((item) => item.eligible); const model = bestScore && request.models.find((item) => item.modelId === bestScore.modelId);
    const resource = model ? new ResourceGovernor().evaluate(request.device, model, request.concurrentJobs, request.privacyMode) : immutableClone({ allowed: false, reasons: ['No eligible local model'], suggestedTarget: request.privacyMode === 'LOCAL_ONLY' || request.privacyMode === 'OFFLINE_ONLY' ? 'BLOCKED' as const : 'CLOUD' as const });
    const cloudUsable = request.cloudAllowed && request.device.network !== 'OFFLINE' && request.privacyMode !== 'LOCAL_ONLY' && request.privacyMode !== 'OFFLINE_ONLY' && request.cloudCredits <= request.maxCloudCredits;
    const localUsable = Boolean(model && resource.allowed && model.qualityScore >= request.qualityRequirement && model.estimatedLatency <= request.latencyRequirement);
    const policy = request.operation.executionPolicy ?? 'AUTO';
    let target: TargetDecision['target'];
    if (policy === 'LOCAL_ONLY') target = localUsable ? 'LOCAL' : 'BLOCKED';
    else if (policy === 'CLOUD_PREFERRED') target = cloudUsable ? 'CLOUD' : localUsable ? 'LOCAL' : 'BLOCKED';
    else target = localUsable ? 'LOCAL' : cloudUsable ? 'CLOUD' : 'BLOCKED';
    if (!new LocalInferencePolicy().allow({ requested: target, privacyMode: request.privacyMode, cloudAllowed: request.cloudAllowed, model })) target = 'BLOCKED';
    return immutableClone({
      target,
      model: target === 'LOCAL' || target === 'HYBRID' ? model : undefined,
      reason: target === 'BLOCKED'
        ? resource.reasons.join('; ') || 'Execution policy blocked all targets'
        : target === 'CLOUD'
          ? policy === 'CLOUD_PREFERRED' ? 'Cloud was explicitly preferred by the canonical policy' : 'Local requirements were not met; cloud target is permitted by the current canonical policy'
          : `Selected ${model!.modelId}: compatible resources, privacy, quality and latency`,
      // A LOCAL decision never carries a ready-to-execute cloud fallback. Any later cloud
      // transition requires a new canonical decision/user policy and normal billing authority.
      fallback: null,
      resource,
      candidates,
    });
  }
}
