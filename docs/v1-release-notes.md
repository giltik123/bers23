# BERS v1.0 release notes — pre-RC package

Target release: **BERS v1.0 / 1.0.0**.

This document is the prepared release-note package, not a declaration that v1.0 has shipped. No RC is currently selected. Masked Levels is part of the candidate production surface in this branch, while fresh hosted frontend evidence remains unresolved. HSME physical-mobile validation is owner-deferred post-v1 and is not an RC blocker.

## Included production surface

- Canonical Core authentication/session, Project and Artifact authority.
- Explicit Preview -> Accept / Discard with durable history, Undo/Redo/Version/Restore and stale-source recovery.
- Deterministic Editor v1: Crop, Resize, Rotate/Flip, canonical Selection/MASK, Background Isolation, Masked Exposure, Masked White Balance and Masked Levels.
- Managed Wardrobe, garment multi-view metadata, Collections and canonical ordered Outfits.
- Deterministic one-garment Try-On through canonical readiness, body anchors, mesh warp, texture composite, FINAL Preview and explicit Project Accept.
- Bounded Agent/AEE v1 path with durable canonical run recovery.
- Bounded durable Automation subset.
- Job Center canonical reconciliation plus owning cancel/retry controls.

## Deliberately not enabled

- Global Levels remains a reviewed kernel but is not admitted as a standalone production Editor executor.
- MobileSAM, MODNet, Real-ESRGAN, Big-LaMa, Tiny-SD and Kandinsky remain CANDIDATE/R&D under the Stage D v1 decision matrix.
- HSME remains experimental/non-production. Its physical-mobile `R&D_VALIDATED` graduation milestone is post-v1 and does not block RC under the 2026-10-04 owner override.
- Billing/payments/subscriptions/credits remain disabled pending redesign.
- Voice input, persistent Agent memory and durable user ranking/feedback collection are not enabled.
- Broader autonomous/multimodal Agent behavior beyond the bounded accepted v1 subset is not enabled.

## Pre-RC evidence state

Repository protection is proven. Historical journey-22 evidence remains evidence for old SHA `6a5c63ed32e8ae82e500e5a1c4fe22409705b174` only.

Before a replacement RC can be selected:

1. merge the accepted product surface to `main`;
2. deploy the frontend at that exact new `main` SHA;
3. rerun canonical hosted frontend security evidence;
4. bind journey 22 to the same exact SHA;
5. select the replacement `BERS_V1_RC`.

HSME physical-mobile validation continues after v1 as field/graduation work and cannot grant production authority until separately proven.

Production Core rollout must independently satisfy migration, readiness, authentication/provider and security contracts before publication.
