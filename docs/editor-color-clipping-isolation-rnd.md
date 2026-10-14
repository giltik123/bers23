# Standalone Editor color and clipping diagnostics — R&D only

Source: six source/test files originally copied from Draft #988 at exact SHA
`4adca122ea52d561cf6ba7a25b4d8e8a5d4de2cd`.
**Four files remain byte-identical**. The Delta-E implementation and its
test now contain a narrow regression-tested **bug fix**, described below.

- `EditorColorDifferenceRND.ts`: deterministic bounded CIEDE2000 (Delta-E)
  diagnostic using assumed common sRGB/D65 RGBA8 images, optional R8
  editable mask, alpha handling, pixel-count bounds and sample limits.
- `EditorTonalClippingRND.ts`: counts highlights/shadows per channel
  on visible photo pixels, with new clipping restricted to editable regions.
- `EditorQualityInspectorRND.ts`: independent immutable changed-pixel
  and near-white/near-black diagnostic (all three channels), used in one
  original `editor-tonal-clipping-rnd.test.mjs` case to distinguish
  saturated red from near-white. The module has no imports.
- The original clipping and quality-inspector tests remain byte-identical,
  while the original Delta-E tests gained one overflow regression. The two
  primary diagnostics alone were insufficient to execute the source suite
  because the tonal test imports the original inspector module. This missing dependency
  was found by exact-head CI at initial SHA `8576aa1c`; no test was deleted,
  skipped, rewritten or relaxed. A subsequent commit copied the dependency
  and its own tests unchanged, then included them in the workflow.
- **Overflow bug discovered after initial 77/77 success:** the bounded
  CIEDE2000 histogram used a 401 overflow bucket for values >=100.25,
  but reported p95 `UpperBound=100` even when an evaluated sRGB pair
  exceeded 100. A new single-pixel saturated-green versus magenta
  regression asserts the returned upper bound is no smaller than the
  measured Delta-E. In the overflow bucket the implementation now
  conservatively returns the observed sampled maximum, not 100;
  it remains an *upper bound on sampled observations*, not a claim
  about every pixel or perceptual acceptability. The standalone source
  #988 was **subsequently updated in its own Draft branch** with the same
  source and test correction (see #988 at `57825155d10934c270ef435d07743ab3d9bf2c25`);
  #988 is still blocked by separate canonical-download integration CI.
- The workflow asserts exact pull-request head SHA and runs all three
  test suites, typecheck, build and diff hygiene. Pre-fix 77/77
  success at `84d9d03` is historical, not evidence for the new SHA.

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

Only merge this isolated research artifact after its exact-head CI completes
and the repository's review/branch protections are satisfied. A review or
research merge is not approval to import these algorithms into Editor/Core,
or to change any release gates.
