# BERS Editor — audited lossless PNG export research

Status: **EXPERIMENTAL, NOT WIRED TO PRODUCT**. Owner authorized quality-first expansion after postponing BERS 1.0; no release date or production graduation is implied.

## Problem

The legacy `src/lib/pipeline/exportManager.js` relies on Canvas and `coreClient.integrations.Core.UploadFile`, which is **not** an approved canonical Project/Artifact publishing route. A professional export must start from a reviewed FINAL source, preserve image fidelity, prevent cross-project substitution and give the user meaningful format/color/alpha choices without silently charging or sending an image to a cloud service.

## First implementation

`src/application/editor/EditorLosslessExportRND.ts` offers a single local function, `prepareEditorLosslessPngExportRND`. It:

- Accepts exactly canonical orientation-1, sRGB, RGBA8 image pixels and a bounded geometry (up to 16,777,216 pixels); rejects unknown profiles, rotations and mismatched data.
- Requires a filename-safe base name, source Artifact identifier and 64-character lowercase claimed Artifact SHA-256 (the latter is **not verified against Core** by this utility).
- Takes an immediate immutable **byte snapshot before the first `await`**, preventing concurrent editing during hashing and encoding.
- Uses the existing browser-safe `encodeDeterministicRgbaPng` encoder: no Canvas re-render, interpolation or lossy conversion.
- Computes SHA-256 over the copied canonical RGBA pixels and independently over the resulting PNG file bytes. The returned bytes use a defensive getter: callers cannot tamper with the digest-bound internal PNG data through a previously returned byte array.
- Returns only a local byte candidate and proof metadata. It neither downloads nor uploads, publishes a FINAL, mutates a Project, invokes a model/provider or touches Billing.

### Executable quality validation

`tests/editor-lossless-export-rnd.test.mjs` decodes output through **Sharp's Core-style PNG decoding path** and asserts byte-exact equality, including semi-transparent alpha, fully transparent hidden RGB, orientation and dimensions. Additional tests check stable PNG bytes, source modification races, immutable returned internal bytes, hostile file names and wrong color spaces.

The path-scoped CI `.github/workflows/editor-local-lossless-export-rnd.yml` builds an exact-head proof and runs the PNG decoder assertions. Passing CI means **lossless encoding contract for covered cases**, not full color-managed export acceptance.

## Hosted real-photo PNG regression

The path-scoped workflow now has a second job which takes **three publicly licensed original photographs** from the frozen Fashion fixture list. Each download is restricted to direct Wikimedia HTTPS URLs, capped at 25 MB and decoded to bounded, orientation-correct sRGB RGBA8 first.

For each image the CI performs two independent local PNG exports, verifies deterministic encoded bytes within one runner, checks SHA-256 on canonical RGBA and file bytes, independently decodes PNG using Sharp, and requires every RGBA byte—including alpha and hidden RGB—to match exactly. It records source licensing, original/decoded SHA, dimensions, source format, embedded-profile/EXIF inventory, runtime and peak RSS. It uploads three actual PNGs and a machine-readable manifest named `bers-editor-png-export-real-photo-<exact-PR-head-SHA>`.

**No claim of original-JPEG byte preservation or roundtrip of original camera ICC/EXIF tags**: the explicitly measured input is the canonical decoded sRGB frame after EXIF normalization. A valid PNG export is not proof of print-color accuracy, JPEG/WebP quality or canonical FINAL/tenant authority.

## Further Core/UX work

1. A **Core-owned source resolver** must independently authorize `tenantId/userId/projectId`, the accepted FINAL Artifact identity and its actual stored source SHA, before serving any export bytes. Never trust a client-supplied claim.
2. A single audited download route should set safe `Content-Disposition`, MIME, CSP/cross-origin policy and signed short-lived delivery. Avoid the legacy `Core.UploadFile` authority gap.
3. UI Export Studio: original vs preview resolution, explicit PNG/JPEG/WebP choice, color profile/alpha handling, size estimate, crop framing and an independent download/roundtrip comparison. JPEG/WebP require measurable compression/skin-tone/detail tests before production.
4. Browser/PostgreSQL integration proof for current accepted FINAL vs downloaded file after Undo/Redo/Restore, revoked signed URLs, cross-tenant access denial and stale-source conflicts.
5. Real-photo ICC/EXIF/display-P3 transparency and exact pixel parity evidence on different browsers/mobile GPUs.

**Do not merge this R&D helper as an enabled production export mechanism without the above evidence.**
