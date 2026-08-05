/** Public telemetry API. All default integrations are intentionally inert. */
export * from './AnalyticsAdapter';
export * from './CrashReporter';
export * from './EventTracker';
export * from './PerformanceTracker';
export * from './TelemetryManager';

import { NoopAnalyticsAdapter } from './AnalyticsAdapter';
import { TelemetryManager } from './TelemetryManager';
/** Default inert telemetry manager composed at the module boundary. */
export const telemetry = new TelemetryManager(new NoopAnalyticsAdapter());
