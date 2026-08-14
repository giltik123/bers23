import type { ExecutionTarget, ModelManifest, PrivacyMode } from '../types';
export class LocalInferencePolicy {
  allow(input: Readonly<{ requested: ExecutionTarget; privacyMode: PrivacyMode; cloudAllowed: boolean; model?: ModelManifest }>): boolean {
    if (input.requested === 'BLOCKED') return true;
    if ((input.privacyMode === 'LOCAL_ONLY' || input.privacyMode === 'OFFLINE_ONLY') && (input.requested === 'CLOUD' || input.requested === 'HYBRID')) return false;
    if (!input.cloudAllowed && (input.requested === 'CLOUD' || input.requested === 'HYBRID')) return false;
    if (input.requested === 'LOCAL' || input.requested === 'HYBRID') return input.model?.status === 'READY';
    return true;
  }
}
