/** Properties accepted by telemetry calls. */
export type TelemetryProperties = Readonly<Record<string, unknown>>;
/** Provider-neutral analytics adapter. */
export interface AnalyticsAdapter { track(event: string, properties?: TelemetryProperties): void | Promise<void>; identify(userId: string, traits?: TelemetryProperties): void | Promise<void>; page(name: string, properties?: TelemetryProperties): void | Promise<void>; timing(name: string, durationMs: number, properties?: TelemetryProperties): void | Promise<void>; exception(error: unknown, properties?: TelemetryProperties): void | Promise<void>; }
/** Foundation compatibility alias. */
export type TelemetryAdapter = AnalyticsAdapter;
/** Inert analytics adapter used during the foundation sprint. */
export class NoopAnalyticsAdapter implements AnalyticsAdapter { track(): void {} identify(): void {} page(): void {} timing(): void {} exception(): void {} }
/** Foundation compatibility alias. */
export { NoopAnalyticsAdapter as NoopTelemetryAdapter };
