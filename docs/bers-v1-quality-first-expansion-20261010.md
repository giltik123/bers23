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

## Implemented cross-feature slice in PR #988

1. **Pure raster compositor:** `EditorRasterLayerStackRND.ts` (RGBA8 with source-over, exact per-layer R8 matte and 8-bit opacity; strict geometry and resource bounds), no arbitrary blend modes or external provider calls.
2. **Immutable source-bound editing document:** `EditorLayerDocumentRND.ts` (tenant/Project/source SHA and artifact references, paired mask hashes, at most 32 layers, lock flags, optimistic `expectedRevision` guard, immutable ADD/REMOVE/MOVE/VISIBILITY/OPACITY snapshots). The client-side revision/identity check **is not a Core authorization or saved history**.
3. **Independent integrity inspector:** `EditorQualityInspectorRND.ts` audits any equal-size RGBA8 frames and reports total changed pixels, changed alpha, exact protected-pixel leakage, RGB error, and changed bounding box. An additional tonal diagnostic counts **newly clipped highlights and shadows only inside the editable region**, ignoring transparent hidden RGB and existing white/black areas. These counts are warnings for reviewer inspection, not automatic quality acceptance. All opaque/transparent RGBA bytes count, including invisible hidden RGB. Image-quality statistics are **not a perceptual score**.
   **Tonal diagnostics:** `EditorTonalClippingRND.ts` separately counts visible highlights touching >=250, shadow crushing <=5, and newly clipped pixels within the edit matte. Transparent hidden RGB is excluded. The results are advisory only: intentionally bright images and tonal stylization may legitimately trigger them, and perceptual/ICC color quality cannot be certified from byte thresholds.
4. **Actual pending Preview enhancement:** `ResultCompare.jsx` now has keyboard-accessible before/after/split, 100%/200% inspection and adjustable split position. Split is only available when decoded natural dimensions match **and** the Core-reported Editor operation belongs to the source-coordinate-preserving allowlist: masked exposure, masked white balance, masked levels, background isolation or canonical Fashion Try-On. Crop, Resize, Rotate/Flip, unknown AI rerenders and unverified operations cannot silently offer visually misregistered pixel comparison. Existing explicit Editor `onAccept/onDiscard/onRetry` remain untouched; no automatic Project commit.
5. **Real-image research evidence job:** path-scoped Actions tests all safety primitives and runs three public-license Wikimedia photo composites on exactly the PR head, uploads sources/results/3× difference maps, hashes and a JSON manifest. This job deliberately keeps `visualGrade:PENDING_INDEPENDENT_HUMAN_REVIEW`; it cannot promote Core, the Editor, or any AI model.

Next graduation tasks: image-based visual review and artifact SHA checks; source-bound Core layer execution ticket and immutable layer data migration; browser/PostgreSQL/E2E including refresh/Undo/Redo/Restore; performance and consistent ICC-aware compositing on larger photographs. The R&D compositor uses sRGB byte-space blending, so its visual quality is **not** asserted comparable to color-managed linear-light compositing. The existing real-photo Editor QA also shows visually strong portrait exposure/temperature presets can clip highlights or shift skin tones, so production color operators must ship measured histogram/tonal diagnostics and actual visual review rather than automatic strength changes.

## Two intentionally distinct clipping diagnostics

There are now **two explicitly named** read-only measurements, not one ambiguously defined color quality score:

- `EditorTonalClippingRND.analyzeEditorTonalClippingRgba8` diagnoses **per-channel clipping**: *any* sRGB channel >=250; crushed shadow means all channels <=5. Source and output alpha visibility are checked independently, so transparent hidden RGB cannot conceal newly visible clipping.
- `EditorQualityInspectorRND.analyzeEditorNearWhiteAndBlackRgba8` diagnoses **neutral near-white**: *all three* sRGB channels >=250. It counts only editable, visible image regions and is intentionally stricter. A saturated bright-red pixel triggers the channel clipping diagnostic but **not** the neutral near-white diagnostic.

These numbers **must not be directly compared, combined, or presented as one percentage**. Neither tool infers intent, skin, garment pattern fidelity or semantic subject masks. They never authorize a Core edit, change v1 color science or decide release readiness.

## Color-fidelity research — bounded perceptual diagnostics

`EditorColorDifferenceRND.ts` now adds deterministic **CIEDE2000 (ΔE00)** diagnostics, with canonical sRGB-to-D65-Lab conversion, published CIEDE2000 reference-pair tests, zero difference on identical images (including white), masked editable-region filtering and hidden/near-transparent RGB exclusion. It records mean, p95-histogram upper-bound, maximum color difference and a count of positions above ΔE00=10 on no more than 65,536 regularly spaced positions per frame. The exact sampling stride and count are reported; this is **not an exhaustive per-pixel guarantee**, and small isolated defects might be missed.

The existing three-real-photo layer capture now records ΔE2000 alongside protected-pixel byte integrity and the separate tonal clipping analysis. Color difference is **not** a global "improvement" score: legitimate stylization can produce large ΔE; skin, garment print fidelity, gradients, gamut and semantic intent require independent visual review. This diagnostic never mutates accepted Core color algorithms, provider selection or release metadata.

## Product decision

A later launch date is intentionally **unset**. Keep an actionable quality backlog, reviewed standalone PRs and measured real-photo evidence. Do not choose an RC, enable payment paths, flip experimental production flags or claim feature completeness because this authorization exists.

## Observed real-image visual quality disposition (research evidence, 2026-10-10)

I inspected #986's six source/F4/inward-feather triptychs from the real-photo artifact at exact head `72eb151bd757242cb45962dd4facdbea6b8a754d`. Those Try-On examples are **not visually acceptable** as high-fidelity garment replacement: small flat shirt silhouettes are pasted on top of pre-existing outfits with inaccurate size/neckline/shoulders, no convincing drape/folds and no reliable foreground occlusion. A boundary-only feather modifies 33–1,573 pixels relative to the much larger changed garment region and does not fix fit. This is a decisive blocker for Fashion #230, documented in https://github.com/giltik123/bers23/issues/230#issuecomment-6092594422. Do not confuse the green mechanical pixel-accuracy test with garment realism.

I also inspected #987's three real-photo Editor contact grids. Crop/Rotate outputs look geometrically correct; Resize compared against independent Lanczos3 with mean per-channel RGB errors approximately 0.55–0.87 at the 512-pixel evaluation width. Strong stress-test masked Exposure produces visible blown highlights and masked White Balance produces a strong yellow tint on portraits; these are demonstration control values and artificial elliptical masks, not proof of defective default product settings. This observation motivates advisory highlight/shadow diagnostics and a future real-color-grade review on actual user-selected masks and ICC-aware exports, **not** automatic promotion/rejection of v1 color tools.
