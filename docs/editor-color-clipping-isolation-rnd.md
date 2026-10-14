# Standalone Editor color and clipping diagnostics — R&D only

Source: **six unchanged source/test files** from Draft #988 at exact SHA
`4adca122ea52d561cf6ba7a25b4d8e8a5d4de2cd`.

- `EditorColorDifferenceRND.ts`: deterministic bounded CIEDE2000 (Delta-E)
  diagnostic using assumed common sRGB/D65 RGBA8 images, optional R8
  editable mask, alpha handling, pixel-count bounds and sample limits.
- `EditorTonalClippingRND.ts`: counts highlights/shadows per channel
  on visible photo pixels, with new clipping restricted to editable regions.
- `EditorQualityInspectorRND.ts`: independent immutable changed-pixel
  and near-white/near-black diagnostic (all three channels), used in one
  original `editor-tonal-clipping-rnd.test.mjs` case to distinguish
  saturated red from near-white. The module has no imports.
- All **three original Node test files** are unchanged; the two primary
  diagnostics alone are insufficient to execute the source suite because the
  tonal test imports the original inspector module. This missing dependency
  was found by exact-head CI at initial SHA `8576aa1c`; no test was deleted,
  skipped, rewritten or relaxed. A subsequent commit copied the dependency
  and its own tests unchanged, then included them in the workflow.
- The workflow asserts exact pull-request head SHA and runs all three
  test suites, typecheck, build and diff hygiene.

**No runtime admission**: no active imports from Editor, Core or
Project/Artifact, persistence, schema, HTTP endpoints, browser UX, provider,
model, billing, feature enablement, production or deployment changes.

These functions emit *advisory diagnostics*, never a release quality grade:
`qualityApproved=false` and
`releaseQualityDecision=UNREVIEWED_DIAGNOSTIC_ONLY`.
Delta-E and clipping do not prove photographic realism, garment fit,
skin preservation, human aesthetic quality or canonical MASK provenance.

**Limitations**: no actual ICC/profile conversion or Display-P3 handling,
real-photo perceptual sign-off, real-device/browser experience, Core
save/revision/authorization, human owner acceptance or production integration.
Large Editor Drafts #988/#995/#1003/#1009/#997/#998 remain blocked and
issue #365 release gates are unchanged.

Keep this PR **Draft** pending terminal exact-head CI and independent review.
A standalone passing algorithm test is not a basis for product admission.
