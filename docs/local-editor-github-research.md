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


## Phase 3 — independent RGB channel curves (2026-10-12)

Local precision adjustments now support four selectable tone-curve targets: **RGB/master, Red, Green and Blue**. Every target has five integer output stops (0,64,128,192,255 input), its own live SVG curve, five sliders and an isolated Reset. The shared master LUT executes first; only then do per-channel LUTs run on the resulting channel value. Identical default LUTs preserve exact source bytes. Alpha and completely transparent RGB are never modified.

This is original browser-only CPU image processing, not an ICC-managed curve adjustment layer or Photoshop PSD compatibility. It works with the existing light/color controls, eight hue bands, local gradient mask, manual clone brush, combined undo history, before/after, and full-resolution PNG export. No Core write or AI call is involved.

Regression tests exercise red-only changes without green/blue drift, master+independent channel ordering, null/malformed configuration rejection, alpha preservation, and targeted per-channel reset. The real Chrome/Postgres R3e acceptance was extended to change the Red-channel midpoint, inspect rendered RGBA values, reset only the active curve and verify return to previous pixels. Pending CI is not a pass, and production is unchanged.


## Phase 4 — annotations and manual tonal repair (2026-10-12)

### Why these additions

After 23 photographic sliders, selective HSL, curves, gradients and an exact-pixel clone stamp, BERS needed **task-oriented** local editing, not another intimidating group of sliders:

- Explain an edit to someone: add a short label, arrow, rectangle or ellipse.
- Revise a label's color, text or position without deleting the photo or reopening a server-side Project.
- Remove a small blemish on a flat background without AI: manually sample a clean region and optionally match its surrounding tone before copying texture.

The design borrows the **separate vector overlays and flatten-only-on-export** pattern described in [bensitu/image-editor](https://github.com/bensitu/image-editor) and the selection/movement accessibility conventions found in [tldraw](https://github.com/tldraw/tldraw), but does **not** add either as a dependency. It uses only standard browser Canvas APIs and an original normalized geometry/validation module. Source code from third-party projects was not copied.

The [GIMP Heal manual](https://docs.gimp.org/en_GB/gimp-tool-heal.html) and [GIMP developer healing algorithm notes](https://developer.gimp.org/core/algorithm/healing/) distinguish literal clone-stamping from true healing, which considers neighboring tones. Our optional **Color-matched repair** uses a **simpler 16-point ring sampler** around manually chosen source/target and a strict ±96 per-channel correction. It is **not** Poisson editing, patch synthesis or an AI restoration algorithm. It is intended for small defects on smooth areas; complex textures may require the ordinary exact clone or more careful manual work.

### Implemented local tools

**Text & shapes:** a separate \`src/lib/local-editor/localAnnotations.js\` module validates normalized geometry and renders arrows, outlined rectangles/ellipses and canvas text in a client-side overlay. The same renderer flattens objects onto a full-resolution PNG only after a user clicks **Download edited PNG**. It keeps the original RGBA pixels, project authorization and masks unchanged before export. The interface provides palette, line width, opacity, font size, short text field, mouse/touch drag, keyboard-centered insertion, list selection, per-item deletion and changes to existing annotation positions/properties. Every commit is part of the shared bounded 40-step local Undo/Redo. For performance and safety, at most 50 annotations with at most 120 printable characters of text each; coordinates, palette and dimensions are fail-closed.

**Manual color-matched repair:** the same bounded clone-stroke geometry and 25M pixel-visit budget now also supports \`blendMode: 'color-match'\`. For each user-drawn stroke, a fixed 16-point source/target neighborhood estimate provides a capped RGB offset before alpha-weighted compositing from a frozen sampled image. This still requires a user-picked source, never unmasks transparent target pixels, has no AI provider call and offers an honest **Clone exact / Color-matched repair** choice.

**Truthful limitations:** PNG export is flattened; it does not create editable PSD layers or a Core-owned FINAL. Annotations can be revised only while the local editing session remains open. Local color matching is not professional Heal or content-aware fill, and results on high-contrast edges may look imperfect. Larger edits still require approval for canonical persistence.

### Added acceptance gates

- \`tests/local-annotations.test.mjs\`: vector geometry in both directions, exact SVG/canvas coordinate mapping, alpha/style/text validation, malicious text rendered as inert Canvas glyphs, source immutability, keyboard-centered placement, normalized movement/style editing and hard bounds.
- \`tests/local-annotations-editor-wiring.test.mjs\`: real pointer controls, touch mode, separate transparent overlay and final PNG flattening, shared Undo/Redo, edit/delete hooks and unchanged Core authority.
- Existing \`tests/local-advanced-adjustments.test.mjs\`: side-by-side 8-bit pixel fixtures prove exact clone versus tone-matched repair, alpha preservation, shift bounds and malformed mode rejection.
- Real Chrome/Postgres R3e acceptance now covers a rectangle that **changes downloaded PNG RGBA**, pointer-drawn arrow, text, per-item deletion and Undo, existing vector style/text movement, plus a sampled grey-tone blemish restored to precise [130,130,130,255] in both canvas and PNG, with no Core Project write or provider invocation.
- Exact PR-head \`.github/workflows/editor-ux-clarity.yml\` runs pure pixel/vector/wiring suites plus production build; R3 browser release E2E changes are included in the workflow path filters. GitHub actions still need to **actually finish** before any merge/deploy claim.

**Release rule:** keep Draft, do not merge/deploy unless all seven protected checks, real Chrome+Postgres workflows and relevant security checks succeed at a single unchanged head SHA. The known LaMa ONNX reproducibility drift is not resolved here.


## Phase 4 — editable vector annotations (2026-10-12)

Users can now select a previously placed text, arrow, rectangle or ellipse from the annotation list, change its color and opacity, adjust outline thickness, and edit the text and font size of a text annotation. A contextual property panel shows the selected item; each change uses the shared bounded Undo/Redo history.

Directional controls move a selected annotation by 1% of canvas width/height per click. The new pure geometry operation translates both endpoints together, clamps the entire shape inside the normalized photo rectangle and normalizes floating precision; reversed arrows keep their direction. A separate property-edit operation reuses strict annotation validation for colors, transparency and text. Deletion automatically adjusts or clears the current selection.

Live preview and full-resolution PNG export use the same normalized vector recipe. No original pixel, Core project history, mask artifact or AI endpoint is changed.

Added tests/local-annotation-editing.test.mjs for pixel-independent geometry and malformed input, tests/local-annotation-editing-wiring.test.mjs for true UI callback wiring and history, and a real Chrome/PostgreSQL release journey for editing a placed text annotation, nudging it, and checking Undo. The browser and protected CI must still finish on the exact PR head SHA before merging. Direct drag-to-reposition and resize handles remain separate future work.


## Phase 5 — portable local edit recipe, exact-source restore (2026-10-12)

**Usability problem:** Users could adjust the source image, apply masked local curves, clone or color-match a defect and draw annotations, but could only download a **flattened PNG**. The next visit had no way to resume editing independent layers, and each new attempt required recreating all slider values and annotation objects.

**Implemented:** Explicit **Save edit recipe** and **Restore edit recipe** buttons in \`src/components/editor/local/LocalRecipeControls.jsx\`, backed by \`src/lib/local-editor/localRecipe.js\`.

- \`.bers-edit.json\` format with strict \`format: "bers.local-photo-recipe"\`, \`version: 1\`, source \`width\`, \`height\`, \`sha256\`, and \`edits: { settings, advanced, annotations }\`.
- Fingerprint is browser Web Crypto **SHA-256 of the entire original decoded RGBA8 pixel buffer**, not of a downscaled preview, destination file name or opaque upload token. Image dimensions are checked too. On mismatch, import fails with a descriptive instruction to open the exact original picture. The digest is an accidental-mismatch guard, not authentication, content authenticity or an archival guarantee.
- Recipe includes all 23 base light/color/effect settings, 5-point master/RGB curves, eight selective HSL bands, gradient masks, bounded exact/color-matched manually painted strokes and vector objects with positions, labels and style. **No image pixels, network addresses, cookies, access tokens, or Core IDs** are serialized.
- JSON payload limited to **2 MB**, validated against the same fail-closed per-control/per-brush/per-object validators; unknown keys, unsupported versions, malformed JSON, nonfinite values and mismatched photo hashes are rejected. A stale file decode/import is dropped if the image changed meanwhile.
- Import enters the same **40-step undo history as a single action**. A user can Undo to the current manual session or Redo to reapply the recipe. All editing remains browser-local, with no Core write or AI provider use.
- Files can be moved between browsers/sessions by the user. There is **no silent localStorage retention** or cloud backup. The user must keep the exact original photo and the small JSON file together. Downloaded PNG remains flattened.
- Tested by \`tests/local-recipe.test.mjs\`, \`tests/local-recipe-editor-wiring.test.mjs\` and a Chrome/Postgres R3e scenario that exports actual JSON, reads its bytes, restores brightness, asserts pixel-level preview and Undo/Redo, rejects an intentionally altered source hash, and confirms Core Project/provider counts unchanged.

### CI finding (exact PR-head workflow reviewed 2026-10-12)

GitHub Actions for an earlier head of PR #1003 completed with **71 successes and 24 failures**. The failed tests were largely a small number of repeated blockers (not 24 unrelated regressions):
1. **ESLint** misclassified a component-local async helper named \`useImage\` as a React Hook called outside a custom Hook. Renamed the helper \`activateLocalImage\` while preserving its decode/load behavior.
2. Legacy Editor source assertions were keyed to an exact JSX prop string and \`e\` event parameter. Current production Editor adds \`!project.current_image_artifact_id\` to the Selection-start admission guard (stronger authorization precondition) and spells the keyboard handler argument \`event\`. Updated the assertions to require these actual stronger/equivalent guards; no runtime security code weakened.
3. The R3e manual-mask contract still demanded \`selectionServiceRef.current.done()\` even though code now takes a stable service ref and guards against reentrant Done. Updated the contract to require \`const service = selectionServiceRef.current\`, \`!service || finishingMaskRef.current\` guard and \`await service.done()\`.
4. The R3e touch-only test previously globally banned \`page.mouse\` across every step of the whole browser harness. A new unrelated browser-local **arrow annotation test** legitimately uses mouse drag, so the manual-mask test now scopes the no-mouse assertion to the **Selection section**. Touch-only project Selection remains enforced; it is not silently weakened.

All of these changes must still pass at the **new exact head SHA** along with the remaining protected acceptance jobs and real Chrome/Postgres/browser/device release checks. The longstanding independent LaMa ONNX byte reproducibility issue remains unresolved. **No merge, production deploy or protection bypass.**


## Phase 6 — opt-in browser draft storage (2026-10-12)

A small portable \`.bers-edit.json\` already allows cross-device editing. For people who want to resume the **same photo in the same browser without manually finding a JSON file**, the Local Photo Lab now also has a collapsed **Save on this device** section with three real operations: **Save browser draft**, **Restore browser draft**, **Delete browser draft**.

**Privacy defaults and limits:**
- **Nothing is saved automatically.** Saving requires an explicit click. The section is collapsed by default to avoid turning the editor into a long toolbar; existing explicit Download JSON and Restore JSON continue working.
- The one-slot \`localStorage\` value is a **versioned, bounded recipe** (currently at most 2 MB). Only local light/color/effect sliders, curves, gradient, sampled retouch points, vector positions, labels and styles are serialized. No original image pixels, photographs, user/session tokens, origin URLs, Core artifact IDs or billing history are written. **Annotation text and edit choices are stored unencrypted in this browser**, so use only on a private device.
- Saving a newer browser draft **overwrites** the previous one. The UI states this beforehand. The user can explicitly delete it, which removes **only** the single \`bers.local-photo-edit.explicit-draft.v1\` key; other browser/account data is untouched. Clearing site data and private browsing can discard it.
- Restoring requires the identical ORIGINAL RGBA8 **SHA-256 fingerprint and pixel dimensions**. A mismatch, wrong recipe version, malformed JSON, unexpected fields, unavailable browser storage or storage quota failure leaves current edits unchanged and produces a useful error. The browser-draft restore creates **one undoable history entry** and uses precisely the same preview/export as a downloaded JSON recipe.
- SHA-256 is computed using the standard browser **Web Crypto** API (HTTPS or trusted local context), cached only in memory while this photo is open; no network or additional service is needed. See [MDN SubtleCrypto.digest](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest).
- The saved recipe does not turn into a Core project or PSD. It is a user-managed local snapshot, not autosync or a guarantee against browser storage eviction. **For long-term or cross-device backup, download the portable JSON alongside the original image.**
- Blob/object URL downloads explicitly revoke their temporary resources according to [MDN blob URL guidance](https://developer.mozilla.org/en-US/docs/Web/URI/Reference/Schemes/blob).

**Verification added:** \`tests/local-device-draft.test.mjs\` checks a single-slot roundtrip, strict source binding, forged/invalid documents, localStorage quota/private-mode refusal and scoped deletion. \`tests/local-device-draft-editor-wiring.test.mjs\` verifies the disclosure, explicit controls, no hidden autosave, exact-source guard and Core boundary. R3e real Chrome/PostgreSQL acceptance now saves a browser draft, verifies it contains no pixels, **reloads the page**, reopens the original photo, restores brightness with Undo/Redo, deletes the stored copy and confirms Core state and AI-provider calls have not changed. GitHub Actions must finish all required checks on one exact PR head before approval or deployment.

**Release constraint:** Still Draft. The historical LaMa ONNX reproducibility drift is unrelated and remains unresolved; don't weaken security, acceptance or model reproducibility gates to release these UI features.


## Phase 5 — ergonomic Undo and release regression triage (2026-10-12)

### Make real editing gestures reversible, not just individual input events

A photographic slider can emit dozens of browser \`input\` events in a single drag. Previously every event was its own Undo entry and a long drag could exhaust the 40-entry history. \`src/lib/local-editor/localHistory.js\` now coalesces the **first input into one new snapshot**, then replaces that snapshot for successive samples of the **same physical gesture**. Ending the gesture clears the group; moving a slider back to its original setting discards the no-op entry. A new gesture on the same slider, an imported recipe, selected annotation edits and presets remain distinct. Undo after branching truncates stale Redo entries, and history remains bounded to 40 snapshots.

The Local Photo Lab captures browser pointer-down/up/cancel on range inputs, held keyboard-arrow sequences and focus/blur for existing annotation text inputs. The actual per-event reducer passes a unique gesture ID, so independent controls and gestures cannot silently overwrite one another. This also handles the Redo path after a cancelled or branched edit. An on-screen **Edit N of M** indicator makes the history visible.

Accessible editing shortcuts now include **Ctrl/Cmd+Z**, **Ctrl/Cmd+Shift+Z**, and **Ctrl+Y**. For text-input and textarea editing the browser's **native typing undo remains in control** rather than being intercepted by the photo editor.

\`tests/local-history.test.mjs\` covers 100-sample drags, distinct gestures, keyboard repeats, no-op cancellation, Undo branching, Redo truncation, history caps and invalid state. \`tests/local-history-editor-wiring.test.mjs\` checks the React capture handlers, shortcut specificity and real browser acceptance. The R3e Chrome/Postgres test now physically drags the Brightness slider across several points, proves **one Undo** restores the pre-drag value and Redo restores the final value, then continues its actual PNG/Core authority checks.

### CI diagnosis: release evidence, not optimism

On GitHub head \`fd791569\`, 18 workflows failed. The first actionable logs showed:
- 15 canonical Editor-related jobs were blocked by a previous UI copy change: the expected truthful whole-image context \`Editing the whole image\` was absent. Restored the wording in the visible \`InstructionBar\`, without undoing the accessible redesign.
- One R3g contract asserted the old one-line JSX layout of the mode button. Updated it to verify the **actual key, onClick, button type and aria-pressed behavior** independent of JSX whitespace.
- One real Chrome Automation Studio journey matched both \`Projects\` and \`Your projects\` headings. Scoped the locator to \`exact: true\` so it targets the page h1 and preserves the useful subheading.
- The LaMa ONNX byte-reproducibility failure is a **separate existing model drift issue**; it is not solved, muted or waived.

These fixes and the new history behavior are on a **new exact SHA**. They are not considered successful until new GitHub Actions checks actually complete. A direct source-contract execution of the revised R3g suite passes its four cases; 8 history reducer unit cases and 5 UI wiring cases also pass. Full production build, Chrome/Postgres release E2E and 7 protected status checks remain authoritative.

No Core, billing, login, CSRF, source-artifact lineage or Railway production changes in this phase.


## Phase 5 — opaque privacy covers, bounded photo downloads, and export correctness (2026-10-12)

At this point BERS already had 23 numeric adjustments, independent RGB curves, eight-band HSL, gradient masks, two manual cloning modes, vector annotations, grouped Undo/Redo, portable image-bound recipe JSON and explicit one-slot device draft save/restore. Those features must not be reimplemented or marketed as new here.

### Solid black cover for sensitive visual content

A task-oriented **Solid cover** option joins the annotations toolbar. Users draw a rectangle or insert one centrally, then adjust its position, delete it or use Undo/Redo. A cover always has pure black \`#000000\`, alpha **255**, and fixed thickness: unlike an ordinary annotation it cannot be made translucent, colorized or feathered. The option's UI explains that it covers **only the exported PNG**, not the original photo, previous downloads, other image files or Core project history.

Correctness is enforced twice using original (normalized) vector coordinates:

1. \`applyLocalOpaqueCovers\` overwrites **actual full-resolution RGBA8** pixels inside outward-rounded integer bounds to \`[0,0,0,255]\` before PNG encoding. The original pixel buffer remains immutable. Transparent input pixels within the box become opaque black.
2. \`renderLocalAnnotations\` paints covers with \`globalAlpha=1\`, \`source-over\` and \`fillRect\` **after all other vector annotations**, regardless of insertion order. Thus an arrow or label added later cannot render on top of a privacy cover. No blur/pixelation is used, as those are not an adequate substitute for opaque covering.

When no covers exist, the renderer exports the pre-existing edited buffer directly, with no extra 48 MB RGBA copy at the maximum image size.

The exact browser release acceptance draws a cover, adds another colored rectangle *after* it, confirms black alpha 255 in the overlay and downloaded PNG, compares unaffected outside pixels and verifies Core Project and AI-provider counters unchanged.

**Safety boundary:** The resulting PNG's covered pixels are replaced, but this is not a promise that the original image, photo metadata retained in other copies, cached thumbnails, cloud-stored versions, or a downloaded recipe are deleted. The user must verify the exported file before sharing and handle any other existing copies separately.

### Bounded authenticated Core image transport

The previous local photo loader checked \`Content-Length\` but then called \`response.blob()\`, which could buffer an arbitrarily large body if the server omitted/misreported the header. The new \`src/lib/local-editor/localImageTransport.js\` reads the response **stream incrementally**, checks the decoded byte total against the **32 MiB limit** before constructing the Blob, cancels early on oversize/corruption, rejects unsupported MIME types and refuses a browser without safe streaming. The Editor still requires a Core-canonical resource URL and an authenticated \`GET\`, and all raster geometry remains bounded at 12 megapixels.

Pure transport tests simulate missing and malicious headers, mixed chunks, premature stream failures, cancel/release semantics, disabled streaming and invalid limits. The exact-head CI runs them plus connection tests. The loader does not perform remote processing of user-chosen local files.

### Relevant browser standards

- [MDN: Canvas globalAlpha](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalAlpha) specifies why translucent marks do not adequately hide underlying pixels.
- [MDN: Canvas globalCompositeOperation](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/globalCompositeOperation) defines source-over painting.
- [MDN: Canvas ImageData](https://developer.mozilla.org/en-US/docs/Web/API/ImageData) describes explicit RGBA pixel buffers used for exact local-byte verification.
- [MDN: ReadableStream default reader](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream/getReader) supports bounded incremental response reads.

### Release condition

These changes stay in **Draft PR #1003**. Pure source/unit tests can establish geometry and pixel arithmetic, but a reliable release also requires passing GitHub workflows for production compilation, security and the **real Chrome + PostgreSQL** R3 browser scenarios at the same final SHA. Queued/pending runs are not passing results. Railway production and Core authentication/CSRF/credit gates were not changed.
