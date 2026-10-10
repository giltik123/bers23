# BERS v1 Editor high-fidelity image QA (release-adjacent, non-authorizing)

Status: **QUALITY AUDIT / VISUAL REVIEW PENDING**. Tracking Core Editor v1 release floor and browser journey #233, but this audit does not assign an RC, grant production authority or override existing reviewed operations.

## Why this gate matters

Browser journeys already cover Project create/open, deterministic Crop/Resize/Rotate/Flip, Selection/MASK, Preview -> Accept/Discard, Undo/Redo/Version/Restore, stale-source conflicts and Local Only no-cloud paths via the canonical built SPA + Core/PostgreSQL release matrix. A green browser journey validates user and server behavior, **not** perceptual pixel quality. A separate exact-SHA image quality audit is therefore warranted.

## Newly implemented independent invariants

The test suite exercises the existing **unaltered** production deterministic kernels:

- **Crop:** compares exact RGBA rows with a separately written copy-loop oracle, including transparent hidden RGB. No interpolation is permitted.
- **Rotate/Flip:** compares all five orientations with an independent source-to-destination oracle on non-square and 1-pixel-wide images. An inverse transform must return every RGBA byte unchanged.
- **Resize:** equal-size identity and single-pixel/solid-color input must preserve precise bytes; bilinear interpolation cannot leak the RGB values of fully transparent pixels into visible foreground. This is a byte-contract invariant, not a perceptual anti-aliasing grade.
- **Masked Exposure/White Balance/Levels:** mask=0 preserves all source channels; mask=255 uses the unchanged operation; partial mask must be the declared deterministic weighted blend; alpha is conserved, including transparent hidden RGB. Source buffer must not be mutated.
- **Background Isolation:** source RGB bytes remain unchanged; alpha is multiplied by canonical mask coverage with integer rounding.
- **Boundary rejection:** malformed source geometry, mask size, crop rectangle and unknown rotation fail closed.

The comparison checks the primary kernel implementation against independent reference code where possible. Invariants involving the declared v1 blend law do not independently judge that law's appearance; image review remains necessary.

## Hosted real-photo visual checks

Path-scoped GitHub Actions `Editor v1 real-image fidelity QA` uses 3 publicly licensed real project photographs from the existing, reviewed `config/v1-fashion-real-image-fixtures.json`. For each photograph, it executes seven unchanged Editor operations and exports PNGs: **source, crop, resize, rotate 90°, masked exposure, masked white balance, masked levels, background isolation**.

The fixture is decoded to 512-pixel width in canonical orientation first. These generated files are *quality comparison outputs* and not exact bytes of the original downloaded image. The report preserves the original download SHA-256, the canonical decoded RGBA digest, every operation PNG SHA-256, output geometry, 3-run latency p50/p95, peak runner RSS and source licensing references. The contact grid is a **review aid**, not a correctness oracle; individual full-resolution images are also uploaded.

Runtime assertions independently verify lossless properties and reject any change outside the mask or any alpha drift in masked color adjustments. The quality report is named `BERS_EDITOR_REAL_IMAGE_FIDELITY_EVALUATION_RND` and **must remain `PENDING_INDEPENDENT_HUMAN_REVIEW`** until real-image outputs have been examined. The 3-photo set is a regression baseline, not a comprehensive professional editing benchmark.

Review artifact name: `bers-editor-real-photo-quality-<PR-head-SHA>`.

The fixture URL is allowlisted to direct Wikimedia HTTPS image delivery; malformed/unavailable/oversized inputs fail, with no synthetic substitute or cloud editor fallback. Node/sharp decode and photo normalization are explicitly preprocessing, not claims about final Core upload or browser color management.

## Quality acceptance rubric and additional coverage

Before claiming top-tier Editor quality, independently inspect output PNGs for:
- detail/no halos around hard subject/background edges at several resize ratios;
- midtone and skin-tone appearance for exposure, white balance and levels, avoiding noticeable banding or color clipping;
- selection feather transitions, color spills, and the exact unchanged region outside every MASK;
- orientation/EXIF, mixed color profiles/ICC and photographic alpha cases across ingest/export;
- browser canvas vs Core pixel parity, server-produced FINAL bytes, Before/After preview vs accepted Artifact, Undo/Redo/Restore after refresh and cross-device display;
- memory/latency on a representative laptop/mobile screen at larger image dimensions.

**This PR does not add models or claim generative retouching, Photoshop equivalence, or photorealism.** Advanced model editor tools remain separately qualified local R&D until licenses, quality, GPU/device resources, source/Project identity and explicit Accept are satisfied. `LOCAL_ONLY` can never auto-escalate to a paid/cloud provider.

## Release boundary

The existing published `DETERMINISTIC_EDITOR_V1` production classification and previously accepted user journeys are unchanged. Any pixel law change identified from review requires a separately versioned and Core-verified production operation plus a new exact-SHA comparison. Do not mutate production pixels merely to satisfy this new audit.

The BERS v1 RC remains governed by `config/v1-release-readiness.json` and its mandatory blockers, including Fashion quality #230 and hosted frontend evidence #233.
