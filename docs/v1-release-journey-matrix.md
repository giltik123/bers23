# BERS v1 browser release journey matrix

This file is the human-readable companion to `config/v1-release-journey-matrix.json`.

The matrix binds every numbered journey from #233 to committed exact-head evidence. Journeys 1–16 and 18–21 are already represented by production-shaped browser/Core/PostgreSQL R3 evidence. Journey 17 is explicitly outside the current v1 scope because the financial/payment architecture is deferred for redesign. Journey 22 is now **PROVEN** against the canonical Railway frontend by hosted exact-SHA evidence. The accepted run verified `main@c5292b4a65341050d664de715eff2feff0b4b32f`, returned HTTP 200, matched the production security-header contract, and uploaded the exact bound artifact recorded in the matrix.

Journey 22 may move to `PROVEN` only after the live verifier succeeds and the matrix records machine-readable evidence: exact verified SHA, HTTPS frontend URL, Core API coordinate, HTML SHA-256, verification timestamp, workflow-run URL, and the exact `bers-v1-frontend-security-<sha>` artifact name. At that point #233 has no unresolved in-v1 journey; issue closure by itself is not evidence.

When journey 22 is `PROVEN`, hosted CI independently resolves the recorded workflow run, requires a successful `workflow_dispatch` of **BERS v1 external release evidence tooling** on the exact `verifiedSha`, downloads the exact named artifact, and compares its `frontend-security.json` projection to the committed `liveEvidence`. A plausible URL or artifact name without matching hosted evidence fails closed.

This means #233 has no remaining in-v1 browser journey gap. The hosted deployment proof is now recorded in the machine-readable ledger; repository main protection (#355) remains the independent RC blocker.

The matrix itself grants no runtime, Project, Artifact, provider, Billing, model, or deployment authority. A journey may move to `PROVEN` only when its referenced evidence exists and the dedicated hosted acceptance remains green.
