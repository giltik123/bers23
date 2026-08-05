import type { AnalyticsAdapter, TelemetryProperties } from './AnalyticsAdapter';
/** Tracks operation timings through an injected adapter. */
export class PerformanceTracker { constructor(private readonly adapter: AnalyticsAdapter) {} /** Records duration. */ timing(name: string, durationMs: number, properties?: TelemetryProperties): void { void this.adapter.timing(name, durationMs, properties); } }
