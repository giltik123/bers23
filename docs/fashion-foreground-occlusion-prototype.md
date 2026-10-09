# Fashion foreground occlusion — experimental recovery path

Status: **PREVIEW-ONLY PROTOTYPE / NOT_ADMITTED** (no production feature change).

## Why this exists

The v1 real-image quality capture applies a garment across four torso corners with two triangles, then alpha-composites it on the Project photograph. It has **no verified foreground depth/segmentation mask**. Thus an arm or hair crossing the shirt may be painted over by the garment even when the source photograph shows the arm in front.

The accepted deterministic Try-On quality proposal documents two current limitations: flat garment appearance without synthesized drape; and limited pose/occlusion/perspective fitting. This prototype addresses only the **pixel-layer occlusion operation**. It cannot infer which pixels are arm/hair, simulate cloth, or guarantee convincing perspective. No existing six-image quality decision changes.

## Experimental composition contract

`restoreGarmentForegroundOcclusionRgba8(project, composite, maskR8, width, height)` is an isolated pure operation:

- all input images must be complete RGBA8 at the bounded Project geometry;
- `maskR8` has exactly one byte/pixel and contains **only 0 or 255**;
- a 255 mask value restores the exact original Project RGBA pixel **in front of** the composited garment;
- a 0 value keeps the existing composited garment RGBA pixel exactly;
- all inputs are unchanged; no AI inference, thresholding, interpolation, provider call, billing, Final or production authority;
- malformed masks and geometry fail closed.

**Important:** the operation itself does not authenticate or validate mask origin. A future production integration must first prove that the mask was derived from a current, consented Project and approved by the correct user/Core authority. Passing an arbitrary client-supplied mask would undermine the canonical Try-On lineage.

## Remaining engineering before this becomes a real fix

1. Obtain or author a trusted front-person segmentation mask at the exact accepted Project geometry. Support manual correction around arms and hair, with stable per-project lineage and rejection of stale source revisions.
2. Prove mask alignment and preserve garment pattern/identity through a pose-aware, piecewise garment mesh; do not silently change canonical triangulation or rewrite audited artifacts.
3. Run *before/after* real-photo benchmarks, including bent arms, side poses, crossing hands, fine hair, patterns and text. Human review must verify no leaked mask edges and preserved original foreground pixels.
4. For folds/drape and lighting, evaluate separately admitted model refinement; existing `REFINE_REALISM_V1` support is `NOT_ADMITTED` and does **not** grant model/provider execution.
5. Perform security, resource, exact-SHA, browser/E2E and production rollout review. Only then consider updating the official Fashion output set and requesting **new** owner acceptance.

This prototype does not change `config/v1-release-readiness.json`, any `review.json` or the deployed Try-On application. No release gate is bypassed.
