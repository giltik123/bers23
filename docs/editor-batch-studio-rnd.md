# BERS Editor — source-bound Batch Studio foundation (2026-10-10)

Status: **ORIGINAL R&D / NOT PRODUCTION ADMITTED**. Product owner postponed v1.0 for a quality-first expansion. This Batch Studio utility is not yet in the browser, Automation worker or canonical Core execution/Artifact authority.

## First working implementation

`EditorBatchStudioRND.ts` compiles and executes short, deterministic editing sequences **on real RGBA8 bytes, without any generative model**. The only steps are currently admitted Editor geometry kernels reused without changing their pixel laws:

- `CROP`: exact integer rectangle, row-by-row RGBA copy.
- `RESIZE`: canonical fixed-point bilinear, alpha-correct BERS Resize operation.
- `ORTHOGONAL_TRANSFORM`: the five exact byte-copy Rotate/Flip modes.

Each input plan is explicitly bound to a string Artifact reference and a **64-character SHA-256 of the actual decoded input RGBA**. Unlike a mere declared hash, execution recomputes the digest of the *real input bytes* and rejects mismatches. This still does **not** prove the caller owns that Core Artifact: Core must check that independently when integrated.

Execution revalidates the entire plan, closes arbitrary keys (e.g. provider side effects), constrains geometry to at most 4,194,304 pixels and 4,096 pixels per dimension, maximum 8 operations and total input+output pixel workload of 32 million visits. Input and output are copied; the result exposes a defensive byte getter and its own SHA-256. Abort is checked before hashing, between operations and before final output; a synchronous pixel loop itself is not interruptible.

All steps run only in memory with zero cloud/paid provider, no automatic FINAL, no Project/Artifact mutation, no future scheduled jobs and no credit spending. No job may be auto-accepted or silently uploaded.

## Tested correctness contract

`tests/editor-batch-studio-rnd.test.mjs` independently compares the compiled sequence with separate direct calls to the accepted BERS Crop/Resize/Rotate kernels; asserts exact PNG-independent RGBA byte equality and output digest; checks deterministic replay, alpha preservation and no input mutation; rejects hostile extra JSON parameters, unknown cloud/generative operations, stale/mismatched source SHA and geometry/budget abuses. Cancellation must fail closed, never return a partial published output.

CI is exact PR-head SHA, with build + tests + typecheck. Passing is a **local CPU operation contract**, not human visual proof of skin/ICC and not evidence of production authority.

## Graduation plan

1. Core must independently validate the authenticated user, tenant, Project, accepted source FINAL Artifact ID/SHA, current revision and any MASK before issuing a **bounded per-image execution ticket**; never trust browser claims.
2. Define a durable batch-run aggregate in Core/PostgreSQL. The browser may propose a job but may not mint durable idempotency keys, revision authority or FINALs. Every item has its own source-bound ticket.
3. Persist each step's tested parameters and intermediate geometry as a replayable, immutable plan, with strict memory/time budgets and real workstation/mobile metrics.
4. Use Job Center for explicit cancel, retry, partial failure and UNKNOWN reconciliation; stop/recover across process restarts without double-publishing.
5. Produce per-item reviewed Preview. Only a user-approved Accept may advance a Project's canonical FINAL/history. Batch does **not** bypass confirmation simply because all local steps succeeded.
6. Evaluate real-photo detail preservation, JPEG/ICC/EXIF and cumulative resize losses (avoid repeated interpolation where possible). Add production E2E against built SPA, Core and real PostgreSQL before UI admission.

*Goal*: reliable studio-scale batch editing with exact provenance, not an uncontrolled mass-edit script.
