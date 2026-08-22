# BERS Project Source of Truth

**Status: CANONICAL — current architecture.**

This document is the first architectural reference for maintainers and coding agents. If an older planning, migration, Base44, prototype, or compatibility document conflicts with this file **and with the current production composition/tests**, the current production code and accepted authority tests win.

The product direction is a **Creative Operating System**: a durable Project owns source/result artifacts; Creative Intelligence may decide or recommend what should happen; canonical Core authorities decide whether it may happen, execute it through controlled runtimes, verify/persist the result, and record financial/security facts.

## 1. Non-negotiable architecture law

1. **One authority per domain.** Do not create parallel browser/server authorities for the same state.
2. **Browser input is untrusted.** The browser may request domain transitions; it may not assert ownership, balances, paid-plan status, provider credentials, canonical artifact identity, session identity, or other server facts.
3. **PostgreSQL is authoritative for durable server state already migrated there.** In-memory state, browser storage and compatibility DTOs are not substitutes.
4. **Fail closed.** Missing schema, invalid ownership, invalid session, invalid artifact capability, uncertain financial/provider outcome, or absent mandatory configuration must not silently downgrade to a permissive path.
5. **No generic CRUD escape hatch.** A compatibility client API must not become a generic production endpoint merely because UI code still references it.
6. **AI is advisory until authorized.** Cognitive, adaptive, decision-model and agent code may propose decisions/plans/rankings; side effects remain behind canonical Project/Artifact/Creative/Transaction/Auth authorities.
7. **Acceptance belongs to an exact SHA.** Production/security acceptance requires the hosted checks appropriate to the change; a green run on an older head is not evidence for a changed head.

## 2. Current canonical production authorities

| Domain | Canonical authority / composition | Durable authority | Browser contract |
| --- | --- | --- | --- |
| Auth & Session | `CanonicalAuthService` + `PostgresAuthSecurityStore` / `PostgresAuthStore` | PostgreSQL `canonical_auth_*` | explicit `/api/core/auth/*`; HttpOnly cookie for browser session |
| Projects | `PostgresProjectStore` through Core HTTP boundary | PostgreSQL project/history/version schema | explicit `/api/core/projects*` |
| Artifacts | `ArtifactAuthority`, signed external capability authority, PostgreSQL mask/final image stores | PostgreSQL artifact storage metadata + controlled bytes/storage | explicit mask/project/result capability routes |
| Creative execution | canonical Creative Core composition + workflow/runtime/security/verifier boundaries | canonical execution/transaction facts; persisted final artifacts | explicit `/api/core/creative/*` |
| Financial transactions | PostgreSQL transaction runtime / `TransactionStore` | PostgreSQL wallet, reservation, journal and recovery facts | never direct browser mutation; consumed through canonical execution/domain commands |

### Auth/session boundary

Sprint 6.39C is accepted and integrated. Production browser authentication is cookie-backed, not a browser bearer authority. Unsafe cookie-authenticated mutations require the existing Origin + session-bound CSRF contract. Session validity remains server-side and PostgreSQL-backed, including revocation, absolute expiry and idle expiry. Abuse controls are shared PostgreSQL state and use keyed subject digests; the transport peer defaults to `request.socket.remoteAddress`, not untrusted proxy headers.

Do not add a localStorage/sessionStorage/query-token fallback. Non-browser/API bearer compatibility, where explicitly enabled, is not browser authority.

### Project boundary

A Project is the durable creative workspace. ORIGINAL identity, current result, history cursor, undo/redo, named versions and restores are server-authoritative. Client DTO fields do not grant ownership. Project/user/tenant scope must be derived from the authenticated principal and server state.

### Artifact boundary

Artifact IDs/capabilities are not arbitrary browser UUIDs. ORIGINAL, MASK and FINAL ownership/role/scope are verified by the Artifact Authority. A stored artifact identity is not automatically a delivery capability; delivery tokens are narrow, signed and expiring.

### Creative execution boundary

The browser requests an edit through the application/Core boundary. The canonical path owns authorization, artifact hydration/ownership, financial reservation, provider/local runtime dispatch, verification, recovery semantics, final persistence and commit/release behavior. A legacy workflow/agent/AI manager must not dispatch a second paid provider call or become an alternate graph authority.

### Financial boundary

PostgreSQL is the financial source of truth. Browser code must never directly set balance, reserved amount, transaction status, paid entitlement or usage counters. Reserve/commit/release and reconciliation remain server-side, idempotent and concurrency-safe.

## 3. Production composition and transport

The checked-in production backend entrypoint is the Node Core server under `server/`, with production construction rooted in `server/core/composition/createProductionCore.ts` and transport in `server/core/http/nodeHttpAdapter.ts`. The repository also contains a production `Dockerfile` and CI smoke/image gates.

The browser uses `src/api/coreClient.js` with same-origin `/api/core` by default (or an explicitly configured Core origin).

The existence of a browser method does **not** prove a matching canonical server endpoint exists. Production authority is established by the server route/composition plus tests, not by a client wrapper.

## 4. Compatibility surfaces that are NOT canonical authorities

`src/api/coreClient.js` still exposes compatibility-shaped helpers including:

- `entities` → `/data/:Entity`;
- `functions.invoke` → `/commands/:command`;
- generic upload → `/assets`;
- analytics → `/observability/events`.

These helpers are **not permission to implement a generic production data/command proxy**. If no narrow server authority currently backs a surface, treat it as incomplete/legacy UI compatibility.

When migrating a feature, create a domain-specific server authority and explicit route. Do not make `/data/:Entity` a universal mutation API.

## 5. Product surfaces by maturity

### Canonical / accepted foundation

- Auth and browser session security.
- Projects, ORIGINAL/current result, history, undo/redo and versions.
- Artifact authority and controlled result delivery.
- Canonical Creative execution and FAL provider runtime boundary.
- PostgreSQL transaction authority and reconciliation.
- MobileSAM browser WASM acceptance path and signed model-pack controls.

MobileSAM **WebGPU** remains subject to its separate real-device acceptance requirement; browser WASM success must not be relabeled as WebGPU device proof.

### Functional but not yet a production authority

- Automation Studio / recipe/job client orchestration.
- Asset Library compatibility surface.
- Subscription/trial UI and client managers.
- Observability client surface.

These must migrate through explicit authorities rather than generic CRUD.

### Placeholder / future vertical

- Billing/payments checkout and verified provider webhook authority.
- Team/workspace collaboration and RBAC.
- Durable server-side automation scheduler/worker.

## 6. Required future authorities

### Subscription & Billing Authority

Paid plan activation must originate from a verified billing-provider event or an explicit server-owned entitlement transition. The browser must not set `plan_id`, `status`, credit grants or billing truth. Billing should integrate with, not bypass, the canonical transaction authority.

### Asset Authority

Assets need owner/tenant/project scope, controlled upload/storage provenance, safe delivery and narrow metadata mutation. Do not implement this as unrestricted `/data/Asset` CRUD.

### Automation Authority

Automation definitions/revisions and executions should be durable server state. Scheduler/workers must call the same canonical Creative/Artifact/Transaction authorities as interactive edits; automation does not receive a second AI or billing path.

### Observability Ingress

Browser telemetry is untrusted data. A future ingress must have an allowlisted schema, size/rate limits and explicit secret/PII policy. It is not a generic server command bus.

## 7. Creative Intelligence / Cognitive code

The repository contains CognitiveOS, working memory, adaptive AI, encoders, decision/ranking experiments and other intelligence modules. Preserve them as useful R&D/advisory capability, but they are **not currently the production side-effect authority**.

The intended evolution is:

`Intent/context → Decision/Planning advice → canonical security/budget/artifact checks → controlled local/cloud runtime → verification → durable result`.

A future Decision Model v2 may rank or propose operations/providers, cost/latency/quality trade-offs and local/cloud targets. It must enter through canonical Decision/Planning ports and cannot write Projects, Artifacts, Sessions or financial state directly.

Historical PRs **#13, #28, #33, #35 and #38** are not merge candidates merely because they contain useful ideas. Reuse concepts only after comparing them with current `main` and current authority contracts.

## 8. Documentation classification

| Document | Classification |
| --- | --- |
| `PROJECT_SOURCE_OF_TRUTH.md` | **CANONICAL overview** |
| `POSTGRESQL_TRANSACTION_STORE.md` | Canonical financial/storage ADR for its domain |
| `CREATIVE_EXECUTION_ARCHITECTURE.md` | Detailed Creative architecture/inventory; current production composition/tests take precedence where sprint-era inventory is stale |
| `CORE_RUNTIME.md` | Current Node/Core deployment boundary |
| `SECURITY_CONFIGURATION.md` | Current security configuration reference for its documented controls |
| `BASE44_CUTOVER_MIGRATION.md` | Historical migration record only |
| `AI_OPERATION_REGISTRY.md` | Historical Base44-era operation policy design; non-authoritative for current production |
| `MUTATION_LOCKDOWN_PLAN.md` | Historical Base44-era security migration plan; non-authoritative for current production |

## 9. Change checklist for maintainers and agents

Before introducing a new feature or endpoint:

1. Identify its sole authority and durable state owner.
2. Verify it does not create a second path around Auth, Project, Artifact, Creative or Transaction authority.
3. Derive user/tenant/project scope from authenticated server context, never arbitrary request fields.
4. Keep secrets/provider credentials server-side.
5. Add narrow contracts and adversarial tests for ownership, replay/concurrency and public-data minimization where relevant.
6. Use real PostgreSQL tests for PostgreSQL concurrency/authority claims.
7. For browser-security changes, preserve the accepted 6.39C cookie/Origin/CSRF/CSP/session boundary.
8. Run hosted CI on the exact final head required by the affected acceptance gates.

When this document and an old sprint note disagree, investigate the current code and tests before changing architecture. Do not restore retired behavior solely to make an old document true.
