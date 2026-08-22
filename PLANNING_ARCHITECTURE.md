# Canonical Planning Architecture

Production creative planning is a single advisory boundary behind `CanonicalDecisionPort` and `CanonicalPlanningPort`.

The production implementation is composed through `CanonicalDecisionService` and `CanonicalPlanningService` under `src/platform/creative/canonical/planning/`. It proposes deterministic operation plans from canonical request snapshots; it does not execute providers, authenticate users, authorize ownership, persist or mint artifacts, access PostgreSQL, or reserve/commit/release credits.

Canonical execution remains responsible for target selection, security gates, operation authority, billing transactions, provider runtime execution, verification, recovery and artifact persistence. Planning provenance carries canonical artifact identities/roles supplied by Core and is not proof of ownership by itself.

Sprint 6.40B preserves the previous single-operation GLOBAL_EDIT / CONTROLLED_LOCAL_EDIT behavior and adds a versioned, deterministic composite-intent rule for `segment -> remove -> background_replace -> relight -> verify`. Candidate DAGs have stable IDs, explicit dependencies and declared intermediate artifact identities. `validateCreativePlan` rejects duplicate/missing/self/cyclic dependencies, undeclared artifact flow, conflicting writers, invalid candidate projection and non-executable plan status before target selection, billing or runtime work.

Planning constraints are immutable request advice: preservation requirements, required changes, forbidden targets/regions, advisory cost/latency/quality envelopes, confirmation policy and `LOCAL_ONLY | CLOUD_ALLOWED | CLOUD_PREFERRED | AUTO`. These planner envelopes are explicit planning inputs; the canonical execution budget is not silently reinterpreted as planning authority. `LOCAL_ONLY` is revalidated against both the advisory candidate and the actual downstream `TargetSelectorPort` result before SecurityGate, operation authority or billing.

For composite requests the planner compares deterministic local-efficient and cloud-quality candidates. A documented weighted score covers quality, cost efficiency, latency, reliability and confidence, with candidate ID as an insertion-order-independent tie break. Rejected candidates remain in provenance with stable, secret-free reason codes. Estimates remain advice and cannot authorize or reserve credits.

Composite candidate target preferences are not provider identities. The current production FAL workflow runtime does not yet implement the declared five-step intermediate-artifact contract, so production composition leaves `compositeExecutionEnabled` false and composite proposals return `BLOCKED` with `COMPOSITE_EXECUTION_NOT_WIRED`. Tests may inject the pure capability flag to validate DAG projection, but production must not enable it until Execution Fabric/provider capability integration proves the operation and artifact contracts. This avoids turning an advisory strategy label into runtime authority or reserving spend for an unsupported workflow.

Uncertainty is represented independently for intent interpretation, target resolution, feasibility/capability and preservation risk, plus aggregate confidence. Configurable thresholds turn low intent confidence, unresolved targets and unpermitted preservation risk into `NEEDS_CONFIRMATION`. The execution platform performs only generic fail-closed plan/target validation; all planning heuristics stay in the pure planning package.

Planner target preferences, costs, capabilities, artifact relationships and provenance are never ownership or execution authority. Canonical target selection and security gates still revalidate operations before operation authority, transaction/billing, runtime, verification and persistence.
