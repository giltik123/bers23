# BERS 1.0 — owner-authorized quality-first expansion (2026-10-10)

**Authority:** product owner authorized postponing v1.0 and expanding the scope of professional editing and quality improvements. This document is a development decision, **not** a release tag, release-candidate selection, deployment request, quality acceptance or permission to weaken existing production boundaries.

## Release policy

- **v1.0 launch is postponed without a new date.** The existing `config/v1-release-readiness.json` must keep `rcSelectable: false` and all mandatory gates active until independent evidence is reviewed. Keep `config/v1-release-finalization.json` blocked and package version unpromoted.
- Development continues on `main` by reviewed, CI-verified PRs. Experimental capabilities remain separately versioned, disabled by default, unmerged or otherwise non-authorizing.
- Core alone authorizes tenant/user/Project, canonical source/MASK/FINAL Artifacts, secure persistence, execution tickets and explicit Preview → Accept. No browser, R&D tool or cloud API may bypass these boundaries.
- `LOCAL_ONLY` does not silently access paid services. Do not put Ideogram/FASHN remote calls, licenses, billed usage or third-party uploads into production without explicit provider admission and consent.
- Owner's prior **HSME physical-device post-v1 deferral** remains in force; postponing v1 does not implicitly mandate unsupported HSME promotion.

## Priority 0 — non-negotiable product integrity

1. **Exact-SHA release integrity:** close Fashion real-photo occlusion, text/logo/pattern/identity review and resources (#230). Re-run deployment security proof for final SHA (#233), and finish existing-DB upgrade, backup/restore, forward-schema compatible rollback (#962). Only then consider rc selection under the expanded product scope.
2. **Existing Editor visual/codec QA:** finish #987 real-photo crop/resize/rotation/masked color/export candidate bytes; add high-risk ICC, EXIF, transparent edges, gradients/skin tone, tablet/touch and export/download cases. Do not silently change accepted pixel laws.
3. **Reliable CI:** classify LaMa ONNX reproducibility conflicts and separate genuine required-check regressions from stale infrastructure. Faster scoped PR tests must not replace mandatory exact-main acceptance.

## Priority 1 — true professional Editor

| Program | First safely reviewable slice | Production graduation |
|---|---|---|
| Non-destructive raster layers | Independent `EditorRasterLayerStackRND`: bounded layers, masks, opacity, source-over, immutable RGBA buffers | Core-owned layer/asset data model, versioned layer stack, base-source SHA binding, repeatable pixel codec, undo/redo/restore, authenticated persistence, browser + Postgres E2E |
| Quality Inspector | Aligned before/after, zoom 100–200%, meaningful pixel/alpha and clipped-highlight diagnostics | Real-device screenshots, no mismatch between Preview, persisted FINAL and download |
| Export Studio | Audited local original-resolution JPEG/PNG/WebP encoder, ICC/EXIF/alpha rules, filesize estimate and 100% comparison | Canonical signed Artifact download, verified output bytes and tenancy; retire legacy `Core.UploadFile` outside admitted path |
| Advanced color | Versioned RGB curves/HSL/selective recolor, histogram and highlight diagnostics | Independent numerical and real-photo image-quality review, explicit Core byte verification |
| Smart masks | Portrait/skin/hair/garment automatic + brush refinement with foreground occlusion | Trusted source-bound MASK lineage, manual review and diverse edge/hair tests |
| Asset Library | Unified Project/garment/Outfit/FINAL indexing and comparison | Core canonical ownership, pagination, search and signed image delivery |

## Priority 2 — differentiated AI creativity and productivity

- Quality-first garment fit/pose/drape improvement, multi-view garments and logo/pattern fidelity, using licensed local model candidates only after GPU/device measurements and fair same-fixture visual comparison.
- Human-approvable local editing recipes/batch processing with durable per-item history, cancellation/retry, resource admission and undo. No mass destructive commit.
- Russian-first agent/voice editing commands limited to admitted capabilities and explicit user acceptance; optional, not prematurely granted persistent memory.
- Accessibility (focus, keyboard, touch, screen readers), low-memory laptop/mobile measurements and multilingual UI fit.

## Acceptance rubric

Each new feature progresses through `DESIGNED → PURE_KERNEL_TESTED → REAL_IMAGE_VISUALLY_REVIEWED → CORE_AUTHORIZED → BROWSER_POSTGRES_E2E → EXACT_SHA_DEPLOYMENT_PROVEN → OWNER_ACCEPTED`.

A green kernel unit test cannot advance a tool past `PURE_KERNEL_TESTED`. A visual review cannot grant Core production authority. An exact hosted deployment cannot stand in for source/Project/Artifact security or database backup/restore. The launch decision is separate from the presence of completed R&D implementations.

## First implemented slice on this branch

`src/platform/creative/deterministic/EditorRasterLayerStackRND.ts` introduces a **research-only** bounded (max 32) normal source-over RGBA8 layer compositor with optional per-pixel R8 mask, 8-bit fixed-point opacity, deterministic alpha/color and untouched input buffers. Tests cover hidden RGB, alpha, mask protection, ordering, visibility, malformed data and geometry. This is not color-managed linear-light rendering and **not** yet an authorized production layer stack.

## Product decision

A later launch date is intentionally **unset**. Keep an actionable quality backlog, reviewed standalone PRs and measured real-photo evidence. Do not choose an RC, enable payment paths, flip experimental production flags or claim feature completeness because this authorization exists.
