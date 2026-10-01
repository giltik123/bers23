# BERS v1.0 release notes — RC selected package

Target release: **BERS v1.0 / 1.0.0**.

This document is the prepared release-note package. It is intentionally **not** a declaration that v1.0 has shipped. The selected RC product coordinate is `c335ccf93d2f467d6f990d765214c7c10818ef7d`; the final release SHA and `v1.0.0` tag remain unset until the fail-closed publication sequence completes.

## Included production surface

- Canonical Core authentication/session, Project and Artifact authority.
- Explicit Preview -> Accept / Discard with durable history, Undo/Redo/Version/Restore and stale-source recovery.
- Deterministic Editor v1: Crop, Resize, Rotate/Flip, canonical Selection/MASK, Background Isolation, Masked Exposure and Masked White Balance.
- Managed Wardrobe, garment multi-view metadata, Collections and canonical ordered Outfits.
- Deterministic one-garment Try-On through canonical readiness, body anchors, mesh warp, texture composite, FINAL Preview and explicit Project Accept.
- Bounded Agent/AEE v1 path with durable canonical run recovery.
- Bounded durable Automation subset.
- Job Center canonical reconciliation plus owning cancel/retry controls.
- Built-SPA + built-Core + real-PostgreSQL browser release evidence for the enabled product journeys.

## Deliberately not enabled

The following existing code/research does not gain production authority merely by shipping in the repository:

- Levels / Masked Levels reviewed kernels are not admitted production Editor executors.
- MobileSAM, MODNet, Real-ESRGAN, Big-LaMa, Tiny-SD and Kandinsky remain CANDIDATE/R&D under the Stage D v1 decision matrix.
- HSME remains non-production. Physical-mobile qualification is explicitly deferred to post-v1 research and grants no v1 production authority.
- Billing/payments/subscriptions/credits are deferred for redesign and are outside the v1 product floor.
- Voice input, persistent Agent memory and durable user ranking/feedback collection are not enabled v1 production surfaces.
- Broader autonomous/multimodal Agent behavior beyond the bounded accepted v1 subset is not enabled.

## RC evidence state

The mandatory pre-RC external evidence is now recorded:

1. journey 22 hosted frontend security evidence is bound to exact SHA `c335ccf93d2f467d6f990d765214c7c10818ef7d` by workflow run `36844106916` and artifact `11151894847`;
2. GitHub `main` is protected by active ruleset id `24246282` with PR-only updates, zero mandatory human approvals, strict seven-check enforcement, blocked deletion/non-fast-forward updates, and no bypass actors.

Physical-mobile HSME qualification remains open post-v1 research and is not a v1 RC blocker.

RC selection does **not** authorize publication. Before `v1.0.0` is created, the remaining finalization sequence still requires the reviewed release-authorization metadata transition, exact-main mandatory checks, the fail-closed publisher, and immutable publication evidence. Production Core rollout must also satisfy its existing migration, readiness, authentication/provider, and security contracts; RC selection does not waive those requirements.
