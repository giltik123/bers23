# BERS v1.0 release notes — pre-RC package

Target release: **BERS v1.0 / 1.0.0**.

This document is the prepared release-note package. It is intentionally **not** a declaration that v1.0 has shipped. The exact release SHA and tag remain unset until the fail-closed RC readiness guard is clear.

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
- HSME remains non-production and still requires trusted physical-mobile evidence before the mandatory Stage E release gate can close.
- Billing/payments/subscriptions/credits are deferred for redesign and are outside the v1 product floor.
- Voice input, persistent Agent memory and durable user ranking/feedback collection are not enabled v1 production surfaces.
- Broader autonomous/multimodal Agent behavior beyond the bounded accepted v1 subset is not enabled.

## Release evidence still required

The repository is prepared for RC finalization, but the current release-readiness ledger remains fail-closed on external evidence:

1. final deployed frontend HTTP security-header verification;
2. GitHub-level protection/ruleset enforcement for `main`;
3. trusted physical-mobile HSME backend/device evidence required by the canonical roadmap.

Until those are removed from `config/v1-release-readiness.json`, no `BERS_V1_RC`, `v1.0.0` tag or release declaration is valid.
