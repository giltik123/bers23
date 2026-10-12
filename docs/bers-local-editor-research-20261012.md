# BERS — roadmap for offline photo editing (no AI)

## External research reviewed on 2026-10-12

| Project | Source | Practical ideas | Integration decision |
| --- | --- | --- | --- |
| miniPaint | https://github.com/viliusle/miniPaint | Paint/fill/clone, color picker, layers, crop, perspective, solarize, grain, adjustable filters, multiple image formats | Reference interaction patterns and tests; do not embed the whole editor or ship third-party code without dependency/license/security review |
| Jodit Image Editor | https://github.com/jodit/jodit-image-editor | Separated immutable state and pure pixel pipeline; geometry/crop/rotate/flip; annotations | Keep BERS filter arithmetic pure and Node-testable; preserve our independent canonical Project authority |
| TOAST UI Image Editor | https://ui.toast.com/tui-image-editor/ | Free drawing, shapes, filters, masking, history and download | Take UX concepts, not legacy unreviewed Fabric dependencies |
| Pinta roadmap | https://github.com/PintaProject/Pinta/issues/1405 | Edit-in-place curves, contrast/levels, adjustment layers, transforms and non-destructive metadata | Future independently reversible edits; explicit persistent schema needed |
| darktable | https://github.com/darktable-org/dtdocs/blob/master/content/module-reference/processing-modules/color-balance-rgb.md | RGB grading split across luminance zones | Future selective RGB shadows/midtones/highlights with real color-management tests |
| PaintFE | https://github.com/kylejckson/PaintFE | Clone, brush, gradient, masks, local curves, color picker, sharpening and noise | Evaluate for future scoped deterministic pixel operations |

No source code from these repositories has been copied. UI patterns and capabilities have been independently evaluated. Licensing compatibility and security review are required before any actual dependency import.

## Already available in the existing BERS Local tools panel

The browser-local pipeline already contains exposure, brightness, contrast, gamma, highlights/shadows, saturation, vibrance, temperature, tint, hue, vignette, soften, sharpen, threshold, monochrome, sepia, invert, posterize and pixelate. It exposes a brightness histogram, preview at bounded size, local file or authenticated current-project image input, before/after, settings Undo/Redo and full-resolution PNG export.

**Honest boundary:** this mode does not save a canonical Project revision. PNG export is a local download. Only project-authorized Core paths may mutate canonical project history; do not silently upload an edited photo.

## Implemented in PR #1003 on 2026-10-12

1. **White and black tonal controls**: sliders from -100 to +100 with a luminance-weighted nonlinear effect, preserving alpha and offering distinct dark/highlight control.
2. **Independent red, green and blue balance**: -100 to +100 per channel, actual controlled RGB pixel transformation, no channel cross-talk and preserved alpha.
3. **Solarize**: a deterministic per-channel visual effect applied locally.
4. **Film grain**: 0-100 adjustable luminance grain with coordinate-hashed deterministic noise (no Math.random/flicker) and unchanged original input/alpha.
5. **New presets**: Matte blacks, Cinematic cool and Analog grain.
6. All new settings inherit existing local adjustment history, fast preview, original-size PNG export, finite input bounds and reset.

Tests in `tests/local-adjustments.test.mjs` verify exact sample pixels, channel independence, alpha, tonal specificity, deterministic grain, invalid bounds, source immutability and presets. The exact-head `Editor UX clarity and real control wiring` workflow now includes the real pixel regression suite and production SPA build.

## Next high-value implementation stages

**P1 — image geometry and export**
- Local crop with draggable rectangle, aspect presets and exact dimensions.
- Offline rotate by 90 degrees, flip X/Y, canvas resize and aspect-locked image resize, with preview and Undo/Redo.
- Color sampler/eyedropper displaying exact RGB/HEX and alpha values.
- Export options for PNG and JPEG/WebP with explicit transparency/quality semantics and end-to-end download validation.

**P2 — spatial controls**
- Real local adjustment brush and erase, gradient mask, selected region coloring and mask overlay. Reuse only properly scoped canonical operations or an explicitly isolated local raster; never pretend a browser-only mask has been saved into Core.
- Clone stamp/heal sampling with deterministic snapshots and sample origin, and all undo operations reversible.
- Text, shape and arrow annotation layers with keyboard access and true raster export.

**P3 — professional color**
- Linked and per-channel curves, shadow/mid/highlight wheels, auto-levels with clipping thresholds, RGB histograms, LUT import with validation.
- More advanced edge-preserving denoise and sharpening, with performance budgets for 12MP on mobile.
- Layer composition and editable adjustment stack with schema-versioned local persistence and export.

## Quality and security gates

Keep local-only transformations independent from AI models, providers, credits and Core mutations. Enforce file type/byte/pixel bounds, opaque image URLs and same-origin authenticated source validation. Preserve original RGBA alpha, block stale async results, require exact-head unit tests and real Chrome E2E with samples, ensure no console errors or JS exceptions, and never count queued/pending CI as green.

Do not auto-merge this Draft or deploy it to Railway before the repo's seven required checks, affected browser tests and security acceptance succeed. The known LaMa ONNX drift is not resolved by offline editor work.
