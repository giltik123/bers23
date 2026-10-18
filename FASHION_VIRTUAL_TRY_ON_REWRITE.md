# Fashion try-on rewrite, 2026-10-18

Status: implementation candidate; not a production quality acceptance.

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

Migration 049 adds source-only VIRTUAL_TRY_ON lineage while retaining the prior check expression. A database insert guard binds new results to the current owned Project source and its dimensions. Exact persisted replay can reopen after Accept. Generic Project acceptance serializes the source check with history mutations, so another tab's accepted image disarms a stale result. User review remains mandatory before Accept; the existing face/garment/body/artifact checks now cover this operation. No provider failure silently falls back to a collage. Unknown outcomes are surfaced without an automatic retry.

## Validation recorded locally

- New canonical pipeline, consent, invalid bytes, aspect ratio, foreign scope, replay fingerprint, stale source and off-centre geometry plus disabled-provider admission: 9/9 passed.
- Exact output-host/MIME/byte/redirect policy: 8/8 passed.
- Existing controlled-local-edit and production FAL contracts: 24/24 passed.
- Server TypeScript, browser production build, server bundle and changed browser-file ESLint passed before final review; repeat checks apply to the final head.
- General creative-workflow suite: 123/132 passed, 9 failed. Substituting the original HEAD WorkflowEngine yields the same 9 failures (eight recovery cases and the existing provider-unavailable assertion). These are not reported as passing.
- New real PostgreSQL acceptance test covers persist/reopen/Accept/exact replay/stale and foreign sources/Undo/Redo. Local PostgreSQL was initially unavailable; the dedicated PR workflow provisions PostgreSQL 16. Database concurrency/authority acceptance is pending that exact-head CI.

## Observed production configuration

Railway OAuth inventory for bers-v1-core/production confirms FAL_KEY is absent, including sealed variable names. The running main service therefore cannot perform FAL inference. The new resolver fails with an explicit 503 before reading or transmitting photos when the provider is disabled. The operator must add FAL_KEY through protected Railway Variables and configure CREATIVE_PROVIDER=FAL; never paste credentials into an issue, PR or chat. This is a release blocker, not a subscription check.

## Remaining release evidence

No live FASHN inference was executed in this workspace. There is no new real-photo output PNG or screenshot proving this candidate works on the supplied red-shirt/full-body and grey-jacket photographs. Do not describe transport tests or the former READY status as successful visual try-on.

Before release: require exact-head hosted CI, apply migration 049, deploy the candidate with the existing server FAL configuration, then run authorized real-photo comparisons and save actual output files. Inspect garment identity, body alignment, face/hair, hands/occlusion, old clothing leakage and background, plus Accept/reopen/download/Undo/Redo. Include ordinary and difficult photos and document failures. No promise of correct output for every possible photograph is justified. A separate undressed-person image is neither required nor produced by this clothed try-on workflow.
