# BERS Professional Local Pixel Engine — real image quality recovery

**2026-10-10. Status: new, isolated R&D quality candidate, NOT production Photoshop parity or an authorized BERS Core tool.** Product owner rejected the visual quality of the existing displayed examples and instructed the team to raise local editing to a professional standard. This PR **starts fixing the pixel operations themselves**, not merely collecting more metrics.

## Observed production-quality debt

- The accepted v1 `Resize` uses fixed-point bilinear resampling. It has trusted byte-level properties, but strong decimation risks aliasing/loss of detail; bilateral/skin/high-frequency source geometry needs actual photographic review.
- The accepted v1 `MaskedExposure` and `MaskedWhiteBalance` hard-clamp adjusted per-channel sRGB bytes to 255. In the hosted three-photograph QA a strong exposure setting visibly flattened highlights. An existing RGB byte-perfectness PASS does **not** imply visually pleasing photos.
- The previous exploratory layer compositor did source-over blending directly in gamma-encoded sRGB bytes. That is a documented v1 R&D behavior but not a robust scene-linear color-management foundation.
- Fashion try-on garments are still visibly flat overlays without convincing pose, material deformation or foreground arm/hair occlusion. **None of the kernels in this PR solves Fashion model geometry.** Fashion #230 must remain a distinct blocker.

## Working improvements (not silently replacing old v1 pixel contracts)

| R&D candidate | Concrete implementation | Expected visible benefit |
|---|---|---|
| `ProfessionalResizeLanczosRND.ts` | Separable antialiased Lanczos3 (widened filter support when downsampling), sRGB EOTF/OETF, premultiplied linear-light RGBA, local min/max anti-ringing clamp and no painted edge from hidden transparent RGB | Preserve high-frequency detail while resizing, reduce downsampling aliasing and blue/black fringes at cut-out edges |
| `ProfessionalLinearLayersRND.ts` | Accurate source-over in linear RGB, unassociated input/output with per-layer alpha, R8 mask, Q8 opacity, immutable bytes and deterministic output | More physically plausible lighting at translucent mask boundaries; white over black at 50% opacity is around sRGB 188, not 128 |
| `HighlightProtectedToneRND.ts` | Monotone rational soft-shoulder curve on max channel in linear RGB, preserves linear RGB ratios, explicit mask and original alpha, no clipping plateau at positive stops | Brighten midtones without the former indiscriminate 255 channel plateau. Does not recover already-clipped source data |
| `ProfessionalCloneStampRND.ts` | Actual local pixel-copy retouch tool: separately chosen source/target point, circular 1px-antialiased soft/hard brush, R8 protection matte, linear-light color mixing and exact target alpha/source immutability | Manually repair small photo details by cloning existing texture without a remote model or indiscriminate blur. This is a Clone Stamp, **not** content-aware healing. |

### Existing rights, fidelity and safety boundaries

The accepted `Resize`, `MaskedExposure`, `MaskedWhiteBalance`, `MaskedLevels` and prior Core/Project/Artifact/tenant contracts are **unchanged**. New filenames and explicit `RND` exports are intentionally not discoverable through production tool catalogs, Editor/Agent, Billing, Provider or direct Core FINAL paths. `LOCAL_ONLY` means no remote generator/upload.

Input requirement: Canonical orientation-1 **sRGB** RGBA8, independently source-authorized by Core before any future production acceptance. This PR does not accept arbitrary unmanaged ICC/Display-P3 source data, and its limited 4.19-megapixel in-memory bounds are not equivalent to native Photoshop gigapixel workflows.

The photo-quality sample uses three publicly licensed Wikimedia photos from the already committed fixture config, normalized at 512px width. It records a three-way compare against the accepted bilinear kernel, the new antialiased Lanczos3 and Sharp Lanczos3 as a *diagnostic* (Sharp's gamma policy may differ). It also captures four tone/layer comparisons — source, legacy hard-clipped exposure, new soft-shoulder tone and linear-light white studio layer — with original and output SHA, ICC/EXIF inventory, timing/RSS, and protected-matte pixel checks. Reports must say `PENDING_INDEPENDENT_PHOTOGRAPHIC_REVIEW` and `coreAuthorityGranted:false`.

Numerical tests cover exact no-op/flat pixels, checkerboard anti-aliasing and linear-light energy, opaque/transparent RGBA fringe behavior, anti-ringing minima/maxima, correct gamma-light layer blending, zero-mask preservation, relative hue stability, preserved tonal distinctions, fail-closed bad dimensions/parameters, and the Clone Stamp's source-registered RGB transfer, feather and protected alpha semantics.

## Actual browser interaction: isolated local Quality Lab

The branch also provides `src/pages/ProfessionalEditorLabRND.jsx` as a **functional manual testing interface**, not a deployed production Editor route. It supports local photo file import (PNG/JPEG/WebP, max 20MB/2MP), original-versus-current image viewing, exposure tone slider, Lanczos3 resize by width, linear-light studio fill, pointer-based manual Clone Stamp with source and target, brush radius/hardness/opacity, five reversible local Undo/Redo snapshots, and explicit local PNG export through the existing deterministic encoder. The browser never uploads the image, invokes a provider, bills credits or commits a Project FINAL.

It is deliberately available **only in a local Vite development build and only with an explicit flag**:

```bash
VITE_BERS_EDITOR_PRO_LAB=true npm run dev
```

After authenticating in the local development environment, visit `/editor-pro-lab`. Without this development flag, the route is not installed; production bundles are guarded by `import.meta.env.DEV` as well. A path-scoped test asserts the route is inside the authenticated AppLayout, that local algorithms and Undo/Redo exist, and that no Core/upload/agent/billing calls occur. No enablement is added to `main` or to release configuration through this draft.

**Not yet professional production:** Canvas's browser-side image decoding may convert ICC/EXIF/hidden transparent RGB, output pixel previews are browser-managed, editing is synchronous (a 2MP job can block the UI), there is no content-aware Heal, no true stored layer document and no Core source/tenant/project authorization. The lab is for first-hand visual inspection of better local processing; **never replace canonical stored FINAL pixels from its preview**. Future worker/ICC/16-bit, advanced brush and Core-v2 execution must be measured and admitted separately.

## Acceptance before replacing the actual Editor

1. **Photographic A/B acceptance**, with human review at 100% and 200% on skin, hair, high-contrast text/logos, scenery, white dresses, cutout edges and gradients. Capture destructive aliasing and undershoot/ringing, not just averages. Use actual photo output, not artwork or stock mockups.
2. **Color and performance:** independent color management against ICC Display-P3 and sRGB, highlight/shadow roundtrips, retina/GPU browser parity, measured large-photo time/memory and abortable worker/thread execution. Float64 JS pixel transforms are an R&D CPU reference, not yet fast enough for all professional full-resolution images.
3. **Versioned v2 Core contract:** authenticated user, tenant, Project, current source Artifact SHA, accepted MASK and operation version, durable Preview→Accept history, exact canonical download/export and rollback. Rejected/expired/stale tickets must not mutate Final. No silent switch of v1 accepted Resize pixel law.
4. **Usable professional controls:** nondestructive layers/adjustment masks, precise brush/heal/clone, color curves, histogram/gamut warnings, brush edge refinement, manual keyboard/touch, safe pan/zoom and real-resolution preview with proper color appearance. Measure actual user-perceived quality and speed.
5. **Fashion is separately unsolved:** pose-conditioned geometry/deformation, local licensed model or warp quality, person foreground matte/manual repair, lighting/shadows, sleeves/hand/hair occlusion, cloth textures and identity preservation. One flat source-over garment composite will never be claimed as Photoshop-class virtual try-on.

**Release policy:** Owner postponed BERS v1.0 without a date. Keep `rcSelectable:false`, required migration/recovery and hosted frontend security gates, and unpaid/cloud model restrictions. No production admission solely from kernel tests or one real-photo CI capture.
