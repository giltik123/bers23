# Fashion Try-On: deterministic foreground occlusion preview (R&D)

Status: **NOT PRODUCTION-ADMITTED / NOT QUALITY-VALIDATED**. This work does not change
the existing F4b canonical candidate, its immutable execution envelope, its Core
verification, or any Fashion finalization/release authority.

## Problem and narrow improvement

Existing deterministic mesh-warp and texture composite can fit garment pixels
to a selected torso, but the final source-over step draws the entire garment
above the Project photo. An arm or hair that should be in front may be painted
over by the shirt.

`compositeGarmentWithForegroundOcclusionRgba8` is a pure, additive renderer
prototype for a *separately verified, Project-coordinate foreground coverage
matte*. It accepts an already-warped/feathered garment layer, the exact Project
RGBA bytes, dimensions and one coverage byte per pixel:

- `0`: garment is in front (legacy source-over).
- `255`: preserve all original Project RGBA bytes (arm/hair in front).
- `1..254`: deterministically reduce only the garment alpha using round-half-up,
  then use the existing fixed-point sRGB source-over compositor.

The garment's RGB pattern, lettering and logo are unchanged; there is no
uncontrolled AI synthesis or model-dependent output. This layer is not a
person/arm segmentation algorithm; no trustworthy matte is yet produced by
the canonical production pipeline.

## R&D provenance guard now implemented (still non-authorizing)

`server/core/fashion/foregroundOcclusionEvidence.ts` now validates one
independently **manually reviewed** matte against a caller-supplied expected
tenant, Project, exact Project-image SHA, Project geometry and garment-layer
SHA. It verifies the matte's actual SHA-256 bytes and rejects stale image
versions, cross-tenant/cross-Project substitution, mismatched dimensions,
unauthorized source classes and mutated masks. Dedicated test:
`tests/fashion-foreground-occlusion-evidence.test.mjs`.

**Security boundary:** this helper does not authenticate callers, query Core
ownership, establish whether a human review really occurred, or grant
candidate submission, preview FINAL, Project Accept or execution authority.
The supplied `expected` must ultimately come from an independent authorized
Core resolver; caller-controlled expectations would not establish trust.

## Required admission and quality work, not completed here

1. Define a **Core-owned** foreground-matte provenance contract bound to the
   exact Project image SHA, geometry, tenant/project scope, body anchors and
   immutable garment execution/FINAL parent. Never accept an arbitrary
   browser-supplied or model-supplied matte as truth.
2. Produce and validate real arm/hair segmentation mattes. Reject mismatched
   geometry, stale image versions and unsupported subjects; supply manual
   correction or fail closed when confidence is low.
3. Include the matte SHA and pixel law in a versioned, purpose-bound execution
   envelope. Recompute independently server-side before Project authority is
   granted. Keep idempotency and immutable lineage rules intact.
4. Evaluate real photos with front-of-torso arms, crossed arms, hair across the
   garment, three-quarter poses and challenging sleeve edges. Check logo,
   printed text, garment and arm preservation under each matte.
5. Separate **body-pose alignment** (shoulder/waist/hip anchors, mesh topology)
   from **cloth drape/shadows** (possibly requires a separately qualified model).
   This prototype addresses neither automatically.
6. Record exact-SHA repeatability, runtime, memory, image hashes and owner
   quality disposition. Until accepted, retain
   `FASHION_REAL_IMAGE_QUALITY` / #230, `rcSelectable=false`, and the
   unchanged six-output historical real-photo evidence.

## Regression protection

`tests/deterministic-garment-texture-composite.test.ts` proves zero matte
matches existing source-over byte-for-byte, complete foreground returns exact
Project pixels, intermediate alpha is deterministic, inputs remain unchanged,
and malformed matte/image geometry fails closed.

No automatic deployment, model installation, release gate removal or runtime
authority is requested by this preview.
