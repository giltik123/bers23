export type PersonalizationPreferenceCategory = 'STYLE' | 'WORKFLOW' | 'QUALITY' | 'SPEED' | 'COST' | 'INTERACTION';
export type PersonalizationSignalSource = 'feedback' | 'memory_proposal' | 'workflow_history' | 'interaction_history';

export interface PersonalizationSecurityScope {
  readonly userId: string;
  readonly tenantId: string;
}

export interface PersonalizationPreference {
  readonly id: string;
  readonly category: PersonalizationPreferenceCategory;
  readonly key: string;
  readonly value: unknown;
  readonly confidence: number;
  readonly evidence: readonly string[];
  readonly updatedAt: string;
}

export interface PersonalizationSignal extends PersonalizationSecurityScope {
  readonly id: string;
  readonly source: PersonalizationSignalSource;
  readonly category: PersonalizationPreferenceCategory;
  readonly key: string;
  readonly value: unknown;
  readonly confidenceDelta: number;
  readonly reason: string;
  readonly evidence: readonly string[];
}

export interface PersonalizationContext extends PersonalizationSecurityScope {
  readonly feedbackSignals?: readonly Readonly<Record<string, unknown>>[];
  readonly memoryProposals?: readonly Readonly<Record<string, unknown>>[];
  readonly workflowHistory?: readonly string[];
  readonly interactionHistory?: readonly string[];
}

export interface PersonalizationProfile extends PersonalizationSecurityScope {
  readonly id: string;
  readonly preferences: readonly PersonalizationPreference[];
  readonly styleProfile: Readonly<Record<string, unknown>>;
  readonly workflowPreferences: Readonly<Record<string, unknown>>;
  readonly interactionPreferences: Readonly<Record<string, unknown>>;
  readonly confidence: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PersonalizationRecommendations {
  readonly workflowHints: readonly string[];
  readonly qualityHints: readonly string[];
  readonly styleHints: readonly string[];
  readonly interactionHints: readonly string[];
  readonly confidence: number;
}

export interface PersonalizationDebugSnapshot {
  readonly user: Readonly<{ id: string }>;
  readonly signals: readonly PersonalizationSignal[];
  readonly preferences: readonly PersonalizationPreference[];
  readonly confidence: number;
  readonly recommendations: PersonalizationRecommendations;
}

export const createPersonalizationProfileId = () => `personalization_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const createPersonalizationPreferenceId = () => `preference_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const createPersonalizationSignalId = () => `personalization_signal_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function assertPersonalizationAccess(profile: PersonalizationSecurityScope, scope: PersonalizationSecurityScope): void {
  if (profile.userId !== scope.userId || profile.tenantId !== scope.tenantId) {
    throw new Error('Personalization access denied: userId and tenantId are required to match.');
  }
}

export function immutable<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    immutable((value as Record<string, unknown>)[key]);
  }

  return Object.freeze(value);
}
