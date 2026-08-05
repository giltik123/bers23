import {
  immutable,
  type PersonalizationDebugSnapshot,
  type PersonalizationProfile,
  type PersonalizationRecommendations,
  type PersonalizationSignal,
} from './PersonalizationModel';

export class PersonalizationDebugger {
  snapshot(
    profile: PersonalizationProfile,
    signals: readonly PersonalizationSignal[],
    recommendations: PersonalizationRecommendations,
  ): PersonalizationDebugSnapshot {
    return immutable({
      user: { id: profile.userId },
      signals: [...signals],
      preferences: [...profile.preferences],
      confidence: profile.confidence,
      recommendations,
    });
  }
}
