/** Plain configuration object handled by the loader. */
export type ConfigurationRecord = Record<string, unknown>;
/** Source capable of supplying partial configuration. */
export interface ConfigSource<T extends ConfigurationRecord> { load(): Partial<T> | Promise<Partial<T>>; }

/** Loads configuration sources in order and applies runtime overrides last. */
export class ConfigLoader<T extends ConfigurationRecord> {
  private runtimeOverrides: Partial<T> = {};
  constructor(private readonly defaults: T, private readonly sources: readonly ConfigSource<T>[] = []) {}
  /** Loads and merges all configured sources. */
  async load(): Promise<Readonly<T>> { let result = { ...this.defaults }; for (const source of this.sources) result = { ...result, ...await source.load() }; return Object.freeze({ ...result, ...this.runtimeOverrides }); }
  /** Applies values that take precedence for the current process. */
  override(values: Partial<T>): void { this.runtimeOverrides = { ...this.runtimeOverrides, ...values }; }
  /** Removes all runtime overrides. */
  clearOverrides(): void { this.runtimeOverrides = {}; }
}
