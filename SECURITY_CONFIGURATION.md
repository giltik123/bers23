# Security Configuration

This document is the production security overlay for the current Berserk architecture. Production consists of a separately served Vite browser application plus the containerized Node Core API. Legacy Base44 server-function and Base44 Storage configuration is not production authority.

Detailed Core build, immutable-image migration, health-probe, rollout, and rollback procedures live in `docs/core-server-deployment.md`.

## 1. Browser frontend boundary

The Vite build is static content. The Core container does **not** serve `dist/index.html`, so Core response headers cannot protect the frontend document. The static host, CDN, or reverse proxy that returns browser HTML owns the production document security headers.

Build the browser with public browser configuration only. `VITE_CORE_API_URL` identifies the canonical Core `/api/core` base, but provider credentials, signing secrets, database credentials, OAuth client secrets, and email-provider secrets must never use a `VITE_` prefix.

### Required frontend HTTP headers

The shared production contract is implemented in `config/frontendSecurityPolicy.mjs`. The deployed HTML response must include:

- `Content-Security-Policy` matching the repository production response policy, including `frame-ancestors 'none'`;
- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: no-referrer`;
- on HTTPS deployments, `Strict-Transport-Security` with `max-age` of at least `31536000` seconds.

The Vite build also injects a CSP `<meta>` element as defense in depth. That meta policy intentionally does **not** claim `frame-ancestors`: the clickjacking directive must arrive as an HTTP response header.

Verify the final canonical frontend URL, not an intermediate redirect:

```sh
FRONTEND_URL=https://app.example.com \
CORE_API_URL=/api/core \
node scripts/verify-frontend-security-headers.mjs
```

For split-origin deployment, pass the exact public Core URL with the same canonical path:

```sh
FRONTEND_URL=https://app.example.com \
CORE_API_URL=https://api.example.com/api/core \
node scripts/verify-frontend-security-headers.mjs
```

The verifier requires a direct 2xx HTML response and validates actual HTTP headers. A CSP meta element alone is not release evidence.

`VITE_CORE_API_URL` must target **exactly `/api/core`**: either the same-origin value `/api/core` or an absolute URL such as `https://api.example.com/api/core`. Trailing-slash/custom paths, protocol-relative URLs (`//host/...`), slash-plus-backslash escape forms, credentials, query strings, and fragments are rejected. Absolute remote URLs must use HTTPS; HTTP is accepted only for localhost development/test endpoints.

## 2. Core browser origin and authentication boundary

`AUTH_PUBLIC_ORIGIN` is the exact public browser/auth origin used by Core. Outside localhost it must be HTTPS and contain no credentials, path, query, or fragment.

`ALLOWED_WEB_ORIGINS` is a comma-separated list of exact HTTP(S) origins allowed to make credentialed browser requests. Production requires a non-empty list and does not accept `*`.

For a single public frontend, a typical split-origin shape is:

```dotenv
AUTH_PUBLIC_ORIGIN=https://app.example.com
ALLOWED_WEB_ORIGINS=https://app.example.com
```

The browser client uses HttpOnly cookie authority and `credentials: include`. Do not compensate for origin/CORS mistakes with wildcard CORS, JavaScript-stored bearer tokens, or server secrets in the Vite bundle.

`ALLOW_API_BEARER_AUTH` is disabled by default in production. Treat production enablement as a separate compatibility decision, not the normal browser authentication path.

## 3. Trusted reverse proxy / client-IP boundary

Core uses the TCP socket peer as auth risk/rate-limit identity by default. Forwarded client identity is opt-in only.

Default:

```dotenv
TRUSTED_PROXY_HEADER_MODE=NONE
TRUSTED_PROXY_CIDRS=
```

If production traffic reaches Core through known infrastructure proxies, X-Forwarded-For may be enabled only with concrete proxy CIDRs:

```dotenv
TRUSTED_PROXY_HEADER_MODE=X_FORWARDED_FOR
TRUSTED_PROXY_CIDRS=10.20.0.0/16,2001:db8:1234::/48
```

The immediate TCP peer must be inside an explicitly trusted CIDR before Core considers X-Forwarded-For. The chain is walked right-to-left and stops at the first untrusted hop. Malformed, oversized, port-bearing, or overlong chains fail closed to the socket peer.

Do not configure blanket `trust proxy`, wildcard/hostname entries, an entire private range merely because it is private, or client/VPN networks as trusted proxy infrastructure. RFC `Forwarded` is not an alias for the X-Forwarded-For contract.

## 4. Artifact and legacy remote-asset boundary

Canonical product paths use signed Artifact references. Arbitrary legacy remote asset URLs are disabled by default:

```dotenv
ALLOW_LEGACY_ASSET_URLS=false
TRUSTED_ASSET_HOSTS=
```

Only an explicit migration/compatibility path may enable them:

```dotenv
ALLOW_LEGACY_ASSET_URLS=true
TRUSTED_ASSET_HOSTS=assets.example.com,images.example.com
```

When enabled, `TRUSTED_ASSET_HOSTS` must be non-empty, resolved remote URLs must use HTTPS, and hosts are exact hostname entries rather than schemes, paths, wildcards, or substring rules.

Retired variables such as `BASE44_ASSET_HOST`, `R2_ASSET_HOST`, and `S3_ASSET_HOST` are not current Core runtime configuration and must not be used as deployment authority.

## 5. Server-only configuration and secrets

Production Core requires server-side configuration including:

- `DATABASE_URL`;
- `FAL_KEY`;
- `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`;
- `AUTH_CHALLENGE_SECRET`, `AUTH_DEFAULT_TENANT_ID`, `AUTH_PUBLIC_ORIGIN`;
- `RESEND_API_KEY`, `AUTH_EMAIL_FROM`;
- `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`;
- `ARTIFACT_SIGNING_SECRET`;
- exact `ALLOWED_WEB_ORIGINS`.

`TRUSTED_ASSET_HOSTS` is required only when `ALLOW_LEGACY_ASSET_URLS=true`. Trusted-proxy variables are optional and fail closed to direct socket identity by default.

Never place server secrets in frontend environment files, static JavaScript, repository commits, browser storage, CI logs, or public deployment metadata.

## 6. Database rollout boundary

Normal production Core startup checks schema readiness and does not apply migrations. Apply forward schema changes as a deployment job before routing a new application version. Use the migration runner from the exact immutable Core image:

```sh
node dist-server/migrate.mjs migrate
node dist-server/migrate.mjs check
```

The runtime pack contains the globally ordered forward migration set and the schema-aware migration orchestration. Application-image rollback does not imply database rollback. Do not execute rollback SQL while either application version is serving traffic.

## 7. Release verification

Before production traffic is admitted, verify at least:

1. the exact immutable Core image completed migration and schema check;
2. Core `/health/live` and `/health/ready` succeed;
3. the final frontend URL passes `verify-frontend-security-headers.mjs`;
4. frontend and Core origins agree with `AUTH_PUBLIC_ORIGIN`, `ALLOWED_WEB_ORIGINS`, and the canonical `/api/core` `VITE_CORE_API_URL`;
5. trusted proxy mode is disabled or bound to the actual immediate proxy CIDRs;
6. legacy asset URLs remain disabled unless explicitly required;
7. server secrets are absent from the browser bundle and public configuration.

A deployment is not production-approved merely because the application builds locally. Runtime serving topology, database state, HTTP headers, origin policy, and proxy boundary are part of release evidence.
