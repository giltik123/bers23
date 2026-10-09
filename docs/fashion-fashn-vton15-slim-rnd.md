# BERS Fashion AI — slim FASHN VTON 1.5 research slice

Status: **R&D ONLY — NO GPU INFERENCE / NO MODEL OR PRODUCT ADMISSION**.

## Exact reviewed upstream

- Public upstream: https://github.com/fashn-AI/fashn-vton-1.5
- Source checkout: `7c0f10af3f91ad4048fe9729c470a13ef905d25a` (exact commit, not floating `main`).
- Model card/weights: https://huggingface.co/fashn-ai/fashn-vton-1.5
- Official VTON weights `model.safetensors`, SHA-256:
  `d6cd38286885bc29fa487ea9383f80ffeb95862e7747c630d42c5d3c05bdd35a`
  (metadata only; the R&D source gate does not download or execute them).
- Upstream FASHN VTON code and main weights are marked Apache-2.0.
  Preserve upstream license/copyright and any notices when deriving/distributing.
- **Do not equate the main license with a complete clearance**. The
  `fashn-human-parser` dependency embeds an NVIDIA SegFormer-based model
  with restrictive license terms; its weights are never included here.
  DWPose/YOLOX code and **exact hosted weights** plus other third-party
  dependencies require independent artifact and license review before commercial use.

## Keep / drop

| Keep | Remove or replace |
|---|---|
| FASHN VTON v1.5 MMDiT generator and pixel-space sampler | FASHN Human Parser import/setup/inference |
| FASHN pose conditioning (DWPose) — only after independent weight review | Unused Human Parser mask/class/category maps |
| Image resize, crop/padding, tensor handling | Clothing-agnostic mask generation |
| Flat-lay garment RGB preprocessing | Model-worn garment parsing/masking path |
| Fixed category tags: tops, bottoms, one-pieces | Original standalone downloader, demo scripts, unrelated dev tooling |
| Upstream Apache-2.0 LICENSE and provenance | Browser/provider/API shortcuts around BERS Core |

**Reasoning from the actual upstream code:** when `segmentation_free=True`,
`create_clothing_agnostic_image(..., disable_masking=True)` returns the
person RGB image unchanged. When `garment_photo_type='flat-lay'`,
`create_garment_image(..., disable_masking=True)` returns garment RGB
unchanged. The official pipeline nonetheless calls the parser twice, which
is redundant in precisely this pair of modes. Eliminating these calls is
an isolated, inspectable source transformation, **not** a claim that
commercial-use rights are established or output quality is identical.

For `segmentation_free=False` or a **model-worn** garment source, these
rules do NOT apply. The generated research pipeline rejects those modes
*before* model inference; it must never silently fake semantic parser labels.

## Controlled offline source transformation

From a **clean checkout of the exact upstream commit**:

```bash
python3 scripts/build-fashn-vton15-slim-rnd.py \
  --upstream-dir /trusted/fashn-vton-1.5-checkout \
  --output-dir /tmp/bers-fashn15-slim-rnd

python3 scripts/verify-fashn-vton15-slim-rnd.py \
  --slice-dir /tmp/bers-fashn15-slim-rnd
```

The builder binds Git HEAD and the upstream origin, rejects dirty checkouts,
checks exact Git-blob identities of security-critical files, requires the
upstream license, fails on unrecognised layout or symlinks, and writes only to
a *new* directory. The output includes no `model.safetensors`, ONNX pose
weights, cached parser, `download_weights.py`, or runtime configuration.

CI checks out the exact upstream reference and independently proves: no parser
import/dependency; no model weights; valid Python syntax; early mode rejection;
and negative tests for tampered source. These are **static source-contract
proofs, not successful FASHN inference**.

## What is not solved

1. **GPU execution / sizing**: isolated NVIDIA GPU runtime with exact
   reproducible Python/CUDA/Torch/ORT toolchain and pinned verified weights,
   no implicit network downloads, no tenant data access. Measure cold/warm
   latency, peak VRAM, RAM, output shape, repeatability.
2. **Full commercial clearance**: independently inspect DWPose/YOLOX
   exact model-weights provenance and each upstream/dependency license;
   obtain approval from counsel. Omitting parser code does not override
   data/weights rights in other components.
3. **Model-worn garment images**: a separately licensed human parser, or
   a separately reviewed segmentation/garment-isolation pipeline, with
   category/label mapping and accuracy evidence. Do not claim a general
   Human Parser replacement from this restricted flat-lay slice.
4. **Quality**: compare actual person + flat-lay garment pairs across
   pose, size, skin tones, lighting, hands, hair, categories and printed
   logos; record exact input/output SHA and explicit owner evaluation.
5. **BERS integration**: Core owns authenticated Project + Garment input,
   explicit generation consent and budgeting, immutable artifact lineage,
   quarantined outputs, independent checks, Preview, explicit Accept and
   rollback. No legacy `fashnProvider.js` browser credential path.
6. **Release**: no model/provider/Billing/Fashion/RC authority changes.
   Keep existing deterministic Fashion R2 blocker and pending owner review.
   Never deploy the generated research slice to Railway Core/Frontend.

Until all of these are met, the only accepted claim is: **a narrow
parserless upstream source transformation has passed its static gate**.
