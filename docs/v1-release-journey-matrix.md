# BERS v1 browser release journey matrix

This file is the human-readable companion to `config/v1-release-journey-matrix.json`.

The matrix binds every numbered journey from #233 to committed exact-head evidence. Journeys 1–16 and 18–21 are represented by production-shaped browser/Core/PostgreSQL R3 evidence. Journey 17 is deferred outside v1 with the financial redesign. Journey 22 is now **PROVEN** on the live Railway Frontend by hosted evidence run `37869753056` for exact deployed `main@85086ff0ce952b0df511e8538682d3153e663c62` (HTTP 200, production security headers, `deployedSha === verifiedSha`), with artifact `bers-v1-frontend-security-85086ff0ce952b0df511e8538682d3153e663c62` (id `11589543970`, SHA-256 digest `7236f92479cf392515136a9956368a6c2f54266846a1126e211272e5532a9b22`).

Journey 22 may move to `PROVEN` only after the live verifier succeeds and the matrix records machine-readable evidence: exact verified SHA, HTTPS frontend URL, Core API coordinate, HTML SHA-256, verification timestamp, workflow-run URL, and the exact `bers-v1-frontend-security-<sha>` artifact name. At that point #233 has no unresolved in-v1 journey; issue closure by itself is not evidence.

When journey 22 is `PROVEN`, hosted CI independently resolves the recorded workflow run, requires a successful `workflow_dispatch` of **BERS v1 external release evidence tooling** on the exact `verifiedSha`, downloads the exact named artifact, and compares its `frontend-security.json` projection to the committed `liveEvidence`. A plausible URL or artifact name without matching hosted evidence fails closed.

This records the accepted journey-22 deployment proof and clears the corresponding frontend-header ledger blocker. It does **not** assert that live email registration, OTP delivery or password reset have been exercised end-to-end; those require independent functional smoke evidence. The Fashion quality R2 gate remains blocked awaiting explicit owner acceptance.

The matrix itself grants no runtime, Project, Artifact, provider, Billing, model, or deployment authority. A journey may move to `PROVEN` only when its referenced evidence exists and the dedicated hosted acceptance remains green.
