import type { PreferenceEntry, PreferenceProfile as PreferenceProfileShape } from './types';

export class PreferenceProfile {
  create(input: { id: string; userId: string; tenantId: string; createdAt: number; preferences?: PreferenceEntry[] }): PreferenceProfileShape {
    return this.snapshot({ id: input.id, userId: input.userId, tenantId: input.tenantId, preferences: input.preferences ?? [], createdAt: input.createdAt, updatedAt: input.createdAt });
  }

  snapshot(profile: PreferenceProfileShape): PreferenceProfileShape {
    const preferences = Object.freeze(profile.preferences.map((preference) => Object.freeze({ ...preference })));
    return Object.freeze({ ...profile, preferences });
  }
}
