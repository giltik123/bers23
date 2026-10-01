# BERS v1.0 release notes — publication authorization package

Target release: **BERS v1.0 / 1.0.0**.

This is the final publication package for **BERS v1.0 / 1.0.0**. It does **not** claim that the immutable `v1.0.0` tag or GitHub release already exists. The selected RC product coordinate is `6a5c63ed32e8ae82e500e5a1c4fe22409705b174`; the exact published SHA is discovered only by the fail-closed publisher.

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

## Publication authorization evidence

The mandatory pre-RC external evidence is now recorded:

1. journey 22 hosted frontend security evidence is bound to exact SHA `6a5c63ed32e8ae82e500e5a1c4fe22409705b174` by workflow run `36846842313` and artifact `11153896139`;
2. GitHub `main` is protected by active ruleset id `24246282` with PR-only updates, zero mandatory human approvals, strict seven-check enforcement, blocked deletion/non-fast-forward updates, and no bypass actors.

Physical-mobile HSME qualification remains open post-v1 research and is not a v1 RC blocker.

The repository package is prepared for the `RELEASE_AUTHORIZED` transition: package metadata is `1.0.0`, the intended tag is `v1.0.0`, and `releaseSha`/publication evidence remain unset until the publisher succeeds. Merge and publication remain operationally blocked until production Core satisfies its migration, readiness, authentication/provider, and security contracts. The fail-closed publisher must then re-prove the exact authorization SHA, seven mandatory checks, RC ancestry, metadata-only delta, and unused release namespace before writing the tag/release.
