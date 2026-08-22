# Canonical Planning Architecture

Production creative planning is a single advisory boundary behind `CanonicalDecisionPort` and `CanonicalPlanningPort`.

The production implementation is composed through `CanonicalDecisionService` and `CanonicalPlanningService` under `src/platform/creative/canonical/planning/`. It proposes deterministic operation plans from canonical request snapshots; it does not execute providers, authenticate users, authorize ownership, persist or mint artifacts, access PostgreSQL, or reserve/commit/release credits.

Canonical execution remains responsible for target selection, security gates, operation authority, billing transactions, provider runtime execution, verification, recovery and artifact persistence. Planning provenance carries canonical artifact identities/roles supplied by Core and is not proof of ownership by itself. Candidate target preferences, quality/cost/latency estimates and score breakdowns are advisory facts only and are revalidated by downstream Core authorities before side effects.

## Sprint 6.40B planning model

`CreativePlan` now supports deterministic DAG proposals, immutable planning constraints, ranked candidates, decomposed uncertainty and explicit `READY`, `NEEDS_CONFIRMATION` and `BLOCKED` states. A composite edit can be represented as `segment -> remove -> background_replace -> relight -> verify` with stable operation IDs and explicit dependencies.

Constraints include preserve/must-change/forbidden references, execution policy (`LOCAL_ONLY`, `CLOUD_ALLOWED`, `CLOUD_PREFERRED`, `AUTO`), advisory max-credit/max-latency/minimum-quality envelopes and confirmation policy. Planning constraints are explicit planner inputs; canonical execution budgets and transaction facts are not reinterpreted as planner authority.

Candidate generation is deterministic. Feasible strategies receive explainable quality, cost-efficiency, latency, reliability and confidence scores with stable candidate-ID tie-breaking. Rejected candidates retain secret-free reason codes. `LOCAL_ONLY` is hard: a cloud candidate is rejected during planning, and the execution facade independently rejects an actual downstream cloud target if a forged or stale plan attempts to violate the policy.

Uncertainty is tracked independently for intent interpretation, target resolution, feasibility/capability and preservation risk. Material uncertainty produces `NEEDS_CONFIRMATION`; no feasible candidate produces `BLOCKED`. `CreativeExecutionPlatform` validates plan integrity and executable status before target selection, security checks, operation authority, billing or runtime calls.

DAG validation fails closed on duplicate IDs, missing/self/cyclic dependencies, undeclared artifact references, conflicting writers, missing/rejected selected candidates, forged candidate projections and selected-candidate constraint violations. URLs, bearer/cookie/CSRF values and provider secrets are not planning provenance or ownership evidence.

Verification/fallback/replay telemetry expansion remains Sprint 6.40C scope.
