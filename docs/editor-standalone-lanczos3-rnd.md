# Standalone Lanczos3 raster resize candidate (R&D only)

**Status:** inert research code. This branch extracts only the existing, unmodified Lanczos3 candidate and tests from Editor quality Draft #995; it does not enable a UI route, Core executor, model, provider, paid operation, or release change.

## What the tests actually prove

The pure `resizeProfessionalLanczos3Rgba8RND` implementation uses an antialiased Lanczos3 footprint for downsampling, float64 separable reconstruction in scene-linear sRGB with premultiplied alpha, and color extrema limiting to reduce visible ringing. It enforces at most 4096 × 4096 dimensions and 4,194,304 pixels, an explicit work budget, exact identity for unchanged dimensions, and exact flat RGBA for constant images. Tests compare checkerboard energy to accepted bilinear Resize v1, and check anti-ringing, alpha edges and hidden RGB.

## Deliberate restrictions

- `Resize.ts` and its accepted v1 pixel law are unchanged. This module is **never imported by the shipped Editor, Core, workflow engine or tool catalog**.
- Numerical checks and deterministic small fixtures do **not** establish professional real-photo quality, color-management accuracy, physical-device performance, Display-P3/ICC/EXIF fidelity, or Fashion fit.
- Any future production use requires independent photo A/B review (hair, translucent cutouts, text and garments), source-registered canonical Artifact/Project/tenant authority, operation versioning, Preview→Accept lineage, large-photo performance limits and owner approval.
- The broader #995 Draft retains advanced linear layers, soft tone, clone stamp, QA lab and Fashion photographic quality blockers. This extraction neither merges nor approves those features.

Release status and model/provider/billing/RC authorization remain unchanged.
