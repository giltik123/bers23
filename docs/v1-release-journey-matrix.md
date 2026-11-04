# BERS v1 browser release journey matrix

This file is the human-readable companion to `config/v1-release-journey-matrix.json`. The machine-readable journey matrix and `config/v1-release-readiness.json` are authoritative for release disposition.

## Current journey disposition

In the current machine-readable matrix:

- Journeys 1–16 and 18–21 are `PROVEN` by their referenced production-shaped browser/Core/PostgreSQL harnesses.
- Journey 17 is `DEFERRED_OUT_OF_V1` because the financial/payment architecture is explicitly deferred for redesign under #189.
- Journey 22 is currently `DEPLOYMENT_TARGET_PENDING`. The release-readiness ledger separately retains `FRONTEND_DEPLOYMENT_HEADERS` as `EXTERNAL_DEPLOYMENT_EVIDENCE_PENDING`.

A previous live frontend verification was recorded for `main@c5292b4a65341050d664de715eff2feff0b4b32f`; it returned HTTP 200 and matched the production security-header contract. That run is historical evidence for that exact SHA only. It is not proof that a later main or release-candidate SHA is deployed with the same headers.

Keep journey 22 pending until the live verifier succeeds for the intended candidate and the machine-readable matrix records its exact verified SHA, HTTPS frontend URL, Core API coordinate, HTML SHA-256, verification timestamp, workflow-run URL, and exact `bers-v1-frontend-security-<sha>` artifact name. Do not change the disposition based on a plausible URL, a prior deployment, or a successful source-contract test.

## Exact evidence verification

When journey 22 is `PROVEN`, hosted CI independently resolves the recorded workflow run, requires a successful `workflow_dispatch` of **BERS v1 external release evidence tooling** on the exact `verifiedSha`, downloads the exact named artifact, and compares its `frontend-security.json` projection to the committed `liveEvidence`. A plausible URL or artifact name without matching hosted evidence fails closed.

The matrix itself grants no runtime, Project, Artifact, provider, Billing, model, or deployment authority. A journey may move to `PROVEN` only when its referenced evidence exists and the dedicated hosted acceptance remains green. RC selection remains governed by `config/v1-release-readiness.json`; this document does not promote a release or close #233.
