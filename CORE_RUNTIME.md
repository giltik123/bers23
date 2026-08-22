# Core HTTP runtime

**Status: CURRENT.** See `PROJECT_SOURCE_OF_TRUTH.md` for the repository-wide authority map.

## Checked-in production boundary

BERS has a real Node Core server entrypoint at `server/index.ts`. `startCoreServer()`:

1. loads fail-closed server configuration with `loadCoreServerConfig()`;
2. creates the production PostgreSQL/Core composition with `createProductionCore()`;
3. creates the explicit Node HTTP adapter with `createNodeHttpAdapter()`;
4. applies Core security response headers before routing;
5. exposes readiness through a live PostgreSQL check;
6. configures request/header/keep-alive timeouts;
7. stops accepting work and closes HTTP/database resources on SIGTERM/SIGINT.

The repository also contains a production `Dockerfile`, and hosted CI builds the image, verifies required contents/native dependencies, and runs health smoke checks.

This means the old statement that the repository has only a static Vite browser target is obsolete. **It does not mean a specific external cloud deployment is automatically proven by the repository.** Hosting, TLS termination, proxy trust and frontend static-response headers remain deployment concerns that must match the accepted Core contracts.

## Composition root

The production composition root is:

`server/core/composition/createProductionCore.ts`

It constructs and schema-checks the current server authorities, including:

- PostgreSQL transaction runtime;
- Project store;
- Artifact authorities/stores and hydration;
- canonical Creative Core and provider runtime;
- canonical Auth/Session service and PostgreSQL security state.

Production startup checks required schemas and fails before serving when required configuration/schema is absent. Test-only migration or compatibility behavior must not become a production fallback.

## HTTP transport

The mounting location is:

`server/core/http/nodeHttpAdapter.ts`

The browser uses the same Core contract through `src/api/coreClient.js`, defaulting to same-origin `/api/core` unless an explicit Core API origin is configured.

Canonical HTTP surfaces are explicit domain routes, including the current families for:

- `/api/core/auth/*`;
- `/api/core/projects*`;
- canonical artifact upload/delivery routes;
- `/api/core/creative/*`;
- health/readiness and controlled model-artifact relay behavior where defined by the adapter/server.

Do not infer a server route from a compatibility method in `coreClient.js`. Generic client helpers such as `/data/:Entity`, `/commands`, `/assets` and `/observability` are not a mandate to create a generic production backend. New product domains require narrow authorities and routes.

## Browser/session security contract

Sprint 6.39C established the accepted browser boundary:

- canonical browser session in hardened HttpOnly cookie form;
- no browser localStorage/sessionStorage/query bearer authority;
- exact Origin + session-bound CSRF enforcement on unsafe cookie-authenticated mutations;
- production CORS allowlist/credential policy;
- CSP and other exploit-containment response headers;
- PostgreSQL-backed absolute/idle session validity, rotation and revocation;
- PostgreSQL-backed abuse controls using keyed subject digests;
- network risk defaults to the actual transport peer, not arbitrary proxy headers.

Do not weaken these controls to make a client integration easier.

## Provider and artifact boundary

Provider credentials are server-only. Concrete provider runtime is composed behind canonical Creative/runtime ports. Client requests cannot select trusted financial facts or bypass artifact ownership/hydration/security gates.

Artifact identities and delivery capabilities are distinct. Stored ORIGINAL/FINAL identities do not become public URLs by themselves; delivery is narrow, scope-bound and expiring according to the Artifact Authority.

## Deployment requirements

A real deployment must provide the required environment/configuration and PostgreSQL schemas and must preserve:

- TLS where production cookie/HSTS policy requires it;
- the allowed browser origins contract;
- provider/auth/artifact secrets only on the server;
- trusted asset-host policy;
- request/body/image limits and timeouts;
- the current proxy trust assumption unless an explicitly tested trusted-proxy model is introduced;
- frontend document security headers if static frontend responses are served outside the Core server authority.

Production/security acceptance is based on hosted CI for the exact final head plus any environment/device proof required by the change. Local success alone is not production approval.
