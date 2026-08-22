# BERS

BERS is being built as a **Creative Operating System**: durable creative Projects, canonical artifact/execution authorities, hybrid local/cloud AI runtimes, and server-owned security/financial control.

## Start here

Read [PROJECT_SOURCE_OF_TRUTH.md](PROJECT_SOURCE_OF_TRUTH.md) first for the current authority map, production boundaries, feature maturity, legacy/compatibility classification, and rules for future work.

## Core runtime

See [CORE_RUNTIME.md](CORE_RUNTIME.md) for the checked-in Node Core entrypoint, production composition, HTTP boundary, health/shutdown behavior, and deployment contract.

## Security

See [SECURITY_CONFIGURATION.md](SECURITY_CONFIGURATION.md) for server-side security configuration. Sprint 6.39C established the canonical browser/session boundary: HttpOnly browser sessions, Origin + session-bound CSRF enforcement, browser exploit-containment headers, PostgreSQL session authority, abuse controls, rotation and revocation.

## PostgreSQL transaction authority

See [POSTGRESQL_TRANSACTION_STORE.md](POSTGRESQL_TRANSACTION_STORE.md) for the financial source-of-truth decision, invariants, isolation/lock order, recovery and real-PostgreSQL acceptance requirements.

See [TRANSACTION_RUNTIME.md](TRANSACTION_RUNTIME.md) for reservation, commit/release, journal causality, correlation and recovery runtime boundaries.

## Creative execution

See [CREATIVE_EXECUTION_ARCHITECTURE.md](CREATIVE_EXECUTION_ARCHITECTURE.md) for the detailed Creative execution model. Current production composition and acceptance tests take precedence over sprint-era inventory details if they diverge.

## Historical migration/design records

The repository intentionally retains some historical documents for provenance. Their headers identify them as non-authoritative where applicable. In particular, Base44-era operation/mutation documents must not be used to restore a retired browser/entity authority.

- [BASE44_CUTOVER_MIGRATION.md](BASE44_CUTOVER_MIGRATION.md) — migration record.
- [AI_OPERATION_REGISTRY.md](AI_OPERATION_REGISTRY.md) — historical Base44-era operation-policy design.
- [MUTATION_LOCKDOWN_PLAN.md](MUTATION_LOCKDOWN_PLAN.md) — historical Base44 privileged-mutation migration plan.

Do not infer production readiness from a UI page or client wrapper alone. A production feature requires an explicit canonical server authority and the acceptance evidence appropriate to that domain.
