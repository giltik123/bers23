# Fashion alpha-outline sizing comparison (R&D only)

**Status: RESEARCH_ONLY. No production/RC/model/provider/FINAL authority.**

## Observed defect

The existing real-image capture renderer uses the entire 384×384 garment
image as its source UV frame. An opaque garment occupying 40–60% of a
transparent frame is consequently shrunk inside the target torso quadrilateral.
Padding is not wearable garment area; mapping it onto the body creates a
small decal-shaped shirt even when torso anchors are correct.

## Candidate implementation

`scripts/fashion-alpha-outline-fit-rnd.mjs` identifies the exact bounding
box of source pixels with alpha >= 16 and uses that rectangle as source mesh
corners. It maps those corners to the *same* explicit four-corner torso frame
and uses the existing deterministic GarmentTextureComposite kernel: no new
model, no generated pixels outside the garment input, no automatic human
segmentation, no other Core authority.

This is an optional **research comparison**, not a silent replacement of the
established F4b mesh/texture execution law. It rejects invalid dimensions,
folded/mirrored target frames, empty/degenerate alpha, no cropped alpha margin,
per-axis magnification above 4x and anisotropic scaling beyond 2x.
These are conservative research bounds, **not** proven human-fit thresholds.

An opaque JPEG / photographed clothing on a white background has no trusted
alpha matte and will be skipped. Do not use RGB/color guessing to treat white
background as a mask. Transparent alpha does not attest to garment provenance;
real Core integration would also require tenant/project/source and stored
garment-view identity binding.

## Reproducible A/B capture

Use the current version-locked research fixtures and an exact candidate SHA:

```bash
node --experimental-strip-types scripts/capture-fashion-real-image-quality.mjs \
  --candidate "$EXACT_40_HEX_SHA" \
  --manifest config/v1-fashion-real-image-fixtures.json \
  --out .test-cache/fashion-alpha-outline-compare \
  --compare-alpha-fit
```

The original `outputs/*.png` and `machine-evidence.json` remain byte-for-byte
based on the existing baseline. Additional previews, **only** for sources
with legitimate transparent alpha, are saved under
`research-alpha-fit/*.png` with a comparison report listing source bounds,
magnification, preview hashes and one-run latency. A skipped garment has an
explicit reason, not an invented improvement. The result report is
`RESEARCH_ONLY`, `reviewed:false`, `approvedForProduction:false`.

```bash
node --test tests/fashion-alpha-outline-fit-rnd.test.mjs
```

## Remaining requirements

1. Use legally permitted sources with trusted, source-bound garment masks
   (manual contours are available in BERS Core) and collect visually reviewed
   before/baseline/candidate triplets.
2. Compare real shirts, long sleeves, patterns/logos and non-front-facing
   poses; diagnose body/source anchor scale and alpha boundary quality.
3. For actual Core adoption, introduce a versioned mesh mapping contract and
   validate exact-input replay across mixed-version deployments. A v1 behavior
   change without versioned hashes is not approved.
4. Add identity-safe foreground occlusion, old-clothing removal or reject
   cases requiring volumetric/drape synthesis. This alpha crop alone **cannot**
   solve those problems.
5. Keep Fashion #230 `FASHION_REAL_IMAGE_QUALITY` blocked until independent
   real-photo evaluation, latency/memory evidence and owner acceptance. No
   release promotion/production deploy via a green R&D CI.
