# BERS

BERS is being built as a **Creative Operating System**: durable creative Projects, canonical artifact/execution authorities, hybrid local/cloud AI runtimes, and server-owned security/financial control.

## Start here

Read [PROJECT_SOURCE_OF_TRUTH.md](PROJECT_SOURCE_OF_TRUTH.md) first for the current authority map, production boundaries, feature maturity, legacy/compatibility classification, and rules for future work.

Read [BERS_V1_DEVELOPMENT_ROADMAP.md](BERS_V1_DEVELOPMENT_ROADMAP.md) for the canonical pre-release development program, sequencing, mandatory Agent/Automation/Job Center work, advanced generative research, MoE/DiT + FreeToken-derived validation, and the exact-SHA path to `BERS_V1_RC` / `BERS v1.0 RELEASE` on continuously improving `main`.

## Product completion and development beyond v1

The broad product-completion objective is [issue #182](https://github.com/giltik123/bers23/issues/182), coordinated by the [BERS Master Development Plan / issue #1090](https://github.com/giltik123/bers23/issues/1090). The unit of completion is an end-to-end user journey through the canonical authorities in `PROJECT_SOURCE_OF_TRUTH.md`, not the presence of a UI component or an experimental model.

[BERS v1.0 / issue #365](https://github.com/giltik123/bers23/issues/365) is a finite intermediate release milestone. It does not close #182 or end product development; continue against the open product backlog and accepted post-v1 work after that milestone.

Long-term companion tracks:

- [Voice Input Architecture](BERS_VOICE_INPUT_ARCHITECTURE_ROADMAP.md) / [issue #536](https://github.com/giltik123/bers23/issues/536) — the Russian-first Voice Intent Layer; Voice proposes typed intent and never becomes execution, Project, Artifact or Billing authority.
- [Hybrid Sparse Mobile Engine](BERS_HYBRID_SPARSE_MOBILE_ENGINE_ROADMAP.md) / [issue #352](https://github.com/giltik123/bers23/issues/352) — HSME architecture and real-device research.
- [Universal Local AI Runtime](BERS_UNIVERSAL_LOCAL_AI_RUNTIME_ROADMAP.md) / [issue #561](https://github.com/giltik123/bers23/issues/561) — shared Model Virtual Memory and cross-platform local runtime.
- [Model Lab / BYOM](BERS_MODEL_LAB_BYOM_ROADMAP.md) / [issue #563](https://github.com/giltik123/bers23/issues/563) — the separate advanced model environment and quarantined user-model lifecycle.

These companion documents guide sequencing and research but do not grant production authority. HSME, Universal Local AI Runtime and Model Lab/BYOM remain R&D until their own evidence gates are met; Voice remains an AEE intent layer. Current production code, accepted tests and the canonical source-of-truth document take precedence over stale inventory or historical plans.

## Core runtime

See [CORE_RUNTIME.md](CORE_RUNTIME.md) for the checked-in Node Core entrypoint, production composition, HTTP boundary, health/shutdown behavior, and deployment contract.

## Security

See [SECURITY_CONFIGURATION.md](SECURITY_CONFIGURATION.md) for server-side security configuration. Sprint 6.39C established the canonical browser/session boundary: HttpOnly browser sessions, Origin + session-bound CSRF enforcement, browser exploit-containment headers, PostgreSQL session authority, abuse controls, rotation and revocation.

## Android

See [ANDROID_RELEASE.md](ANDROID_RELEASE.md) for the Trusted Web Activity contour, SDK 36 build, fail-closed signing preflight, Digital Asset Links deployment and physical-device/Play release checklist. The wrapper preserves the canonical first-party Auth/Core boundary; a debug build is not production acceptance.

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
