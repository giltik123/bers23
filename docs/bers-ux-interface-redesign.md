# BERS interface redesign: clear actions, visual hierarchy and honest capabilities

## User problem
The production interface had icon-only primary navigation, an overlong Editor, controls that were visible but unusable without a saved mask, an eye icon that only changed the object-list row, and an Open-in-new-tab link labeled Download. A stripped-down layout alone would not solve these problems.

## Design language
- **Calm canvas-first UI:** warm neutral surfaces, deep teal for the primary action, generous whitespace, clear focus rings, and a consistent dark theme.
- **Text before icon guesses:** global navigation uses readable section names, the mobile header has a labeled Menu, and Editor history/versions/image-view actions have visible text.
- **Progressive expertise:** common actions are apparent; more involved controls remain reachable but contextually disclosed.
- **Every action states its result:** a preview is not a save, viewing an image is not a download, and a local overlay visibility toggle is not a destructive image edit.
- **Accessible interaction:** 44px touch targets, expanded/pressed states, keyboard-accessible object actions, Escape/outside dismiss for notifications, and mobile-menu current-section state.

## Main flows

| Place | Primary behavior | Feedback / authority |
| --- | --- | --- |
| Project library | New project and editable photo cards | File upload uses existing Core-owned project create; cards open canonical Editor |
| Header | Projects / Assets / Automations / Subscription / Settings | Route highlighting and labeled links; compact menu at mobile breakpoints |
| Image canvas | See the current project image, pick an object or a whole-image tool | No image mutation on mere selection |
| Crop / Resize / Rotate | Stage a concrete deterministic transform | Existing Core-authorized preview; Accept is required to save |
| Mask adjustments | Select and save an actual mask, then reveal exposure / color / levels | Preview button remains linked to the existing application handlers |
| Prompt | Enter an instruction, then Preview edit | ResultCompare offers explicit Accept / Retry / Discard |
| Object visibility | Toggle an eye button | Only the canvas overlay is hidden; image pixels and canonical Project stay unchanged |
| History | Undo, Redo, Reset, Versions | Original restore requires confirmation; project history remains Core-owned |
| Theme / notifications | Visible labels | Theme changes synchronize across mobile/desktop toggles; notifications can be marked read |

## Explicit limitations
- Creative Studio plans strategies; it does **not** directly apply image changes. The navigation description must say so.
- Features not production-admitted, such as local Real-ESRGAN x4, remain hidden behind their actual release predicate; they are not advertised as ready.
- Opening the full-size image uses a new tab. It is deliberately called **View image**, not Download. A true user-facing download needs its own verified release path.
- This pass does not claim all existing product buttons are functional. Remaining controls require journey-by-journey real browser verification; AI Editor, Scene masks and Voice may have separate draft acceptance blockers.

## Verification before merge or deployment
1. Run `tests/bers-ux-system-redesign.test.mjs` and `tests/editor-ux-progressive-disclosure.test.mjs`, plus existing Editor canonical boundary suites.
2. Build the production frontend at the exact PR head SHA.
3. Complete real Chrome + PostgreSQL release browser journeys. R3a verifies text navigation on desktop and menu interaction at a 390px viewport. R3b/R3c verify Rotate/Flip disclosure and canonical Preview → Accept history.
4. Confirm the seven required main checks plus any relevant workflow checks on that same SHA. Pending / queued are not green, and the known LaMa ONNX reproducibility drift remains unresolved.
5. Verify no auth, CSRF, Core security, billing or project authority is modified. Deploy to Railway **only after** the PR is approved and safely merged.

## Further design work
Audit every product mode with actual user journeys, translate the newly introduced product copy into supported languages, evaluate the responsive visual hierarchy against screenshots on phones and desktops, and improve export/download once its real execution path is verified. Keep incomplete features clearly described or in draft rather than disguising them as working buttons.


## Select & Mask — extended editor controls (first phase)

**Create a mask:** open **Smart Select** then choose **Smart**, **Add**, **Remove**, **Polygon**, **Lasso**, **Rectangle** or **Ellipse**. Manual brushes do not need Smart Select inference. Use the live selection overlay to see exact alpha coverage. Brush controls include **Radius (2–96 display px), Hardness (0–100%) and Opacity (0–100%)**. A noninteractive ring on the image shows the actual brush footprint; its diameter is twice the radius. Brush opacity is applied to a whole pointer stroke and changes actual ORIGINAL-resolution alpha. Subsequent strokes can build up coverage; Undo/Redo restores authoritative bytes.

**Inspect the mask:** adjust view-only **Show overlay**, **Overlay color (teal/magenta/amber)** and **Overlay opacity (0–100%)**. These controls change only a canvas visualization, never canonical MASK alpha or final image pixels. The mask coverage indicator and empty/tiny/full-selection warnings reflect the live mask.

**Refine mask edges:** use bounded **Edge Radius (1–32 px)** with **Grow, Shrink, Open, Close, Feather**, plus Invert, Clear, selection Undo/Redo. Polygon, Lasso, Rectangle and Ellipse expose Replace/Add/Subtract/Intersect composition where supported by the selection authority. The service performs the transformations; no browser-only masking shortcut fabricates persistent artifacts.

**Save and adjust:** choose **Done** to persist an authenticated canonical MASK through Core. The **Masks & objects** list labels saved MASK entries and allows users to select a mask and hide/show its canvas outline (view-only). When a mask is selected, the contextual adjustment panel offers:
- **Exposure:** 65 exact eighth-stop values from −4 to +4 EV, with Reset and Preview.
- **White balance:** Temperature −128…+128 Q8 and Tint −64…+64 Q8, both as real sliders, with Reset and Preview.
- **Levels:** five exact integer controls (input black/midpoint/white, output black/white), each with a slider and number input, Reset and Preview.

These adjustments submit to existing Core-authorized local execution and only alter the Project when the user accepts the resulting preview; Discard leaves it unchanged. Every release gate, nonce, canonical mask ID and original image lineage check remains intact.

### Current boundaries — not a complete Photoshop clone

This phase does **not** implement Photoshop layers, PSD files, imported channel masks, adjustment-layer blending modes or non-destructive editing of an **already-persisted** mask. Existing saved masks can be selected for subsequent Core-backed adjustments; they cannot yet be downloaded and re-opened for brush modification because the canonical mask API currently provides authenticated persistence but no approved authenticated read/download endpoint. The UI must not imply that it supports those absent authorities.

Acceptance includes TypeScript real-alpha brush opacity tests, exact-head UI wiring tests, real Chrome/PostgreSQL mask creation, live canvas RGBA overlay-color/opacity verification, and all required main and security checks before any deployment.
