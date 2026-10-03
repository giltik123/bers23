# BERS v1.0 release notes — pre-RC package

Target release: **BERS v1.0 / 1.0.0**.

This document is the prepared release-note package. It is intentionally **not** a declaration that v1.0 has shipped. Masked Levels is now part of the candidate production surface, so the previous RC coordinate has been invalidated; a replacement exact-main RC will be selected only after fresh hosted deployment evidence.

## Included production surface

- Canonical Core authentication/session, Project and Artifact authority.
- Explicit Preview -> Accept / Discard with durable history, Undo/Redo/Version/Restore and stale-source recovery.
- Deterministic Editor v1: Crop, Resize, Rotate/Flip, canonical Selection/MASK, Background Isolation, Masked Exposure, Masked White Balance and Masked Levels.
- Managed Wardrobe, garment multi-view metadata, Collections and canonical ordered Outfits.
- Deterministic one-garment Try-On through canonical readiness, body anchors, mesh warp, texture composite, FINAL Preview and explicit Project Accept.
- Bounded Agent/AEE v1 path with durable canonical run recovery.
- Bounded durable Automation subset.
- Job Center canonical reconciliation plus owning cancel/retry controls.
- Built-SPA + built-Core + real-PostgreSQL browser release evidence for the enabled product journeys.

## Deliberately not enabled

The following existing code/research does not gain production authority merely by shipping in the repository:

- Global Levels remains a reviewed kernel but is not admitted as a standalone production Editor executor.
- MobileSAM, MODNet, Real-ESRGAN, Big-LaMa, Tiny-SD and Kandinsky remain CANDIDATE/R&D under the Stage D v1 decision matrix.
- HSME remains non-production. Physical-mobile qualification is explicitly deferred to post-v1 research and grants no v1 production authority.
- Billing/payments/subscriptions/credits are deferred for redesign and are outside the v1 product floor.
- Voice input, persistent Agent memory and durable user ranking/feedback collection are not enabled v1 production surfaces.
- Broader autonomous/multimodal Agent behavior beyond the bounded accepted v1 subset is not enabled.

## RC evidence state

The previous journey-22 evidence remains historical evidence for the earlier product coordinate only. It is deliberately not attached to this feature branch's readiness ledger.

Before a replacement RC can be selected:

1. merge the accepted product change to `main`;
2. deploy the frontend at that exact new main SHA;
3. rerun canonical hosted frontend security evidence;
4. bind journey 22 to the new exact SHA;
5. reselect `BERS_V1_RC`.

GitHub `main` protection remains enforced by ruleset id `24246282`. Physical-mobile HSME qualification remains post-v1 research and is not a v1 RC blocker.

RC selection does **not** authorize publication. Production Core rollout must also satisfy its existing migration, readiness, authentication/provider, and security contracts.
