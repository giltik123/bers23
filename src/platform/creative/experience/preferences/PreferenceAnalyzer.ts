import type { PreferenceAnalysis, PreferenceEntry, PreferenceProfile } from './types';

export class PreferenceAnalyzer {
  analyze(profile: PreferenceProfile): PreferenceAnalysis {
    const top = (category: PreferenceEntry['category']) => profile.preferences.filter((preference) => preference.category === category).sort((left, right) => right.confidence - left.confidence || right.evidenceCount - left.evidenceCount);
    const all = [...profile.preferences];
    const confidence = all.length === 0 ? 0 : Number((all.reduce((sum, preference) => sum + preference.confidence, 0) / all.length).toFixed(2));
    return { topStyles: top('STYLE'), topColors: top('COLOR'), topWorkflows: top('WORKFLOW'), confidence };
  }
}
