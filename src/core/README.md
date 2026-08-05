# Core Platform

`src/core` is the framework-independent infrastructure boundary of the AI Photo Editor. It has no React, Base44, or Vite runtime dependency. Application bootstrap code should compose services through the dependency-injection container rather than constructing dependencies inside services.

## Modules

| Module | Responsibility | Dependencies | Public API |
| --- | --- | --- | --- |
| `config` | Typed environment, application, build, provider, limits, and feature configuration with runtime overrides. | Platform environment only. | `ConfigLoader`, `FeatureFlags`, configuration types and defaults. |
| `container` | Registration, lifecycle management, and resolution of application services. | None. | `ServiceContainer`, `ServiceRegistry`, `ServiceFactory`, `container`. |
| `events` | Typed synchronous/asynchronous communication without framework coupling. | None. | `EventBus`, `emit`, `emitAsync`, `on`, `once`, `off`, `waitFor`, wildcards. |
| `errors` | Structured errors, reporting, formatting, and recovery coordination. | None; collaborators are constructor-injected. | `AppError`, typed errors, `ErrorManager`, `ErrorReporter`, `ErrorFormatter`, `RecoveryStrategy`, `ErrorCodes`. |
| `logger` | Structured scoped logging, filtering, transport fan-out, and performance timing. | Injected transports and filters. | `LoggerService`, console/memory/remote transports, formatter, filters, child loggers. |
| `storage` | Namespaced persistence with TTL, versioning, and migration. | An injected `StorageAdapter`. | `StorageService`, memory/web adapters, IndexedDB and secure-storage stubs. |
| `http` | Fetch transport with methods, retry, timeout, abort, interceptors, middleware, progress, and request queues. | Standard Fetch API. | `HttpClient`, `RequestQueue`, `OfflineQueue`, request/response contracts. |
| `telemetry` | Provider-neutral product, performance, and crash tracking. | An injected `AnalyticsAdapter`. | `TelemetryManager`, trackers, crash reporter, no-op adapter. |
| `types` | Shared compile-time contracts. | None. | `Result`, `ApiResponse`, `Nullable`, `Optional`, `DeepPartial`, `Disposable`. |
| `utils` | Small dependency-free general-purpose helpers. | Standard platform APIs. | UUID, debounce, throttle, sleep, retry, deep clone/equality. |

## Dependency injection

Use a class, symbol, or string as a token. Singleton instances may be supplied eagerly, lazy singletons are created on first resolution, and transient/factory registrations are created for every resolution.

```ts
const LOGGER = Symbol('Logger');
container.registerSingleton(LOGGER, logger);
container.registerFactory(HttpClient, (services) => new HttpClient('', {
  headers: { 'X-Logger-Ready': String(Boolean(services.resolve(LOGGER))) },
}));
const http = container.resolve(HttpClient);
```

Factories receive only the `ServiceResolver` interface. Circular resolution fails immediately with `ServiceResolutionError`.

## Events

Event maps define payloads at compile time. Names should use the reserved subsystem namespaces: `editing.*`, `planner.*`, `scene.*`, `recipe.*`, `provider.*`, `workspace.*`, `fashion.*`, `jobs.*`, and `automation.*`. A subscription to `editing.*` receives every event in that namespace; `*` receives every event.

## Extension boundaries

- Replace telemetry stubs by injecting an `AnalyticsAdapter`.
- Implement `IndexedDBStorageAdapter` or `SecureStorageAdapter` without changing `StorageService` consumers.
- Add logger destinations by implementing `LogTransport`.
- Register provider-specific HTTP clients for SAM3, Reve, FASHN, or Supabase at the application composition root; the HTTP engine contains no provider business logic.
- Compression, encryption, and persisted offline queues are explicitly reserved for future implementations.

## Compatibility

The root `src/core/index.ts` is the only required public import surface. Foundation v1 names such as `TelemetryService`, `TelemetryAdapter`, `NoopTelemetryAdapter`, `ConsoleLogSink`, and `LogSink` remain exported as aliases. No existing editor, planner, pipeline, provider, recipe, segmentation, job, or Base44 module is modified by this layer.
