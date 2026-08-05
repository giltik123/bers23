import type { AnalyticsAdapter, TelemetryProperties } from './AnalyticsAdapter';
/** Tracks product events through an injected adapter. */
export class EventTracker { constructor(private readonly adapter: AnalyticsAdapter) {} /** Tracks one event. */ track(event: string, properties?: TelemetryProperties): void { void this.adapter.track(event, properties); } }
