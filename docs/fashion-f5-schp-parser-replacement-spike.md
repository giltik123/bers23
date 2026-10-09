# BERS F5: FASHN v1.5 parser replacement spike (2026-10-09)

**Status: R&D_ONLY. No production registration, model admission, browser execution,
Project/Artifact/Billing authority, release-readiness change or Fashion #230 closure.**

## Source audit

- Upstream `fashn-AI/fashn-vton-1.5` advertises Apache-2.0 for the core and ~2 GB
  of model/DWPose weights; its default pipeline imports and initializes
  `fashn_human_parser` even when `segmentation_free=True`.
- `segmentation_free=True` bypasses **person image masking**, not garment
  image masking. Flat-lay garment photos also bypass garment masking.
- Model-worn garments require a category-aware region; `fashn_human_parser`
  is a SegFormer-B4 checkpoint with separate NVIDIA SegFormer non-commercial
  license obligations. Do not import or download it into an admitted BERS worker.
- Preserve the upstream MMDiT weights, DWPose (separately audited), resize/pad,
  category conditioning and `create_garment_image` behavior as the baseline;
  do not rewrite the diffusion model to change a single preprocessing dependency.

References:
- https://github.com/fashn-AI/fashn-vton-1.5
- https://github.com/fashn-AI/fashn-vton-1.5/blob/main/src/fashn_vton/pipeline.py
- https://github.com/fashn-AI/fashn-vton-1.5/blob/main/src/fashn_vton/preprocessing/agnostic.py
- https://github.com/fashn-AI/fashn-human-parser
- https://github.com/NVlabs/SegFormer/blob/master/LICENSE

## Alternatives (no cross-dataset performance rankings)

| Candidate | Semantic classes / task | Code/checkpoint legal signals | Decision |
| --- | --- | --- | --- |
| FASHN Human Parser | 18 custom fashion classes, best schema fit | NVIDIA SegFormer: non-commercial restriction without separately licensed rights | exclude commercial candidate |
| SCHP-ATR | 18 ATR fashion classes; ResNet-101; ONNX INT8 available | upstream MIT code, third-party model card advertises MIT; audit exact checkpoint and ATR data provenance | **initial model-worn garment candidate only** |
| SCHP-LIP | 20 classes, coats/jumpsuits coverage | upstream MIT code; checkpoint/data audit still required | A/B challenger |
| SAM 2.1 | prompt-guided class-agnostic masks | Apache-2.0 code and weights | optional contour repair, not a semantic parser replacement |
| PP-LiteSeg / PaddleSeg | semantic segmentation architecture | Apache-2.0 code; no validated BERS fashion checkpoint | future trained BERS-owned parser |

SCHP-ATR vendor ATR mIoU (82.29%) and CPU INT8 timing (~229 ms on a
specified 16-core machine) **are not comparable measurements to FASHN on BERS
inputs**, and do not establish winner status.

Sources:
- https://github.com/GoGoDuck912/Self-Correction-Human-Parsing
- https://huggingface.co/pirocheto/schp-atr-18
- https://github.com/facebookresearch/sam2
- https://github.com/PaddlePaddle/PaddleSeg

## Narrow replacement scope

This spike adds `experiments/fashion_vton/schp_atr_adapter.py`. It is an
offline ONNX input adapter; it does **not** call BERS Core or own artifacts.

1. **Person**: pass through unchanged in `segmentation_free=True` mode.
   Explicitly reject masked-person mode. ATR has no distinct hands, torso or
   jewelry classes. Mapping its arm pixels to FASHN hands would corrupt identity
   preservation and must not be attempted.
2. **Flat-lay garment**: bypass parser, preserving input RGB, matching upstream.
3. **Model-worn garment**: run local SCHP-ATR (input 512×512, RGB with
   [0.406,0.456,0.485] means and [0.225,0.224,0.229] stds, output 18 logits),
   nearest-neighbor resize semantic IDs, select relevant garment classes, mask
   non-selected pixels to RGB(127,127,127). No garment pixels -> fail closed.
4. **Labels**: tops = upper-clothes/dress/scarf; bottoms = skirt/pants/belt;
   one-pieces = union. This is a **garment-only** equivalence, not a fake
   lossless 18-to-18 FASHN label mapping.
5. **Offline trust**: a local checkpoint requires exact expected SHA-256;
   ONNX Runtime uses CPU by default. No Hugging Face online fetch or
   `trust_remote_code` execution. Distribution and checksum approval are
   outside this experiment.

## How to exercise this isolated experiment

```bash
python -m pip install numpy Pillow onnxruntime
python -m unittest discover -s experiments/fashion_vton -p 'test_*.py' -v
```

Acquire the approved **INT8 static** `onnx/schp-atr-18-int8-static.onnx`
outside the production runtime only after reviewing its origin/license.
Record revision, byte size, SHA-256 and accepted license in a separate
model-pack manifest. For an offline local test:

```python
from PIL import Image
from experiments.fashion_vton.schp_atr_adapter import (
    SchpAtrOnnxParser, prepare_garment_image, prepare_person_image
)
parser = SchpAtrOnnxParser("/absolute/path/schp-atr-18-int8-static.onnx",
                          "<approved 64-digit sha256>")
person = prepare_person_image(Image.open("person.jpg"))
garment = prepare_garment_image(Image.open("garment.jpg"), "tops", "model",
                                parser=parser)
```

Do **not** load/checkpoint or set a license gate to approved simply because this
illustrative code exists. Benchmark real masks and paired try-on images first.

## Promotion gates before any FASHN fork or production integration

- Audit exact FASHN checkpoint, SCHP code/weights/ATR training-data rights,
  DWPose/YOLOX and transitive dependencies. Archive pinned license and hashes.
- Build a separate Python worker behind existing canonical **local runtime
  admission**, not a browser provider, generic command route or new project
  authority. Preserve LOCAL_ONLY fail-closed behavior.
- Compare original FASHN (reference environment, permitted use) vs maskless
  + SCHP-ATR vs SCHP-LIP on identical source/garment/category/seed/steps.
  Include flat-lays, model-worn, sleeves, hair/hands, dresses, logos, prints,
  front/side poses and missing garments; report per-class IoU on annotated
  licensed masks, garment/identity preservation, human review, p50/p95 latency,
  CPU/GPU VRAM and error rates. Do not infer rank from ATR mIoU alone.
- Keep BERS F4 deterministic Try-On unchanged. Every generative output must
  become a canonical candidate FINAL with lineage; Project mutation still
  requires Preview -> Accept. No retry/client direct provider, paid call or
  cloud fallback during LOCAL_ONLY.
- Promotion needs explicit model-admission policy, real-image acceptance,
  hosted CI on exact PR head and a separately reviewed release decision.
  `FASHION_REAL_IMAGE_QUALITY` remains **open**.
