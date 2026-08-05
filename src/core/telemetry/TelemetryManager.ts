import type { AnalyticsAdapter, TelemetryProperties } from './AnalyticsAdapter';
/** Coordinates the complete provider-neutral telemetry API. */
export class TelemetryManager {
  constructor(private readonly adapter: AnalyticsAdapter) {}
  /** Tracks a product event. */ track(event: string, properties?: TelemetryProperties): void { void this.adapter.track(event, properties); }
  /** Associates telemetry with a user. */ identify(userId: string, traits?: TelemetryProperties): void { void this.adapter.identify(userId, traits); }
  /** Tracks a page view. */ page(name: string, properties?: TelemetryProperties): void { void this.adapter.page(name, properties); }
  /** Tracks an operation duration. */ timing(name: string, durationMs: number, properties?: TelemetryProperties): void { void this.adapter.timing(name, durationMs, properties); }
  /** Reports an exception. */ exception(error: unknown, properties?: TelemetryProperties): void { void this.adapter.exception(error, properties); }
}
/** Foundation compatibility facade name. */
export { TelemetryManager as TelemetryService };
