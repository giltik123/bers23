/** Properties accepted by telemetry calls. */
export type TelemetryProperties = Readonly<Record<string, unknown>>;

/** Adapter contract for a future analytics provider. */
export interface TelemetryAdapter {
  track(event: string, properties?: TelemetryProperties): void | Promise<void>;
  identify(userId: string, traits?: TelemetryProperties): void | Promise<void>;
  page(name: string, properties?: TelemetryProperties): void | Promise<void>;
  timing(name: string, durationMs: number, properties?: TelemetryProperties): void | Promise<void>;
  exception(error: unknown, properties?: TelemetryProperties): void | Promise<void>;
}

/** No-op adapter used until an analytics provider is selected. */
export class NoopTelemetryAdapter implements TelemetryAdapter {
  track(): void {}
  identify(): void {}
  page(): void {}
  timing(): void {}
  exception(): void {}
}

/** Provider-neutral telemetry facade. */
export class TelemetryService implements TelemetryAdapter {
  constructor(private readonly adapter: TelemetryAdapter = new NoopTelemetryAdapter()) {}

  /** Records a named product event. */
  track(event: string, properties?: TelemetryProperties): void { void this.adapter.track(event, properties); }
  /** Associates subsequent telemetry with a user. */
  identify(userId: string, traits?: TelemetryProperties): void { void this.adapter.identify(userId, traits); }
  /** Records a page view. */
  page(name: string, properties?: TelemetryProperties): void { void this.adapter.page(name, properties); }
  /** Records an operation duration in milliseconds. */
  timing(name: string, durationMs: number, properties?: TelemetryProperties): void { void this.adapter.timing(name, durationMs, properties); }
  /** Records a handled or unhandled exception. */
  exception(error: unknown, properties?: TelemetryProperties): void { void this.adapter.exception(error, properties); }
}

/** Default inert telemetry instance. */
export const telemetry = new TelemetryService();

