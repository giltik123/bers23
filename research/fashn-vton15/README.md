# BERS Fashion AI — local FASHN VTON 1.5 human parser replacement

**Status: R&D candidate only. No commercial/production approval, no inference
weights installed, no real-photograph quality comparison completed.**

## Comparison and choice

| Candidate | Classes | Advantage | Key limitation |
|---|---:|---|---|
| FASHN Human Parser (SegFormer-B4) | 18 | Native FASHN v1.5 semantics | NVIDIA SegFormer license restricts ordinary commercial use |
| **SCHP-ATR-18** (chosen for initial fork) | **18** | Fashion clothing and body parts; published ONNX FP32 / ~66 MB INT8, repository/model card claims MIT | ATR labels are different; no separate hands/torso/jewelry; pretrained-weight training data/reuse rights still need review |
| SCHP-LIP-20 | 20 | More outfit garment categories, including coats/gloves | Different taxonomy; reported mIoU applies to a different dataset and is **not** an apples-to-apples quality comparison |
| MediaPipe Selfie Multiclass | 6 | Small, fast coarse hair, skin, clothing masks | No individually identified arms, lower/upper clothing, dresses, pants; not a drop-in replacement |

**Decision:** SCHP ATR is the best **structural/prototyping candidate**, not proven
the best image-quality model. Its reported ATR 82.29% mIoU is *not*
comparable to a FASHN score without a shared evaluation set. The SCHP
ONNX model and source publicly declare MIT, but the rights to the original
ATR training photos and derivative checkpoint require independent product
review; an unofficial Hugging Face dataset mirror's license card is not
a substitute for rights from the originating dataset provider.

Sources:

- FASHN VTON v1.5 pinned git SHA: `7c0f10af3f91ad4048fe9729c470a13ef905d25a`; LICENSE Apache-2.0, `pyproject.toml` depends on `fashn-human-parser>=0.1.1`.
- FASHN Human Parser upstream `fashn-AI/fashn-human-parser`: SegFormer-derived, inherited NVIDIA license, 18-class map.
- SCHP ATR Hugging Face: `pirocheto/schp-atr-18`, pinned model snapshot `1ddc548f48cc1435a505e565ff5f56dcfe6017e3`; MIT declared. `onnx/schp-atr-18-int8-static.onnx` must be externally obtained and **its exact SHA-256 independently verified** before inference.
- MediaPipe Image Segmenter: https://developers.google.com/edge/mediapipe/solutions/vision/image_segmenter

## What the patch actually changes

FASHN v1.5's `segmentation_free=True` **still calls** its
SegFormer human parser on both person and garment. This R&D fork patch:

1. Replaces the `FashnHumanParser` import and constructor in
   `src/fashn_vton/pipeline.py` with `BersSchpAtrParser`.
2. Redirects FASHN clothing-agnostic label imports in
   `src/fashn_vton/preprocessing/agnostic.py` to the BERS adapter.
3. Removes the restricted `fashn-human-parser` Python dependency from
   the *fork*, removes its auto-download from the weight downloader,
   and deletes the legacy debug script that directly imports it.
4. Loads the **locally provisioned** SCHP-ATR ONNX model with ORT after
   checking a mandatory 64-char operator-pinned SHA-256; no model Hub
   calls, `trust_remote_code`, unsupported fallback, or runtime prompt.
5. Maps the 18-class ATR output into the 18-value FASHN input domain,
   with deliberately documented lossy mappings:
   shoes -> feet, both arms -> arms, both legs -> legs.
   No fake dedicated hand, torso or jewelry labels are produced.

This is *not* guaranteed FASHN quality parity. Hair/front-of-body
occlusion, sleeve ends and hands still require visual acceptance.

## Isolated, reproducible research setup (never on BERS production)

Run the offline tests first; only Python stdlib is needed:

```sh
python -m unittest discover -s research/fashn-vton15 -p 'test_schp_replacement.py' -v
```

For a standalone research clone (requires a manually approved GPU machine
and reviewed source/model licensing; never from within production Core):

```sh
git clone https://github.com/fashn-AI/fashn-vton-1.5.git /tmp/fashn-vton-1.5-rnd
git -C /tmp/fashn-vton-1.5-rnd checkout 7c0f10af3f91ad4048fe9729c470a13ef905d25a
python research/fashn-vton15/patch_upstream.py --upstream /tmp/fashn-vton-1.5-rnd
```

After review, the operator must manually provision the exact model snapshot
`onnx/schp-atr-18-int8-static.onnx` to
`<weights-dir>/schp/schp-atr-18-int8-static.onnx`, record the **real observed**
SHA-256 of its bytes, and export:

```sh
export BERS_SCHP_ATR_ONNX_SHA256='<independently verified 64-hex SHA-256>'
```

The placeholder above is **not** a functional hash. Neither weight file
nor hash is bundled. The patched package needs independently approved
and pinned Python/CUDA/ONNX dependencies, FASHN VTON and DWPose
checkpoints; the primary FASHN inference has **not** been run in this PR.

## Production admission is blocked until all gates pass

- Legal review of SCHP checkpoint provenance, ATR dataset permissions,
  DWPose and remaining VTON dependencies. Model-card MIT is not a blanket
  rights guarantee.
- Pinned individual model SHA-256 and tested native dependencies/ORT
  providers. Reproducible, network-isolated local setup.
- Real-image quality and latency / VRAM measurements on a common person +
  garment test set: FASHN reference versus SCHP fork, including arms,
  hands, hair, three-quarter poses, logos/text and garment preservation.
- Fix or quantify semantic gaps in hands, torso, jewelry; do not claim 1:1
  FASHN parser compatibility.
- Independent Core-owned canonical input/output/project authority, privacy
  consent, controlled GPU worker, deterministic artifact lineage, and
  explicit owner quality review.

The currently running BERS Fashion F4 production surface, release readiness
matrix, `FASHION_REAL_IMAGE_QUALITY` / #230 and Draft PR #980 remain
unchanged. This candidate grants no MODEL/provider/cloud/FINAL/Billing access.
