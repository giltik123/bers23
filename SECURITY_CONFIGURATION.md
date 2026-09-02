# Security Configuration

This document is the production security overlay for the current Berserk architecture. The repository no longer uses a Base44 server function or Base44 Storage authority. Production consists of a separately served Vite browser application plus the containerized Node Core API.

Detailed Core build, migration, health-probe, rollout, and rollback procedures live in `docs/core-server-deployment.md`.

## 1. Browser frontend boundary

The Vite build is static content. The Core container does **not** serve `dist/index.html`, so Core response headers cannot protect the frontend document. The static host/CDN/reverse proxy that returns the browser HTML owns the production document security headers.

Build the browser with only public browser configuration. In particular, `VITE_CORE_API_URL` may identify the Core `/api/core` boundary, but provider credentials, signing secrets, database credentials, OAuth client secrets, and email-provider secrets must never use a `VITE_` prefix.

### Required frontend HTTP headers

The shared production contract is implemented in `config/frontendSecurityPolicy.mjs`. The deployed HTML response must include:

- `Content-Security-Policy` equal to the repository production response policy, including `frame-ancestors 'none'`;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: no-referrer`;
- on HTTPS deployments, `Strict-Transport-Security` with `max-age` of at least `31536000` seconds.

The Vite build also injects a CSP `<meta>` element as defense in depth. That meta policy intentionally does **not** claim `frame-ancestors`: browsers require the clickjacking directive to arrive as an HTTP response header.

Verify the final canonical frontend URL, not an intermediate redirect:

```sh
FRONTEND_URL=https://app.example.com \
CORE_API_URL=/api/core \
node scripts/verify-frontend-security-headers.mjs
```

For a split-origin deployment, pass the exact public Core URL instead:

```sh
FRONTEND_URL=https://app.example.com \
CORE_API_URL=https://api.example.com/api/core \
node scripts/verify-frontend-security-headers.mjs
```

The verifier requires a direct 2xx HTML response and validates the actual HTTP headers. A CSP meta element alone is not release evidence.

`VITE_CORE_API_URL` must be either a root-relative path such as `/api/core` or an absolute HTTPS URL outside localhost. Protocol-relative URLs (`//host/...`), credentials, query strings, and fragments are rejected by the production CSP builder.

## 2. Core browser origin and authentication boundary

`AUTH_PUBLIC_ORIGIN` is the exact public browser/auth origin used by Core. Outside localhost it must be HTTPS and contain no credentials, path, query, or fragment.

`ALLOWED_WEB_ORIGINS` is a comma-separated list of exact HTTP(S) origins allowed to make credentialed browser requests. Production requires a non-empty list and does not accept `*`.

For a single public frontend, a typical split-origin shape is:

```dotenv
AUTH_PUBLIC_ORIGIN=https://app.example.com
ALLOWED_WEB_ORIGINS=https://app.example.com
```

The browser client uses HttpOnly cookie authority and `credentials: include`. Do not work around origin/CORS mistakes by enabling wildcard CORS, moving bearer tokens into JavaScript storage, or exposing server secrets to the Vite bundle.

`ALLOW_API_BEARER_AUTH` is disabled by default in production. Treat any production enablement as a separate compatibility decision, not as the normal browser authentication path.

## 3. Trusted reverse proxy / client-IP boundary

Core uses the TCP socket peer as the auth risk/rate-limit identity by default. Forwarded client identity is opt-in only.

Default:

```dotenv
TRUSTED_PROXY_HEADER_MODE=NONE
TRUSTED_PROXY_CIDRS=
```

When production traffic reaches Core through known infrastructure proxies, X-Forwarded-For may be enabled only with concrete proxy CIDRs:

```dotenv
TRUSTED_PROXY_HEADER_MODE=X_FORWARDED_FOR
TRUSTED_PROXY_CIDRS=10.20.0.0/16,2001:db8:1234::/48
```

The immediate TCP peer must be inside an explicitly trusted CIDR before Core considers X-Forwarded-For. The chain is walked right-to-left and stops at the first untrusted hop. Malformed, oversized, port-bearing, or overlong chains fail closed to the socket peer.

Do not configure:

- blanket `trust proxy` behavior;
- wildcard or hostname entries;
- an entire private-address range merely because it is private;
- client/user/VPN networks as trusted proxy infrastructure;
- RFC `Forwarded` and assume it aliases X-Forwarded-For.

If the serving topology changes, update the CIDR contract as an infrastructure/security change and re-run the trusted-proxy acceptance tests.

## 4. Artifact and remote-asset boundary

Canonical product paths use signed Artifact references. A signed Artifact reference is scope/expiry checked before Core resolves a stored or external artifact.

Arbitrary legacy remote asset URLs are disabled by default:

```dotenv
ALLOW_LEGACY_ASSET_URLS=false
TRUSTED_ASSET_HOSTS=
```

Only if a migration/compatibility path still requires legacy URLs may it be enabled:

```dotenv
ALLOW_LEGACY_ASSET_URLS=true
TRUSTED_ASSET_HOSTS=assets.example.com,images.example.com
```

When legacy URLs are enabled:

- `TRUSTED_ASSET_HOSTS` must be non-empty;
- resolved remote URLs must use HTTPS;
- trusted hosts are exact hostname entries, not schemes, paths, parent-domain wildcards, or substring rules;
- configure canonical lowercase hostnames because URL hostname parsing is canonicalized while the allowlist is not broadened for case/wildcard aliases.

Do not add a storage provider to `TRUSTED_ASSET_HOSTS` simply because the application uses that provider. The variable authorizes the legacy external-URL compatibility path; canonical stored Artifact IDs do not need it.

Retired variables such as `BASE44_ASSET_HOST`, `R2_ASSET_HOST`, and `S3_ASSET_HOST` are not current Core runtime configuration and must not be used as deployment authority.

## 5. Server-only secrets

At minimum, production Core requires server-side values for database/provider/auth/artifact authority, including:

- `DATABASE_URL`;
- `FAL_KEY`;
- `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`;
- `AUTH_CHALLENGE_SECRET`;
- `RESEND_API_KEY`, `AUTH_EMAIL_FROM`;
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`;
- `ARTIFACT_SIGNING_SECRET`.

Also configure `AUTH_DEFAULT_TENANT_ID`, `AUTH_PUBLIC_ORIGIN`, and exact `ALLOWED_WEB_ORIGINS` according to the deployment.

Never place these values in frontend environment files, static JavaScript, repository commits, browser storage, CI logs, or public deployment metadata.

## 6. Database rollout boundary

Normal production Core startup checks schema readiness and does not apply migrations. Apply the forward schema as a deployment job before routing a new application version. Prefer the migration runner contained in the exact immutable Core image:

```sh
node dist-server/migrate.mjs migrate
node dist-server/migrate.mjs check
```

The detailed image commands and rollback rules are in `docs/core-server-deployment.md`. Do not infer database rollback from application-image rollback, and do not execute rollback SQL while either application version is serving traffic.

## 7. Release verification

Before production traffic is admitted, verify at least:

1. the exact immutable Core image has completed its migration and schema check;
2. Core `/health/live` and `/health/ready` succeed;
3. the final frontend URL passes `verify-frontend-security-headers.mjs`;
4. frontend and Core origins agree with `AUTH_PUBLIC_ORIGIN`, `ALLOWED_WEB_ORIGINS`, and `VITE_CORE_API_URL`;
5. trusted proxy mode is either disabled or bound to the actual immediate proxy CIDRs;
6. legacy asset URLs remain disabled unless there is an explicit compatibility requirement;
7. server secrets are absent from the browser bundle and public configuration.

A deployment is not production-approved merely because the application builds locally. The runtime serving topology, database state, HTTP headers, origin policy, and proxy boundary are part of the release evidence.
