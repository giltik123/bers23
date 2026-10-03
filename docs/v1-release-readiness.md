# BERS v1 RC readiness guard

The release program has a fail-closed machine-readable coordinate at `config/v1-release-readiness.json`.

It deliberately does **not** use the number of open GitHub issues as release truth. RC selection advances only from reviewed mandatory release evidence.

## Current state

`BERS_V1_RC` is **not selectable**.

The previously selected product coordinate `6a5c63ed32e8ae82e500e5a1c4fe22409705b174` remains useful historical hosted evidence, but it is no longer an active RC because mandatory pre-RC evidence is still incomplete.

Current blockers:

- `FASHION_REAL_IMAGE_QUALITY` / #230: the canonical Wardrobe/Outfit/Try-On authority and browser journey are software-proven, but v1 still requires representative real-image review of garment/logo/pattern preservation, observed failure modes, latency and memory. This quality gate remains separate from functional E2E so a successful workflow cannot be relabeled as a proven product-quality result.
- `HSME_REAL_MOBILE_EVIDENCE` / #352 (related #862/#867/#871): HSME remains `RND_IMPLEMENTATION_EVIDENCE_PENDING`. The remaining debt is broader than device capture: trusted dense-baseline finalization (#762), a real Adapter-MoE prototype/comparison (#789), FreeToken-derived runtime evidence (#812), real HSME-5/6/7 dispositions (#826/#835/#851), trusted physical-mobile evidence (#871), and the final integrated dense-vs-HSME disposition (#869) are all still required.

HSME remains non-production. Satisfying the R&D gate does not grant provider, Billing, Project, Artifact, model-promotion or cloud-fallback authority.

GitHub repository protection remains proven by active ruleset `BERS v1 main release protection` (id `24246282`) with seven strict required checks, PR-only updates, no bypass actors, and deletion/non-fast-forward updates blocked.

The existing journey-22 hosted frontend evidence remains valid evidence for its exact historical SHA. If product code changes before the eventual RC, journey 22 must be rerun on the new exact accepted SHA.

## State transitions

- Until accepted Fashion quality/resource evidence exists, `FASHION_REAL_IMAGE_QUALITY` must remain in the blocker array. Removing it requires one reviewed `BERS_V1_FASHION_REAL_IMAGE_QUALITY_EVIDENCE` record bound to the exact intended RC SHA, with representative real-image cases, garment/logo/pattern preservation review, failure-mode review, measured latency/memory, immutable quality/resource digests and a retrievable HTTPS evidence location.
- While HSME is not `R&D_VALIDATED`, `HSME_REAL_MOBILE_EVIDENCE` must remain in the blocker array, `rcSelectable=false`, `rcCoordinate=null`, and status `BERS_V1_RC_NOT_SELECTABLE`.
- `R&D_VALIDATED` requires no HSME blockers, trusted physical-mobile qualification state `REAL_MOBILE_QUALIFICATION_READY_NOT_ADMITTED`, a valid qualification evidence digest, and a final `ADVANCE / REDESIGN / REJECT` architecture decision.
- Frontend hosted evidence and main protection remain independent gates.
- With all blockers cleared, the selected RC must still equal journey 22's reviewed exact deployed SHA.
- Billing redesign (#189) and optional Editor expansion (#192) remain non-blocking unless an enabled release journey makes them mandatory.

Package version remains `0.0.0`; no `v1.0.0` tag, release SHA, or publication evidence may be declared while this gate is blocked.
