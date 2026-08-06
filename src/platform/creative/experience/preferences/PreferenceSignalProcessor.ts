import { CreativePreferenceSignal } from './CreativePreferenceSignal';
import { PreferenceProfile } from './PreferenceProfile';
import type { CreativePreferenceSignal as CreativePreferenceSignalShape, PreferenceAccessContext, PreferenceEntry, PreferenceProfile as PreferenceProfileShape } from './types';

const clamp = (value: number): number => Math.max(0, Math.min(1, Number(value.toFixed(2))));

export class PreferenceSignalProcessor {
  private readonly factory = new PreferenceProfile();
  private readonly signalSecurity = new CreativePreferenceSignal();
  private readonly profiles = new Map<string, PreferenceProfileShape>();

  process(signal: CreativePreferenceSignalShape, context: PreferenceAccessContext = signal): PreferenceProfileShape {
    if (!this.signalSecurity.canAccess(signal, context)) throw new Error('Preference signal access denied');
    const key = this.key(signal.userId, signal.tenantId);
    const existing = this.profiles.get(key) ?? this.factory.create({ id: `profile:${signal.tenantId}:${signal.userId}`, userId: signal.userId, tenantId: signal.tenantId, createdAt: signal.createdAt });
    const next = this.apply(existing, signal);
    this.profiles.set(key, next);
    return next;
  }

  getProfile(userId: string, tenantId: string): PreferenceProfileShape | undefined {
    const profile = this.profiles.get(this.key(userId, tenantId));
    return profile ? this.factory.snapshot(profile) : undefined;
  }

  private apply(profile: PreferenceProfileShape, signal: CreativePreferenceSignalShape): PreferenceProfileShape {
    const preferences = [...profile.preferences];
    const index = preferences.findIndex((preference) => preference.category === signal.category && preference.value === signal.value);
    const delta = signal.signalType === 'REJECTED' ? -signal.confidenceDelta : signal.confidenceDelta;
    const repeatBonus = index >= 0 && signal.signalType !== 'REJECTED' ? 0.05 : 0;
    if (index === -1) preferences.push(this.entry(signal, clamp(0.5 + delta)));
    else preferences[index] = { ...preferences[index], confidence: clamp(preferences[index].confidence + delta + repeatBonus), evidenceCount: preferences[index].evidenceCount + 1, lastUpdated: signal.createdAt };
    return this.factory.snapshot({ ...profile, preferences, updatedAt: signal.createdAt });
  }

  private entry(signal: CreativePreferenceSignalShape, confidence: number): PreferenceEntry {
    return { category: signal.category, value: signal.value, confidence, evidenceCount: 1, firstSeen: signal.createdAt, lastUpdated: signal.createdAt };
  }

  private key(userId: string, tenantId: string): string { return `${tenantId}:${userId}`; }
}
