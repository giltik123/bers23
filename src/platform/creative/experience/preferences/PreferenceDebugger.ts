import type { PreferenceProfile } from './types';

export class PreferenceDebugger {
  debug(profile: PreferenceProfile): string {
    const lines = [`User:${profile.userId}`, '|', 'Signals', '|', 'Categories', '|', 'Preferences', '|', 'Confidence', '|', 'Evidence'];
    const byCategory = new Map<string, typeof profile.preferences>();
    for (const preference of profile.preferences) byCategory.set(preference.category, [...(byCategory.get(preference.category) ?? []), preference]);
    for (const [category, preferences] of byCategory) {
      lines.push(category);
      for (const preference of preferences) lines.push(` ${preference.value} confidence ${preference.confidence} evidence ${preference.evidenceCount}`);
    }
    return lines.join('\n');
  }
}
