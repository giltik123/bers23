/** Infrastructure feature flags. */
export interface FeatureConfig {
  readonly telemetry: boolean;
  readonly remoteLogging: boolean;
}

/** Foundation defaults; integrations remain disabled until explicitly wired. */
export const featureConfig: FeatureConfig = Object.freeze({
  telemetry: false,
  remoteLogging: false,
});

/** Runtime-overridable typed feature-flag collection. */
export class FeatureFlags<Flags extends Record<string, boolean> = Record<string, boolean>> {
  private readonly overrides = new Map<keyof Flags, boolean>();
  constructor(private readonly defaults: Readonly<Flags>) {}
  /** Reads the effective state of a feature. */
  isEnabled<Key extends keyof Flags>(key: Key): boolean { return this.overrides.get(key) ?? this.defaults[key]; }
  /** Overrides a feature for the current runtime. */
  set<Key extends keyof Flags>(key: Key, enabled: boolean): void { this.overrides.set(key, enabled); }
  /** Clears one override or all runtime overrides. */
  reset<Key extends keyof Flags>(key?: Key): void { if (key === undefined) this.overrides.clear(); else this.overrides.delete(key); }
  /** Returns an immutable effective flag snapshot. */
  snapshot(): Readonly<Flags> { return Object.freeze(Object.fromEntries(Object.keys(this.defaults).map((key) => [key, this.isEnabled(key)])) as Flags); }
}
