# BERS v1 browser release journey matrix

This file is the human-readable companion to `config/v1-release-journey-matrix.json`.

The matrix binds every numbered journey from #233 to committed exact-head evidence. Journeys 1–16 and 18–21 are already represented by production-shaped browser/Core/PostgreSQL R3 evidence. Journey 17 is explicitly outside the current v1 scope because the financial/payment architecture is deferred for redesign. Journey 22 has repository-side security policy and a live-header verifier, but it remains **deployment-target pending** until the final canonical deployed frontend URL is actually checked.

This means #233 is no longer ambiguous: the remaining release work inside that issue is the real deployed frontend header proof, not another product feature or browser harness.

The matrix itself grants no runtime, Project, Artifact, provider, Billing, model, or deployment authority. A journey may move to `PROVEN` only when its referenced evidence exists and the dedicated hosted acceptance remains green.
