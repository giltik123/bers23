import { immutable, type PersonalizationPreference, type PersonalizationRecommendations } from './PersonalizationModel';

export class PersonalizationRecommendationEngine {
  recommend(preferences: readonly PersonalizationPreference[], profileConfidence: number): PersonalizationRecommendations {
    const workflowHints: string[] = [];
    const qualityHints: string[] = [];
    const styleHints: string[] = [];
    const interactionHints: string[] = [];

    for (const preference of preferences) {
      if (preference.category === 'WORKFLOW') {
        workflowHints.push(`Prefer workflow: ${String(preference.value)}.`);
      }

      if (preference.category === 'QUALITY') {
        qualityHints.push(`Apply quality preference ${preference.key}: ${String(preference.value)}.`);
      }

      if (preference.category === 'STYLE') {
        styleHints.push(`Use style preference ${preference.key}: ${String(preference.value)}.`);
      }

      if (preference.category === 'INTERACTION') {
        interactionHints.push(`Use interaction preference ${preference.key}: ${String(preference.value)}.`);
      }
    }

    return immutable({
      workflowHints,
      qualityHints,
      styleHints,
      interactionHints,
      confidence: profileConfidence,
    });
  }
}
