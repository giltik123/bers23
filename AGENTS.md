# AGENTS.md

## Read this first

BERS is **not a Base44 application anymore**. Base44 was retired during the Core cutover and must not be reintroduced as a runtime, SDK, entity authority, deployment plugin, or compatibility backend.

Before changing architecture, read:

1. `PROJECT_SOURCE_OF_TRUTH.md` — canonical current architecture and authority map.
2. `README.md` — repository navigation.
3. Domain references such as `POSTGRESQL_TRANSACTION_STORE.md`, `CREATIVE_EXECUTION_ARCHITECTURE.md`, `CORE_RUNTIME.md`, and `SECURITY_CONFIGURATION.md` when relevant.

If an old sprint/migration document conflicts with current production composition and accepted tests, current production code/tests and `PROJECT_SOURCE_OF_TRUTH.md` take precedence.

## Architecture rules

- Preserve **one canonical authority per domain**.
- Browser state is never authoritative for sessions, ownership, artifacts, balances, paid entitlements or provider credentials.
- Do not add localStorage/sessionStorage/query bearer fallbacks to browser auth.
- Do not create a generic `/data/:Entity` or command proxy to make legacy client wrappers work.
- Do not bypass canonical Auth/Session, Project, Artifact, Creative or Transaction authorities.
- PostgreSQL concurrency/authority claims require real PostgreSQL proof.
- AI/cognitive/agent modules may advise through canonical ports; they do not gain direct side-effect authority.
- Security/production acceptance is attached to the exact tested commit SHA.

## Current repository boundaries

- `src/` — browser/UI and application adapters.
- `src/api/coreClient.js` — browser Core client. Some generic compatibility helpers remain but are not proof of a canonical server route.
- `server/index.ts` — checked-in Node Core server entrypoint.
- `server/core/composition/createProductionCore.ts` — production Core composition root.
- `server/core/http/nodeHttpAdapter.ts` — explicit HTTP transport/routes.
- `server/transactions/` — canonical PostgreSQL financial transaction runtime.
- `server/core/auth/`, `projects/`, `artifacts/` — current server authorities for those domains.
- `.github/workflows/` — hosted acceptance gates.

## Legacy material

Files whose headers classify them as **HISTORICAL** are migration/design records, not instructions for new production work. In particular, do not restore Base44 SDK/functions/entities or the old browser-owned privileged mutation model.

Historical PRs #13, #28, #33, #35 and #38 are not merge candidates by default. Reuse ideas only after comparing them with current `main` and authority contracts.

## Working discipline

Keep changes scoped and evidence-based. Before finishing:

- inspect the exact diff for collateral changes;
- run the relevant local checks when available;
- require hosted CI on the exact final head for production/security acceptance;
- never claim WebGPU/device/model acceptance from a weaker browser/WASM or capability-only check.
