# Canonical Planning Architecture

Production creative planning is a single advisory boundary behind `CanonicalDecisionPort` and `CanonicalPlanningPort`.

The production implementation is composed through `CanonicalDecisionService` and `CanonicalPlanningService` under `src/platform/creative/canonical/planning/`. It proposes deterministic operation plans from canonical request snapshots; it does not execute providers, authenticate users, authorize ownership, persist or mint artifacts, access PostgreSQL, or reserve/commit/release credits.

Canonical execution remains responsible for target selection, security gates, operation authority, billing transactions, provider runtime execution, verification, recovery and artifact persistence. Planning provenance carries canonical artifact identities/roles supplied by Core and is not proof of ownership by itself.

Sprint 6.40A intentionally preserves the previous single-operation GLOBAL_EDIT / CONTROLLED_LOCAL_EDIT behavior while moving the algorithm out of production composition. DAG planning, candidate ranking, uncertainty, bounded replanning and richer verification policy are subsequent slices under Sprint 6.40.
