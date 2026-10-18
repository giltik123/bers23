# Fashion try-on rewrite, 2026-10-18

Status: implementation candidate with a successful live two-photo inference; hosted CI and the deployed product journey remain release gates.

## Failure and resulting behavior

The observed preview pasted a narrow strip of the garment donor photo onto the person. The existing default was a manual contour/body-anchor mesh warp, not a garment-aware try-on model. Destination geometry also mapped photo-normalized garment coordinates directly into the body frame, shrinking and offsetting an already off-centre garment again.

The primary Outfits flow now takes the current Project photo plus one active managed Wardrobe garment and executes FASHN v1.6 via the existing server FAL runtime. No outfit, contour, body anchors or segmentation masks are prerequisites. The donor may be an on-model photo. Supported model categories are tops, bottoms and dresses; footwear/accessories are not advertised as supported. Source/reference frames are resized proportionally within 2048 px for transport without cropping. The complete result is decoded, checked for near-identical aspect ratio and restored to the Project canvas dimensions. This is not evidence of identity preservation or realistic fabric.

The deterministic mesh tool remains explicitly labelled as an advanced pixel transfer. Its source coordinates retain their sampling positions; destination mapping now normalizes the garment's own extent. A reproduction test uses the observed off-centre region and proves the destination fills the same torso frame as a full-frame reference.

## Decision

| Criterion | Correct the mesh only | Generic image edit/inpainting | Specialized try-on through canonical Creative (selected) |
| --- | --- | --- | --- |
| Correctness | Fixes strip; cannot infer cloth or occlusion | Prompt-dependent garment fidelity; masks still need acquisition | Explicit person + garment input and garment category |
| Authority | Existing canonical local execution | Can reuse Creative; no reason to bypass it | Reuses Auth, Project, Wardrobe, Artifact, Creative and Transaction authorities |
| Security and integrity | No new external transmission | Cloud data and mask permissions | Explicit photo transmission consent; owned canonical bytes only; server key; strict output host policy |
| Maintainability | Small patch, fundamentally limited behavior | More prompt/mask policy and ambiguous input contract | Small closed provider schema and existing provider runtime |
| Testability | Exact geometry/pixel tests | Transport testable; visual quality requires live images | Full canonical pipeline tested with stub transport; real quality still requires live images |
| Regression risk | Low code risk but fails product requirement | Risk of unrelated edits and poor reference fidelity | Isolated operation type; legacy manual flow retained; source-bound FINAL |
| Performance and cost | Local, inexpensive | Paid inference with uncertain repeated attempts | One quality inference; no automatic retry/fallback; existing billing and budgets |

A browser-to-provider integration or a second side-effecting execution service was rejected: each would duplicate canonical ownership, execution and billing authority.

## Ownership, acceptance and storage

The public command carries only garmentId and a consent boolean, in addition to the existing canonical source/request identifiers. Source must be current and owned. The server loads the active owned garment's primary view and Wardrobe category, and hashes the view identity/content/category into the replay fingerprint. Client URLs, arbitrary provider payloads and manual body geometry are not accepted for this path.

FAL receives two server-materialized PNG inputs. Its result uses the existing bounded MIME/byte loader. Only the exact documented cdn.fashn.ai host is added to fal.media/v3.fal.media; subdomains, lookalikes and forbidden redirects stay blocked. Safety checking is always enabled. Runtime verification proves decoded structure and input lineage, not visual quality.

Migration 049 adds source-only VIRTUAL_TRY_ON lineage while retaining the prior check expression, and closes optional refinement fields only when that independent extension is present. It does not load the F5 refinement migration into F4-only bundles. A database insert guard binds new results to the current owned Project source and its dimensions. Exact persisted replay can reopen after Accept. Generic Project acceptance serializes the source check with history mutations, so another tab's accepted image disarms a stale result. User review remains mandatory before Accept; the existing face/garment/body/artifact checks now cover this operation. No provider failure silently falls back to a collage. Unknown outcomes are surfaced without an automatic retry.

## Validation recorded locally

- New canonical pipeline, consent, invalid bytes, aspect ratio, foreign scope, replay fingerprint, stale source and off-centre geometry plus disabled-provider admission: 9/9 passed.
- Exact output-host/MIME/byte/redirect policy: 8/8 passed.
- Existing controlled-local-edit and production FAL contracts: 24/24 passed.
- Canonical service cancellation/reservation/replay and product vertical regression: 28/28 passed.
- Production migration inventory and strict subset packaging: 5/5 passed after removing the unnecessary F5 migration dependency.
- Server TypeScript, browser production build, server bundle and changed browser-file ESLint passed before final review; repeat checks apply to the final head.
- General creative-workflow suite: 123/132 passed, 9 failed. Substituting the original HEAD WorkflowEngine yields the same 9 failures (eight recovery cases and the existing provider-unavailable assertion). These are not reported as passing.
- New real PostgreSQL acceptance test covers persist/reopen/Accept/exact replay/stale and foreign sources/Undo/Redo. Local PostgreSQL was initially unavailable; the dedicated PR workflow provisions PostgreSQL 16. Database concurrency/authority acceptance is pending that exact-head CI.

## Live provider evidence, 2026-10-18

The operator added FAL_KEY through Railway Variables. Its value remained redacted to this agent. A temporary QA runtime ran the exact bundled production FAL workflow code against the supplied 600x900 red-shirt person photo and 740x415 on-model grey-jacket reference. It did not access a database. The original unused schema-inspector start configuration was restored after the QA process exited, temporary credentials/code were cleared, and its temporary public domain was removed.

The first live request exposed an existing provider adapter defect: queue control URLs (status_url/response_url/cancel_url) were treated as output artifacts, so the request bypassed polling and failed output egress validation. The response mapper now excludes these control URLs, the tracker polls before fetching final image bytes, and authenticated control URLs must stay within the configured HTTPS API origin. An actual queue-shaped full-pipeline fixture and a foreign-origin credential test cover this boundary. The expanded FAL/try-on/cancellation suite passes 165/165 locally.

After the fix, the live request returned a real PNG: 600x900, 331316 bytes, 26442 ms including uploads, model inference and download. Local filename: BERS-Fashion-FASHN-real-output.png. The image is a separate private QA deliverable, not a repository fixture. SHA-256: 5239c99f6db758c88ead986df2740f1a7ca0f82501b685134238d77819e122da.

Visual review: the red T-shirt was replaced by a grey jacket/white shirt, the full garment occupies the torso and sleeves, and the target face, hair, hands, jeans, shoes and background appear preserved. This eliminates the demonstrated narrow-strip failure for this pair. Fabric texture is smoother than the reference; button and tailoring details are not exact. One successful pair does not prove correct output for every photograph or exact commercial garment fidelity.

## Remaining release evidence

Require hosted CI on the final head. Earlier exact-head Virtual Try-On PostgreSQL CI passed, including persist/reopen/Accept/replay/immutability/stale and foreign source/Undo/Redo. Follow-up changes fix legacy migration inventory expectations, standalone fixture SQL loading and navigation harness expectations for the new picker; those gates must pass again on the final head.

After accepted CI and merge, verify the actual deployed BERS UI with cloud provider enabled: preview, explicit review/Accept, reopen, download and Undo/Redo. Runtime-level live model evidence above is not a claim that the production browser journey has already passed. No undressed-person image is required or produced by this clothed try-on workflow.
