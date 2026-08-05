import type { AnalyticsAdapter, TelemetryProperties } from './AnalyticsAdapter';
/** Reports exceptions through an injected analytics adapter. */
export class CrashReporter { constructor(private readonly adapter: AnalyticsAdapter) {} /** Reports one exception. */ exception(error: unknown, properties?: TelemetryProperties): void { void this.adapter.exception(error, properties); } }
