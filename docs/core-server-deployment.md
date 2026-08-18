# Berserk Core server deployment

The Core backend is an ordinary containerized Node service. It does not use the Vite server or a cloud-vendor adapter.

## Required environment

Set `DATABASE_URL`, `FAL_KEY`, `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `ARTIFACT_SIGNING_SECRET`, `TRUSTED_ASSET_HOSTS`, and the explicit `ALLOWED_WEB_ORIGINS` list. `CREATIVE_PROVIDER` is currently `FAL`; `PORT` defaults to `8080`. Secrets are server-only and must never use a `VITE_` prefix.

Optional policy controls are `ALLOW_LEGACY_ASSET_URLS` (default `false`), `HARD_BUDGET_CREDITS`, `CREDITS_PER_EDIT`, `REQUEST_BODY_LIMIT_BYTES`, `REQUEST_TIMEOUT_MS`, `PROVIDER_TIMEOUT_MS`, and `SHUTDOWN_TIMEOUT_MS`. Legacy URLs require a non-empty trusted-host allowlist; canonical requests use signed `artifactId` references.

## Migrate, build, and start

Migrations are a deployment operation and are never applied by server startup:

```sh
npm run db:migrate:transactions
npm run db:check:transactions
npm run server:build
npm run server:start
```

Startup checks database connectivity and the recorded migration checksum before listening. The build output is `dist-server/server.mjs`, with its migration asset. A production image can be built with `docker build -t bers-core .` and runs as the non-root `node` user.

## Probes and frontend

Use `GET /health/live` for liveness and `GET /health/ready` for traffic readiness. Readiness checks the initialized runtime and PostgreSQL but deliberately does not call Fal. Configure the separately deployed frontend with only `VITE_CORE_API_URL=https://api.example.com/api/core`; provider credentials remain in the server environment.

## Shutdown and rollback

`SIGTERM` and `SIGINT` stop admission, drain the HTTP server up to the configured deadline, and close the PostgreSQL pool. Shutdown does not convert ambiguous provider work into a release; reconciliation remains possible from transaction facts. To roll back, stop traffic, deploy the previous immutable image, and retain the forward-compatible transaction schema. Do not reverse a migration while either application version is running.

## Current hardening debt

Creative execution/status snapshots remain process-local. Transaction reservations and their journal are durable, but reconstructing the complete creative status response after a process restart requires a future execution-persistence adapter rather than a second billing or workflow subsystem.
