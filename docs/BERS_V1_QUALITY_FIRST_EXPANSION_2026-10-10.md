# BERS 1.0 — Quality-first expansion directive (2026-10-10)

Owner mandate: **postpone BERS 1.0; continue developing, auditing and adding useful product capabilities until an explicitly accepted quality and functionality bar is met**. No release date is committed. This changes schedule and scope priority, **not** the technical identity/security/consent rules.

## Release control

- `main` is the sole canonical development/release line. `BERS_V1_RC` remains one reviewed, accepted exact commit on `main`; no separate long-lived release branch.
- `config/v1-release-readiness.json` remains authoritative. It currently says `rcSelectable:false`, `rcCoordinate:null`. **Do not set either to a release-ready value** while any mandatory production gate remains open.
- Existing blockers #230 (Fashion real-image quality) and #233 (hosted deployment/exact-final SHA) remain mandatory. Add actual existing-data PostgreSQL upgrade/backup/restore and forward-compatible rollback evidence (#962) to the production launch checklist. Do not infer final production safety merely from an empty blocker array.
- Hosted frontend evidence is **SHA-specific**. Any merge to `main` requires fresh deployment and rerun before a future RC selection. Existing evidence for `85086ff0...` may not certify a later SHA.
- HSME physical-mobile research #352/#871 remains explicitly **deferred post-v1** by the earlier owner decision. It remains non-production. Do not implicitly make every HSME research ticket part of the expanded v1 production acceptance just because delivery is postponed.
- Billing/payments, broad Agent autonomy, voice, Model Lab and unadmitted AI model packs are **not automatically activated** by the owner's permission to expand functions. New authority requires server-owned contracts, licensing, user consent and independent positive test evidence.

## Expanded product scope: prioritized, finite release candidate backlog

A postponement without a finite backlog can make a release impossible. For each proposed v1 addition below, record whether it is **v1 candidate** or a **later investigation** after implementation, end-to-end evidence, resource review and product acceptance.

| Priority | Capability | Outcome required | Status at 2026-10-10 |
| --- | --- | --- | --- |
| P0 | Fashion occlusion/pose/garment fidelity | Real-photograph arm/hair/pose/logo review, immutable per-output hash, measured resource profile and owner-accepted scope | #230 BLOCKED; #980/#983/#986 research only |
| P0 | Data durability, existing database upgrades and rollback | Real Postgres migration from seeded pre-upgrade data, backup/restore and restored production-image readiness | #962 OPEN |
| P0 | Existing Core/Editor browser journeys + hosted security | Exact accepted `main` SHA, cross-tenant/source-conflict protection, signed Artifact integrity and live deployed headers | #233 ledger pending; historical hosted proof is not a new RC |
| P0 | Main Editor image fidelity and professional comparison | Real-photo crop/resize/color/alpha/ICC/EXIF review, accepted Project FINAL parity and safe before/after comparison | #987 review/evidence; current PR adds interactive split/zoom without pixel processing |
| P1 | **Quality Inspector** in the Editor | Accessible same-geometry split, synchronized zoom/pan, safe mismatch messaging; never itself Accepts | Implemented in this PR, CI/review pending |
| P1 | Canonical **Export Studio** | Download only authorized FINAL/Project image identity; JPEG/PNG/WebP ICC, size and transparent-background policy; no legacy `UploadFile` authority | Proposed; production-wiring audit required |
| P1 | Non-destructive **Layer/Adjustment Studio** | Real stored compositing pixels, reorder/visibility/blend/masks, durable versions and Core-verified FINAL, source-bound undo | Existing metadata/prototype only |
| P1 | Smart Selection + manual boundary repair | High-resolution subject/hair/garment mattes bound to source SHA; explicit user override/QA | Existing selection primitives; segmentation model admission pending |
| P1 | Professional RGB/Curves/HSL and localized retouch | Versioned deterministic pixel laws, Core recomputation, real-photo color/edge review, reversible history | Partially experimental/not yet production-admitted |
| P2 | Batch Recipes and unified Asset Library | Preview-safe multi-project plans; no paid/cloud fallback, exact outputs and cancel/recovery; canonical garment/Project assets | Existing prototypes only |
| P2 | Advanced local AI editing and Voice/Agent workflows | Device + license + privacy + cost + GPU/latency/quality evidence before activation | Separately gated R&D |

`P0/P1/P2` priorities specify *execution order*, not automatic v1 promotion. Product scope additions will be finite, versioned and reviewed; broad speculative roadmaps can continue after release without silently blocking the focused release candidate.

## Quality definition of DONE for any v1 capability

1. User journey is reachable through production UI and canonical Auth/Project/Artifact/Core, with clear error, cancellation and recovery behavior.
2. Exact-source lineage, tenant/project isolation, explicit Preview -> Accept and stable undo/history remain correct; client does not issue Project/Artifact/financial authority.
3. The Pixel/AI implementation has independent fixture tests **plus** representative real-photo visual evaluation and documented limitations. For generative features, logo/text preservation, identity and foreground occlusion are reviewed explicitly.
4. Measured latency p50/p95 and peak RAM/VRAM/battery where applicable, bounded on representative target hardware; no hidden network/cloud side effects under `LOCAL_ONLY`.
5. Accessibility: mouse/touch/keyboard, accessible control names, loading and failure messages; responsive, long-session and refresh recovery.
6. CI is green on the exact accepted SHA; review includes deterministic byte integrity, real Core/PostgreSQL/browser where authority matters, plus live deployed proof for RC.
7. External providers/weights have verified commercial rights, uploaded photo disclosure/consent, server-only credentials and validated cost/entitlement policy.
8. Any failed gate stays open; **no date-driven override or fake PASS**.

## First delivered expansion: the Quality Inspector

`src/components/editor/ResultCompare.jsx` now offers an optional Preview-only inspection experience:

- existing Before and After, plus a **split comparison available only when both images decode to identical pixel geometry**;
- a keyboard-accessible 0–100% split control and synchronized 1×/2×/4× *relative-to-fit* zoom, pointer/arrow-key pan, reset;
- image-load failure and geometry mismatch explanations; changing previews resets transient inspector state;
- no change in the execution result bytes, provider, accepted Artifact, Billing or user-created mask;
- original **Accept / Retry / Discard** callbacks and disabled-on-busy semantics preserved.

This is a user-experience feature, **not** a claim that the underlying photo-generation model has improved. Dedicated browser tests use an isolated component fixture to avoid confusing a UI preview test with full Core/PostgreSQL release acceptance.

## Next engineering milestones

Finish the focused Inspector acceptance, then implement a secure **export-to-download path** for canonical Project/FINAL artifact bytes (with real browser + Core tests), follow with the non-destructive editing/layer architecture and independent color-quality cases. Work on high-fidelity Fashion occlusion in parallel, behind its existing release quality gate. Refresh and re-review the release backlog before selecting an exact new RC.
