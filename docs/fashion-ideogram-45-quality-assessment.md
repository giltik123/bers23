# BERS Fashion quality — Ideogram 4.5 capability and license assessment (2026-10-10)

**Classification: R&D ONLY — no quality claim, model/provider admission, API connection, customer-photo upload, commercial license or release gate change.**

## Grounded comparison

Official sources checked:
- Ideogram 4.5 product/precise edit: https://ideogram.ai/models/4.5/ ; https://developer.ideogram.ai/ideogram-api/api-overview
- Ideogram licensing: https://ideogram.ai/licensing/
- Ideogram 4 public source: https://github.com/ideogram-oss/ideogram4
- Ideogram 4 weights agreement: https://ideogram.ai/legal/non-commercial-model-agreement/
- Service/API restrictions: https://ideogram.ai/legal/usage-policy/ and https://about.ideogram.ai/legal/api-tos
- BERS canonical release blockers: `config/v1-release-readiness.json`, issues #230 and #365

| Candidate | Access | Suitability for BERS | Decision |
| --- | --- | --- | --- |
| Ideogram 4.5 Precise Edit | Hosted v2 API supports masks, up to four image references, and source-size output; public self-hostable 4.5 weights **not verified** | Reference architecture/possibly opt-in paid comparison only; customer photo privacy, server-only secrets, billing, consent and legal terms apply | **Study behavior; no automatic API calls** |
| Ideogram 4 public 9.3B nf4/fp8 | Inference source Apache 2.0; pretrained weights **non-commercial** unless separately licensed; enterprise needed for some customer-facing cases | Heavy base text-to-image model rather than specialized local Try-On; does not automatically replace FASHN or guarantee exact garment fidelity | **Do not vendor weights into production** |
| FASHN VTON v1.5 | Apache 2.0 core source/weights with separate parser/dependency rights audit; parserless fork in draft #983 | Specialized garment transfer local candidate, GPU evidence still missing | **Retain as local R&D baseline** |
| BERS deterministic Try-On | Canonical Core-backed pixel/geometry authority already implemented; two-triangle real-image capture still has flat drape and occlusion shortcomings | Zero provider spend with exact garment identity, but needs higher realism and owner-reviewed quality | **Mandatory v1 release floor; improve openly** |

**Legal line:** Code Apache-2.0 does not make Ideogram 4 model weights Apache-2.0. Ideogram's published restrictions prohibit commercial use of research weights without a separate license and restrict use of service inputs/outputs to develop competing products. Do not use Ideogram 4/4.5 outputs as BERS model-training or distillation data. Obtain written license/permission before any such use. Paid API is not a local backend.

## Higher fidelity through independent BERS architecture

The *idea* of pixel-precise, repeated local editing is a general engineering property, not a transferable Ideogram algorithm or model architecture. The independent `FashionPreciseRegionPreview.ts` research primitive verifies/tests it at the **decoded RGBA byte boundary**, with no Ideogram dependency.

Protected-region control contract:
1. Core (not browser/model) must resolve exact Project ORIGINAL/current image, garment source/representation and **trusted** editable/foreground mask lineage. Mask evidence must bind tenant, Project, exact image SHA-256/dimensions and tool version. The pure preview module validates only shape, never lineage/ownership.
2. Per-pixel edit coverage 0..255: 0 means no edit, 255 means use candidate, intermediate values blend in documented sRGB byte-domain. Protected mask must be binary; protected always overrides editable. Existing original RGBA outside effective ROI is copied byte-for-byte.
3. Two explicitly different experimentation modes: `STRICT_VERIFY` rejects *any* model drift outside permitted area, while `COPY_OUTSIDE_ROI` reconstructs untouched original pixels and records every detected outside/protected candidate change. The latter is **not** a pass verdict and can leave seam/geometry defects. Inputs must be opaque RGBA photos.
4. No candidate automatically becomes FINAL or accepted. Never let a provider-supplied mask, AI-parsed ROI, client parameter or generated artifact obtain Core trust.

### Quality improvements not yet achieved

| Priority | Visual failure | Required next work | Proof required |
| --- | --- | --- | --- |
| P0 | Face/skin/background drift from editing | Trustworthy protected source masks + current Project binding + exact ROI preservation | Byte-exact outside-ROI and protected pixels, including chained edits |
| P0 | Arms/hair appear painted behind garment | Separate manually reviewed/independently verified foreground matte and PR #980 occlusion candidate; no fake body-depth inference | Real crossed-arm, hair, sleeve, layered clothing examples, pixels/edges + reviewer decision |
| P0 | Flat/two-triangle fit, wrong sleeves/waist | Better body-anchor confidence, fitted multi-mesh contour, depth/pose aware warp with valid garment silhouette | Same-fixture A/B, pose alignment, landmark error, visible artifacts |
| P0 | Logo/text/pattern mutations | Keep exact Garment source identity and mask-controlled texture reprojection; never permit free-form logo reconstruction to silently replace input | Same-garment pattern/reference geometry tests, text readability and reviewer visual comparisons |
| P1 | Flat lighting/drape | Local specialized VTON model (FASHN parserless branch) or *separately admitted* relighting/drape pipeline, conditioned on actual garment | Same-photo baseline A/B, real GPU p50/p95/VRAM and subjective blind review |
| P1 | Repeated edits degrade quality | Copy protected outside pixels from canonical base instead of recursively sampling a whole-frame generation; immutable edit lineage per step | 1/3/5-step before-after regression on identical immutable inputs |
| P1 | Low detail at high resolution | Bounded ROI crop + halo, high-resolution patch generation, seam composition back to full-resolution source | Outside-ROI bit-exact, boundary seam review, no unexpected scaling/EXIF issues |

**Evaluation rubric:** quality is not a single score. Report separately (a) correct garment category/fit, (b) person identity/face, (c) arm/hair occlusion, (d) print/logo/text geometry, (e) color/material and drape, (f) protected-region drift, (g) p50/p95 latency and peak RAM/VRAM, and (h) reproducibility, correct licensing and failure modes. Use the same legally sourced photographs and garment assets for baselines. Treat unknown/unverified mask or low-confidence pose as **not eligible** for quality acceptance, not as a silent fallback.

The current six deterministic quality fixture outputs are **not** a pass: they explicitly report flat drape and perspective/occlusion limits. Owner review remains pending; no observed real-image improvement is claimed from this isolated 2x2-style pixel contract. Issue #230 stays open and the release ledger unchanged.

## Alternatives considered

- **Use Ideogram 4.5 cloud by default:** rejected. It violates BERS LOCAL_ONLY expectations, requires consent/commercial provider governance, and would bypass user-controlled spend if not admitted through existing Core + Billing.
- **Copy Ideogram 4/4.5 trained weights/behavior into BERS:** rejected. No verified self-hostable 4.5 weights; published 4 weights have non-commercial restrictions and are too large for compact default.
- **Trust the edited full frame or use free-form masks from the browser:** rejected. Changes person/brand pixels outside intent and creates untrusted authority.
- **Independent byte-exact ROI guard plus specialized VTON and original Garment texture:** **selected** for correctness, local deployability, testability and legal independence; more integration/testing is required.

## Acceptance and next code cut

This draft adds **only** a pure experimental preview primitive and isolated tests. It does not merge with the foreground PR #980, the parserless FASHN draft #983, or the release-evidence review draft #984. Next integration requires exact Project/garment/mask SHA provenance, independently computed server-side masks, a Core execution-ticket boundary, final-pixel verification and real-image comparison. Keep feature disabled until that is tested on real photographs and hardware.

Suggested test:
`node --experimental-strip-types --test tests/fashion-precise-region-preview.test.mjs`

Do not change `FASHION_REAL_IMAGE_QUALITY`, `rcSelectable`, production model/admission, or finance flags based on this document/PR.
