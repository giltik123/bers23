# BERS local editing (without AI) — web/GitHub research and implementation

Research date: 2026-10-12. This document records design patterns from public repositories, not copied source code. There are no new third-party runtime dependencies in this change.

## Projects and APIs reviewed

| Reference | Evidence / functionality | Useful for BERS | Decision |
| --- | --- | --- | --- |
| [Jodit Image Editor](https://github.com/jodit/jodit-image-editor) | Pure CPU pixel-buffer pipeline separated from reactive UI; brightness, contrast, saturation, warmth, blur, presets, filters, undo/redo; browser and Node tests | Deterministic testable editing engine | **Adopt the separation pattern**, implement original local algorithms; no third-party bundle |
| [TOAST UI Image Editor](https://github.com/nhn/tui.image-editor) | Canvas crop/flip/rotate, drawings, icons, annotations, history, filters (grayscale, sepia, sharpen, pixelate, invert) | Clear tool categories and predictable history | **Local tone/effect tools now**; annotations and retouch are follow-on work |
| [Pica](https://github.com/nodeca/pica) | Worker/WASM high-quality resize, Lanczos and unsharp controls; notes on cross-origin source restriction and sRGB/gamma precision limits | Better optional local downscale/export later | **Do not integrate now**: BERS already has Core-authorized canonical Resize and must not silently replace it |
| [Cropper.js](https://github.com/fengyuanchen/cropperjs) | Accessible cropping/interaction architecture, MIT | Interactive straightening and crop guides | **Candidate only**; existing canonical Crop/Rotate must keep authority |
| [Bensitu editor framework](https://github.com/bensitu/image-editor) | Typed modular Fabric feature/plugins for crop, transforms, annotation, redaction, filters, history, masking | Long-term modular plugin architecture | **Candidate only**: framework migration would be a risky independent project |
| [Pikado](https://github.com/koneb71/pikado) | Local browser raster/vector editing including layers, masks, PSD, adjustments | Future layer/document workflow | **Research only**; BERS cannot claim PSD support before real format and Core lineage tests |
| [MDN ImageData](https://developer.mozilla.org/en-US/docs/Web/API/ImageData) and [putImageData](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData) | Explicit RGBA buffers, canvas display APIs, caveat about premultiplied-alpha encode/decode roundtrips | Safe local presentation & export, caution for transparent assets | **Use standards APIs**; pixel engine preserves alpha bytes, browser PNG encoder may still normalize transparent RGB metadata |

**No remote image-processing API or AI provider is used by the Local Photo Lab.** Local files stay in memory on the client. Loading an existing BERS photo does require an authenticated **GET** of the current Core-owned resource. It is only accepted when \`canonicalCoreResourcePath\` verifies the URL against the exact configured Core origin.

## Implemented: first local photo lab

- **23 real numeric adjustments** in \`src/lib/local-editor/localAdjustments.js\`, grouped as Light (exposure, brightness, contrast, highlights, shadows, gamma, whites, blacks), Color (saturation, vibrance, temperature, tint, hue, separate RGB channel controls) and Effects (vignette, deterministic grain, soften, sharpen, pixelate, posterize, threshold cutoff).
- **6 color effect modes**: natural, black-and-white, sepia, invert, threshold and solarize.
- **9 original presets**, explicit Reset All, history-limited Undo/Redo, editable before/after preview, luminance histogram.
- Select **current Core project photo** or **local PNG/JPEG/WebP**. The second option never uploads a photo. Both render into a browser canvas and run a pure CPU RGBA8 transform.
- Small-screen preview is downscaled to max 1100px for responsiveness. **Download edited PNG** computes every full-resolution pixel from the original source (up to 12MP). Export uses a browser \`toBlob('image/png')\` and an explicit user click.
- Input sizes bounded to 32MB and 12 million pixels, with source type/geometry checks, error messages, stale decode cancellation, and per-control finite range/step validation.
- The internal transform never mutates input RGBA nor changes source alpha bytes. Presets never introduce network calls. No Core Project mutation occurs.
- **This is a separate local workspace, not a canonical Project edit.** Downloading PNG does not create a Core \`FINAL\`, modify history, consume credits or upload assets. Import the downloaded PNG as a new BERS Project to keep it in the library.

### Tests and guardrails

- \`tests/local-adjustments.test.mjs\` checks byte-specific effects, every control produces a nontrivial pixel change, presets, immutable input, alpha preservation, histogram, large-image guards, invalid/nonfinite data, pixelation and local detail.
- \`tests/local-adjustments-editor-wiring.test.mjs\` asserts actual controls, local photo/file loading, exact resource verification, before/after, history, canvas export and no canonical Project mutations.
- \`scripts/test-release-r3e-browser-e2e.mjs\` includes **real Chrome + PostgreSQL** acceptance: open local PNG in the Editor, drag brightness slider, compare decoded canvas RGBA, download PNG, verify exact edited RGB and source geometry, assert Core Project state unchanged, zero provider calls and no local execution tickets. No test result is claimed until GitHub CI completes on the exact SHA.
- \`.github/workflows/editor-ux-clarity.yml\` now runs source contracts, pixel engine unit tests, TypeScript checks and production SPA compilation with an exact-head assertion; no branch protection or Core authorization rule is weakened.

### Deliberately NOT implemented yet

1. **Curves + HSL per hue band + histogram equalization** — real image LUTs, color-space profiling, bounded CPU worker and precision tests.
2. **Clone stamp, healing, spot removal, redaction** — manual pixel operations with sampled source, undo, masked alpha safety, privacy QA; no inferred AI fill.
3. **Local annotations** — draw, text, arrows, polygons, watermark; raster preview/export first, canonical artifact/history separately.
4. **Gradient and color-range masks** — would need authenticated canonical MASK read/revision endpoint before reopening an already-persisted mask. Never fake mask state in the browser.
5. **Perspective, straightening, guides and quality resize** — useful, but must not collide with already Core-authorized exact Crop/Resize/Rotate.
6. **Batch export and ICC-aware output** — explicit user-selected files, memory/time budgets, no cloud job or credit system.

## Release boundary

Keep the design/Editor PR in **Draft** until seven mandatory GitHub checks, relevant real Chrome/Postgres E2E, security and source-contract tests complete successfully on an unchanged SHA. Never treat queued/pending as green. The known LaMa ONNX reproducibility drift remains a separate unresolved blocker; do not waive it or edit golden checks.

No Core auth cookie, CSRF, origin configuration, paid execution authority or Railway production deployment changes are included.


## Phase 2 — precision local editing (2026-10-12)

The next three core capabilities are now implemented as original deterministic CPU operations in \`src/lib/local-editor/localAdvanced.js\` (no third-party runtime dependency):

1. **Tone curves:** five integer sRGB-byte control points at inputs 0, 64, 128, 192, 255. A 256-entry piecewise-linear LUT gives exact anchors, no overshoot or hidden AI correction. The interface shows the actual curve and five labeled sliders; Reset and global Undo/Redo apply to the same adjustment history.
2. **Selective eight-band HSL:** individual hue ±60°, saturation ±100%, lightness ±100% for Reds, Oranges, Yellows, Greens, Aquas, Blues, Purples and Magentas. Circular hue distance, soft feathering and neutral-gray protection avoid crude rectangular thresholds. This operates in display-referred 8-bit HSL **not** ICC/Lab, and is described accordingly.
3. **Manual clone stamp:** explicit **Pick source → Paint** steps, normalized pointer coordinates, radius 1–10% of the shorter side, feather hardness and opacity 1–100%. Rasterization finds each pixel's shortest distance to the actual brush segment, using a per-stroke maximum-coverage envelope and an immutable sampled raster snapshot; separate strokes can build up. The user sees the brush outline and can Undo/Redo individual strokes in the same history. At most 32 strokes × 512 path points, with a fail-closed 25-million-pixel work budget for both rasterization and application. Source and destination alpha never change.

**Additional fourth capability:** a local, browser-only **linear/radial gradient mask** for tonal/color/effect adjustments. Users can choose left→right, right→left, top→bottom, bottom→top, or center-out radial and set the feather interval (0–100%). The CPU engine blends from the **original source pixels** to the processed pixels by deterministic per-pixel coverage. It affects local light, color, effects and curves/HSL; manual clone strokes remain independent. This is **not** presented as editing or persisting a canonical Core MASK artifact.

### Additional external references checked

- [Photopea — Adjustments & Filters](https://www.photopea.com/learn/adjustments-filters) distinguishes color-only adjustments from neighborhood-dependent filters and explains the non-destructive model of adjustment and smart filters.
- [Photopea — Basic Tools](https://www.photopea.com/learn/bt-basic) documents the explicit source-point → destination-stroke clone workflow and brush hardness/opacity.
- [canvas-plus (GitHub)](https://github.com/jhuckaby/canvas-plus) demonstrates tone-curve LUTs and different per-channel curves. Our initial five-point curve deliberately uses **linear interpolation** for easier auditing and deterministic bounded behavior; per-RGB-channel curves are a separate feature.
- [Photolab (GitHub)](https://github.com/thedhruvhegde/photolab) uses immutable original images, parametric adjustment recipes and a shared transform pipeline for preview/export. BERS maintains its own Core-owned project authority; this PR uses an **in-memory local history only**.
- [Photopea changes/tutorial repository](https://github.com/uviclibraries/image-editing-photopea/blob/main/changing-colors.md) explains using color-range selection with Hue/Saturation. We expose explicit eight fixed hue bands rather than pretend to use a semantic segmentation mask.

### Correctness and release boundary

\`tests/local-advanced-adjustments.test.mjs\` verifies exact curve stops, isolated color hues, neutral-gray protection, alpha byte preservation, cloned source pixels, opacity, connected brush path, 25-million-pixel execution limit, gradients over original versus processed pixels, and invalid-parameter rejection.

\`tests/local-advanced-editor-wiring.test.mjs\` verifies the actual sliders, working Select/Reset callbacks, a **shared Undo/Redo** for the base and precision settings, normalized user pointer events and exact preview/export calls. The existing R3e Chrome/Postgres acceptance was extended to check a rendered curve change, selective HSL correction, real source-selected clone stamp and downloaded PNG pixels, directional gradient original-to-adjusted pixels, and unchanged Core Project / provider-call counts.

**Not delivered:** Photoshop adjustment layers, PSD, color-managed 16/32-bit ICC, healing/inpainting, persisted revision of an authenticated Core MASK. Avoid making those claims, altering production or bypassing the seven required checks. No screenshots or device-level performance evidence should be claimed until the browser jobs complete on the exact head SHA.
