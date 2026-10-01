# BERS v1 external release evidence capture

Two mandatory v1 blockers live outside repository code: the final deployed frontend response and GitHub repository enforcement. These commands turn those external facts into machine-readable evidence without storing credentials.

## Final frontend security evidence

After the canonical frontend is deployed, the preferred evidence path is the GitHub Actions workflow **BERS v1 external release evidence tooling**.

Run it manually with:

- `frontend_url`: the final canonical HTTPS frontend URL;
- `core_api_url`: the canonical Core API URL, or `/api/core` for same-origin Core.

The manual run checks out the exact dispatched SHA, verifies that checkout, executes the live header verifier, and uploads a 90-day artifact named `bers-v1-frontend-security-<sha>` containing promotable evidence bound to that exact SHA and GitHub Actions run:

- `release-evidence/v1/frontend-security.json`;
- `release-evidence/v1/frontend-security.log`.

The hosted JSON is self-contained for journey 22 promotion: in addition to the observed deployment facts it records `verifiedSha`, the exact `workflowRunUrl`, and the exact `artifactName`. These three provenance fields are validated as one atomic binding.

The dispatch requires HTTPS and the verifier rejects credentials, query strings, fragments, redirects, non-HTML roots, and missing/incorrect production response headers.

The same verifier can also be run locally for diagnostic/header capture:

```sh
FRONTEND_URL=https://app.example.com \
CORE_API_URL=https://api.example.com/api/core \
EVIDENCE_OUT=release-evidence/v1/frontend-security.json \
npm run release:evidence:frontend
```

For same-origin Core use `CORE_API_URL=/api/core`.

A local invocation does not invent hosted GitHub provenance, so its JSON alone cannot promote journey 22 or clear #233. Use the hosted exact-SHA workflow for release-promotable evidence.

The verifier requires a direct 2xx HTML response, the exact production CSP including `frame-ancestors 'none'`, `nosniff`, `DENY`, `no-referrer`, and at least one year of HSTS for HTTPS. Evidence records the canonical URLs, observed headers and SHA-256 of the served HTML. It does not record cookies or credentials.

## GitHub main-protection evidence

Use a GitHub token that is allowed to **read repository administration/protection settings**. The token is read from the environment and is never written to evidence:

```sh
GITHUB_TOKEN=... \
GITHUB_REPOSITORY=giltik123/bers23 \
GITHUB_BRANCH=main \
EVIDENCE_OUT=release-evidence/v1/main-protection.json \
npm run release:evidence:github
```

The verifier accepts either:

- an active branch ruleset targeting `main`/the default branch with no bypass actors, exactly zero required approvals, strict status checks, deletion protection and non-fast-forward protection; or
- classic branch protection with exactly zero required approvals, strict required checks, administrator enforcement, force-push disabled, deletion disabled and no PR bypass allowances.

The v1 repository policy is intentionally CI-only for merge authorization: every change still goes through a pull request, but human approval is not a release requirement. The verifier therefore rejects any approval-count drift from zero as well as any bypass actor.

It requires these stable final checks:

- `BERS Required Acceptance`;
- `integrated-contract`;
- `npm-production-audit`;
- `fp16-webgpu-feasibility`;
- `wasm-compact-feasibility`;
- `ort-memory-latency-feasibility`;
- `short-pipeline-measurement`.

These are the universal acceptance/security gates plus the Tiny-SD final wrapper gates accepted by the CI hardening program. Internal heavyweight jobs that may legitimately be N/A are not used as required contexts.

All seven required contexts are emitted on both pull-request candidate SHAs and exact pushes to `main`. The final `v1.0.0` publisher verifies the successful contexts again on the exact accepted `main` release SHA before any tag or GitHub Release write is allowed. Tiny-SD wrapper workflows classify `push` relevance from the trusted previous `main` SHA (`github.event.before`) to the pushed SHA; heavyweight work remains conditional, while the stable outward wrapper context remains available for release verification.

## Evidence handling

Evidence output files contain only public configuration/result facts and timestamps; they do not contain the GitHub token or application secrets. Review the generated JSON, then attach/record it with the relevant release issue/evidence process.

Generating an evidence file does not itself remove a blocker. The corresponding release ledger may only be advanced after the evidence is reviewed against the exact release coordinate.
