# Berserk Core server deployment

The Core backend is a containerized Node service. The production image contains the Core server, the complete ordered forward-migration pack, and a one-shot schema runner. It does not serve the Vite SPA and does not depend on a cloud-vendor runtime adapter.

## Required server environment

Production Core requires:

- `DATABASE_URL`
- `FAL_KEY`
- `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`
- `AUTH_CHALLENGE_SECRET`, `AUTH_DEFAULT_TENANT_ID`, `AUTH_PUBLIC_ORIGIN`
- `RESEND_API_KEY`, `AUTH_EMAIL_FROM`
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`
- `ARTIFACT_SIGNING_SECRET`
- non-empty exact `ALLOWED_WEB_ORIGINS`

`CREATIVE_PROVIDER` defaults to `FAL`; `PORT` defaults to `8080`. Secrets are server-only and must never use a `VITE_` prefix.

`ALLOW_LEGACY_ASSET_URLS` defaults to `false`. `TRUSTED_ASSET_HOSTS` is required only when that legacy URL compatibility path is explicitly enabled; canonical requests use signed Artifact references. Do not configure a trusted asset host merely because a storage provider exists.

Trusted proxy forwarding is also disabled by default. Enable `TRUSTED_PROXY_HEADER_MODE=X_FORWARDED_FOR` only together with concrete infrastructure-owned `TRUSTED_PROXY_CIDRS`. Do not use wildcard, hostname, blanket private-network, or client-network trust. When the mode remains `NONE`, `TRUSTED_PROXY_CIDRS` must be empty.

Other bounded policy controls include `AUTH_SESSION_ABSOLUTE_TTL_MS`, `AUTH_SESSION_IDLE_TTL_MS`, `HARD_BUDGET_CREDITS`, `CREDITS_PER_EDIT`, request/upload/image limits, `REQUEST_TIMEOUT_MS`, `PROVIDER_TIMEOUT_MS`, and `SHUTDOWN_TIMEOUT_MS`. `ALLOW_API_BEARER_AUTH` is off by default in production.

## Build and migrate

Migrations are a deployment operation and are never applied by normal production server startup. Build one immutable image first:

```sh
docker build -t bers-core:<release> .
```

Run that exact image as a one-shot migration job before routing the new application version:

```sh
docker run --rm \
  -e DATABASE_URL="$DATABASE_URL" \
  bers-core:<release> \
  node dist-server/migrate.mjs migrate
```

Then prove that the schema accepted by the release is complete:

```sh
docker run --rm \
  -e DATABASE_URL="$DATABASE_URL" \
  bers-core:<release> \
  node dist-server/migrate.mjs check
```

The image contains one globally ordered `dist-server/migrations` pack. The build rejects gaps, duplicate forward migration numbers, invalid migration filenames, and excludes rollback `*.down.sql` files from the runtime forward pack. The migration runner uses the repository's schema-aware migrators rather than replaying every SQL file blindly; this preserves existing adoption/idempotency checks and the transaction migration checksum contract.

For source-tree development and CI, the historical npm commands remain compatibility aliases for the same orchestration:

```sh
npm run db:migrate:transactions
npm run db:check:transactions
```

Despite the historical `transactions` name, these commands migrate/check the complete current Core schema, including canonical artifacts/projects/auth, local execution/workflow continuation, and Fashion schemas. Production deployment should prefer the migration runner packaged in the same immutable image that will serve traffic.

## Start and probes

After the migration job and schema check succeed, start the normal image without overriding its command. The image runs `node dist-server/server.mjs` as the non-root `node` user and listens on port `8080` unless `PORT` is configured.

Use:

- `GET /health/live` for process liveness;
- `GET /health/ready` for traffic readiness.

Readiness checks initialized runtime and PostgreSQL schema state but deliberately does not call FAL. A production Core instance does not auto-migrate missing schema; it fails closed instead.

The Vite frontend is deployed separately. Its origin must agree with `AUTH_PUBLIC_ORIGIN`/`ALLOWED_WEB_ORIGINS`, and `VITE_CORE_API_URL` must resolve to the intended Core `/api/core` boundary. Provider credentials remain only in the Core environment. The frontend HTTP security-header contract is documented separately in `SECURITY_CONFIGURATION.md`.

## Rollout and rollback

A safe rollout order is:

1. build and identify one immutable image;
2. back up/verify the target PostgreSQL environment according to the deployment platform's database procedure;
3. run `node dist-server/migrate.mjs migrate` from that image;
4. run `node dist-server/migrate.mjs check` from that image;
5. start the new Core instances;
6. require `/health/ready` before admitting traffic;
7. verify the separately hosted frontend/API routing and authentication flow.

`SIGTERM` and `SIGINT` stop admission, drain the HTTP server up to the configured deadline, and close the PostgreSQL pool. Shutdown does not convert ambiguous provider work into a release; reconciliation remains possible from transaction facts.

Application rollback means routing traffic back to the previous immutable image only when that version is compatible with the already-forward-migrated schema. Do not run a rollback SQL migration while either application version is serving traffic. Database reversal is a separate, explicitly planned operation and must not be inferred from application image rollback.

## Current hardening debt

Creative execution/status snapshots remain process-local. Transaction reservations and their journal are durable, but reconstructing the complete creative status response after a process restart requires a future execution-persistence adapter rather than a second billing or workflow subsystem.
