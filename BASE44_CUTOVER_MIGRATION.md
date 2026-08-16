# Sprint 6.30 cutover inventory

This is the immutable migration record for the retired Base44 boundary. It is
historical documentation, not an allowed production dependency.

| Path at inventory time | Dependency / purpose | Classification | Canonical replacement | Status / owner |
|---|---|---|---|---|
| `package.json`, `package-lock.json` | SDK and Vite plugin packages | REMOVE | Native `fetch` client and React Vite plugin | DONE — Core Platform |
| `vite.config.js` | build, navigation, analytics and edit plugin | REMOVE | standard Vite + React | DONE — Web Platform |
| `src/api/base44Client.js` | browser SDK construction | REPLACE | `src/api/coreClient.js` | DONE — Application Platform |
| `src/lib/AuthContext.jsx`, auth pages, layout and settings | login, identity, OTP and password lifecycle | REPLACE | `/api/core/auth/*`; canonical request/user/tenant/project context | DONE — Identity |
| `src/lib/projectService.js`, project pages | project queries and mutations | REPLACE | `/api/core/data/Project`; server ownership checks | DONE — Projects |
| asset, fashion and outfit libraries/pages | metadata queries, mutation and upload | REPLACE | `/api/core/data/*` and `/api/core/assets` | DONE — Assets |
| credit and subscription libraries | wallet, transaction, reservation, usage and subscription records | REPLACE | Core server API backed by transaction runtime/PostgreSQL | DONE — Billing |
| AI, edit, try-on, segmentation, scene and pipeline libraries | function invocation, model invocation and upload | REPLACE | `/api/core/commands/*`, `/api/core/creative/execute`, `/api/core/assets` | DONE — Creative Execution |
| automation, jobs and notification libraries | persistence and analytics | REPLACE | Core data and observability APIs | DONE — Application Platform |
| `base44/functions/**` | privileged server functions and authorization | REMOVE | canonical Core APIs and composition | DONE — Core Platform |
| `base44/entities/**` | hosted entity schemas | REMOVE | Core database schemas and application contracts | DONE — Data Platform |
| `base44/config.jsonc` | hosted deployment configuration | REMOVE | Core deployment configuration | DONE — SRE |
| `VITE_BASE44_*`, `BASE44_ASSET_HOST`, plugin flag | build/runtime environment | REPLACE | `VITE_CORE_API_URL`, `VITE_CORE_APP_ID`, `VITE_CORE_API_VERSION`, `CORE_ASSET_HOST` | DONE — SRE |
| `media.base44.com` and hosted favicon | storage/UI branding | REMOVE | Core asset allowlist and Bers branding | DONE — Web Platform |

No compatibility adapter remains. `CORE_EXECUTION_ENABLED` is owned by the
production composition root and accepts `LEGACY`, `SHADOW`, or `CORE`; shadow
implementations must simulate planning/accounting and must never dispatch a
second billable provider operation.
