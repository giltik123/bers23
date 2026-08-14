import { immutableClone } from '../immutable';
import type { LocalAISnapshot } from '../types';
export class LocalAIDebugger {
  inspect(snapshot: LocalAISnapshot) { return immutableClone({ operation: snapshot.timeline.find((event) => event.event.startsWith('operation:'))?.event.slice(10), device: snapshot.deviceProfile, capabilities: snapshot.runtimeCapabilities, candidateModels: snapshot.installedModels.map((item) => item.modelId), trustValidation: snapshot.trustStatus, resourceCheck: snapshot.resourceDecision, privacyPolicy: snapshot.privacyPolicy, decision: snapshot.executionTarget, selectedRuntime: snapshot.selectedModel?.runtime, fallback: snapshot.fallback }); }
  explain(snapshot: LocalAISnapshot): string { return `Device detected: ${snapshot.deviceProfile.deviceClass} ${snapshot.deviceProfile.tier}. Selected model: ${snapshot.selectedModel?.modelId ?? 'none'}. Execution: ${snapshot.executionTarget}. Reason: ${snapshot.resourceDecision.allowed ? 'resources and policy satisfied' : snapshot.resourceDecision.reasons.join(', ')}.`; }
}
