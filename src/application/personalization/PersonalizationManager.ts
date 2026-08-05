import {
  assertPersonalizationAccess,
  createPersonalizationPreferenceId,
  createPersonalizationProfileId,
  immutable,
  type PersonalizationContext,
  type PersonalizationDebugSnapshot,
  type PersonalizationPreference,
  type PersonalizationProfile,
  type PersonalizationRecommendations,
  type PersonalizationSecurityScope,
  type PersonalizationSignal,
} from './PersonalizationModel';
import { PersonalizationDebugger } from './PersonalizationDebugger';
import { PersonalizationRecommendationEngine } from './PersonalizationRecommendationEngine';
import { PersonalizationSignalProcessor } from './PersonalizationSignalProcessor';

export interface CreatePersonalizationProfileInput extends PersonalizationSecurityScope {
  readonly id?: string;
}

export interface UpdatePersonalizationProfileInput {
  readonly preferences?: readonly PersonalizationPreference[];
  readonly styleProfile?: Readonly<Record<string, unknown>>;
  readonly workflowPreferences?: Readonly<Record<string, unknown>>;
  readonly interactionPreferences?: Readonly<Record<string, unknown>>;
}

export class PersonalizationManager {
  readonly #profiles = new Map<string, PersonalizationProfile>();
  readonly #signals = new Map<string, PersonalizationSignal[]>();
  readonly #processor = new PersonalizationSignalProcessor();
  readonly #recommendations = new PersonalizationRecommendationEngine();
  readonly #debugger = new PersonalizationDebugger();

  create(input: CreatePersonalizationProfileInput): PersonalizationProfile {
    const now = this.#now();
    const profile = immutable({
      id: input.id || createPersonalizationProfileId(),
      userId: input.userId,
      tenantId: input.tenantId,
      preferences: [],
      styleProfile: {},
      workflowPreferences: {},
      interactionPreferences: {},
      confidence: 0,
      createdAt: now,
      updatedAt: now,
    });

    this.#profiles.set(profile.id, profile);
    this.#signals.set(profile.id, []);
    return profile;
  }

  get(id: string, scope: PersonalizationSecurityScope): PersonalizationProfile {
    return this.#secure(id, scope);
  }

  update(id: string, update: UpdatePersonalizationProfileInput, scope: PersonalizationSecurityScope): PersonalizationProfile {
    const profile = this.#secure(id, scope);
    return this.#replace({
      ...profile,
      preferences: update.preferences ? [...update.preferences] : profile.preferences,
      styleProfile: update.styleProfile ? { ...update.styleProfile } : profile.styleProfile,
      workflowPreferences: update.workflowPreferences ? { ...update.workflowPreferences } : profile.workflowPreferences,
      interactionPreferences: update.interactionPreferences ? { ...update.interactionPreferences } : profile.interactionPreferences,
      confidence: this.#confidence(update.preferences || profile.preferences),
      updatedAt: this.#now(),
    });
  }

  applySignal(id: string, signal: PersonalizationSignal, scope: PersonalizationSecurityScope): PersonalizationProfile {
    const profile = this.#secure(id, scope);
    assertPersonalizationAccess(signal, scope);
    const preference = this.#toPreference(signal, profile.preferences.find((item) => item.key === signal.key));
    const preferences = [
      ...profile.preferences.filter((item) => item.key !== signal.key),
      preference,
    ];
    const nextProfile = this.#replace({
      ...profile,
      preferences,
      styleProfile: signal.category === 'STYLE' ? { ...profile.styleProfile, [signal.key]: signal.value } : profile.styleProfile,
      workflowPreferences: signal.category === 'WORKFLOW' ? { ...profile.workflowPreferences, [signal.key]: signal.value } : profile.workflowPreferences,
      interactionPreferences: signal.category === 'INTERACTION' ? { ...profile.interactionPreferences, [signal.key]: signal.value } : profile.interactionPreferences,
      confidence: this.#confidence(preferences),
      updatedAt: this.#now(),
    });

    this.#signals.set(id, [...(this.#signals.get(id) || []), signal]);
    return nextProfile;
  }

  processContext(id: string, context: PersonalizationContext, scope: PersonalizationSecurityScope): PersonalizationProfile {
    this.#secure(id, scope);
    assertPersonalizationAccess(context, scope);
    let profile = this.get(id, scope);

    for (const signal of this.#processor.process(context)) {
      profile = this.applySignal(id, signal, scope);
    }

    return profile;
  }

  recommend(id: string, scope: PersonalizationSecurityScope): PersonalizationRecommendations {
    const profile = this.#secure(id, scope);
    return this.#recommendations.recommend(profile.preferences, profile.confidence);
  }

  inspect(id: string, scope: PersonalizationSecurityScope): PersonalizationProfile {
    return this.#secure(id, scope);
  }

  debug(id: string, scope: PersonalizationSecurityScope): PersonalizationDebugSnapshot {
    const profile = this.#secure(id, scope);
    return this.#debugger.snapshot(profile, this.#signals.get(id) || [], this.recommend(id, scope));
  }

  #toPreference(signal: PersonalizationSignal, current?: PersonalizationPreference): PersonalizationPreference {
    const confidence = Math.min(0.95, Math.max(0, (current?.confidence || 0) + signal.confidenceDelta));
    return immutable({
      id: current?.id || createPersonalizationPreferenceId(),
      category: signal.category,
      key: signal.key,
      value: signal.value,
      confidence,
      evidence: [...(current?.evidence || []), ...signal.evidence],
      updatedAt: this.#now(),
    });
  }

  #confidence(preferences: readonly PersonalizationPreference[]): number {
    if (preferences.length === 0) {
      return 0;
    }

    const total = preferences.reduce((sum, preference) => sum + preference.confidence, 0);
    return Math.min(0.95, total / preferences.length);
  }

  #secure(id: string, scope: PersonalizationSecurityScope): PersonalizationProfile {
    const profile = this.#profiles.get(id);

    if (!profile) {
      throw new Error('Personalization profile not found.');
    }

    assertPersonalizationAccess(profile, scope);
    return profile;
  }

  #replace(profile: PersonalizationProfile): PersonalizationProfile {
    const frozen = immutable(profile);
    this.#profiles.set(profile.id, frozen);
    return frozen;
  }

  #now(): string {
    return new Date().toISOString();
  }
}
