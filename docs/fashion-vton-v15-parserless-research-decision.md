# Fashion F5 research decision — parserless FASHN VTON v1.5 local candidate

**Status: R&D ONLY / NO PRODUCTION, MODEL, BILLING OR ARTIFACT AUTHORITY.**

**Date:** 2026-10-09.

## Scope and exact upstream behavior

Official upstream: https://github.com/fashn-AI/fashn-vton-1.5

Relevant reviewed sources:

- `src/fashn_vton/pipeline.py`: `__init__` unconditionally creates `FashnHumanParser`; `__call__` unconditionally parses both images.
- `src/fashn_vton/preprocessing/agnostic.py`: `create_clothing_agnostic_image(..., disable_masking=True)` returns the original person unchanged; `create_garment_image(..., disable_masking=True)` returns the garment unchanged.
- Published default is `segmentation_free=True`. With `garment_photo_type="flat-lay"`, both segmentation results are **dead computation**, even though the upstream pipeline calculates them.

This is a source-level optimization hypothesis, **not** a claim that the converted model preserves quality. A pinned clean upstream run and parity tests remain necessary.

Do not infer that `segmentation_free=True` makes the existing upstream package independent of `fashn-human-parser`: import/setup and model loading still depend on it until a proper code fork removes those edges.

## Selected research option

**A: zero human parser for maskless person + flat-lay garment; approve existing managed garment masks first for model-worn input.** This is the minimal and strongest candidate for the default local BERS Fashion path because its upstream output masking transformations are no-ops, so no substitute pixel classification should be introduced unnecessarily.

For `garment_photo_type="model"` the upstream does consume **garment** segmentation to suppress other pixels. Prefer an exact Garment-owned mask/alpha/contour when securely admitted; if unavailable, a separately licensed semantic-parser candidate may create a proposed mask that Core validates and binds to exact source bytes. No unverified browser-provided mask grants authority.

`segmentation_free=False` is **not** admitted by this research route: that path needs person semantic labels including identity/limbs and cannot be reconstructed from a garment-only mask.

`scripts/fashion_vton_parser_policy.py` is a pure research routing decision; it **does not** invoke FASHN, run a parser, or grant admission.

## Alternatives reviewed

| Option | Benefit | Constraint | Decision |
| --- | --- | --- | --- |
| FASHN Human Parser (SegFormer-B4, 18 classes) | Exact upstream expected labels and preprocessing | Model card inherits NVIDIA SegFormer license; source license §3.3 restricts Work/derivatives to noncommercial research/evaluation | **Exclude from commercial BERS runtime pending a separate rights grant** |
| SCHP ATR-18, ONNX INT8 | Fashion categories, local CPU/GPU, approx. 66 MB quantized checkpoint; original SCHP code MIT and repackaged checkpoint is labeled MIT | Different labels (no separate hands/torso), origin/dataset and commercial checkpoint redistribution require verification; quality on BERS inputs unknown | **First semantic parser R&D candidate for model-worn garments only**, not approved for distribution yet |
| mattmdjaga SegFormer-B2 clothes | Existing 18 garment/body labels | Model card says license `other`; linked SegFormer base NVIDIA license concerns | Not selected for commercial route |
| Florence-2 + SAM 2 | Published Florence-2 weights MIT; SAM2 code/checkpoints Apache-2.0; flexible text-grounded masks | Multiple-model footprint, extra latency, no native 18-way fashion parsing output; prompt and mask calibration required | Optional comparison/quality fallback only |
| Manual/managed garment mask | Data already grounded in BERS garment identity; avoids extra inference | Needs explicit acquisition, trusted stored input identity and pixel-mask validation | **Preferred on model-worn input** |

Model cards are evidence of stated licenses, not proof of every constituent dataset and weight right. Before commercial inclusion, pin exact source revisions, licenses/NOTICE, binaries, artifacts and redistribution terms for each component.

Sources:
- https://github.com/NVlabs/SegFormer/blob/master/LICENSE
- https://github.com/fashn-AI/fashn-human-parser
- https://huggingface.co/pirocheto/schp-atr-18
- https://github.com/GoGoDuck912/Self-Correction-Human-Parsing
- https://huggingface.co/mattmdjaga/segformer_b2_clothes
- https://huggingface.co/microsoft/Florence-2-base-ft
- https://github.com/facebookresearch/sam2

## Integration laws

1. Do not revive `src/lib/tryon/fashnProvider.js` or generic `coreClient.functions.invoke`. The browser submits semantic intent only through explicit Core admission; server-owned Garment and Project artifacts own identity, ownership and hash/lineage.
2. Create a separate optional **Fashion Pack** with an isolated local execution runtime (initially pinned Python/CUDA). The published weights are approximately 2 GB including DWPose and therefore exceed normal compact-first BERS default target; classify as an optional local device tier unless measurements justify otherwise.
3. Build a proper Apache-2.0 downstream source fork: drop unconditional `FashnHumanParser` import/setup/use, replace parser constants import paths, and route only required masked-garment cases through a typed adapter. Do not vendor/copy NVIDIA-licensed parser code or weights into the commercial package.
4. Pin weights, code SHA, preprocessing decisions, DWPose/YOLOX ONNX provenance, hashes and package licenses; reject runtime network downloads. No support for unverified file paths, URLs, free-form browser model choices or fallback from LOCAL_ONLY to paid/cloud.
5. Keep generator `TryOnModel` and DWPose as baseline until controlled experiments show equivalent/better identity, geometry and logos. The public 576x864/H100 result is not a BERS device benchmark.
6. Every image-producing candidate must flow through the existing Execution/Artifact/Project authorities and Preview → explicit Accept. Research module never creates its own storage, balances, retries or delivery URLs.
7. Existing deterministic F4 Try-On remains independent and may not be silently swapped for FASHN. F5 research changes grant no `FASHION_REAL_IMAGE_QUALITY` release status.

## Acceptance before any provider/model promotion

- Pin exact source revision and verify upstream FASHN original against parserless fork for maskless + flat-lay with same seed/pose/image pre- and postprocessing (pixel-equality where exact math is retained; otherwise characterize each divergence).
- A/B garments photographed on a model: approved mask versus SCHP ATR-18 mask versus manual corrected mask; measure segmentation IoU/boundary F-score **on one common BERS-owned labeled fixture set**, not cross-dataset leaderboard mIoU.
- Human-reviewed real photos: tops, bottoms, dresses, sleeves/hands/occlusion, complex patterns, brand/logos, skin and face; record failure cases and provenance with lawful image fixtures.
- Runtime measurements on target GPU/CPU: latency p50/p95, peak RAM/VRAM, model download + installed bytes, no runtime network traffic; fail unsupported hardware explicitly.
- Security/integrity tests: bad/mismatched mask dimensions or source hash, cross-user garment, stale Project, malformed categories, missing weights/license metadata, local-only failure, cancellation/retry/duplicate execution.
- New production-capability branch/PR, relevant hosted acceptance on exact final head; no production promotion based on a research-only software test.

## Reproducible source-only prototype (implemented in this draft PR)

The builder is intentionally **build-time only**. It copies the published Apache-2.0 source to an isolated output directory after Git revision and exact blob verification, then removes parser-specific imports, masked-only preprocessing, and the dependency declaration. It also replaces the upstream checkpoint helper: the research package now accepts **only existing local regular .safetensors files**, with no HuggingFace network fallback or pickle-based `torch.load`.

```bash
# Build host: network is used here only to obtain public sources.
git clone https://github.com/fashn-AI/fashn-vton-1.5.git upstream-fashn
git -C upstream-fashn checkout --detach 7c0f10af3f91ad4048fe9729c470a13ef905d25a
python scripts/build_fashion_vton_parserless.py \
  --upstream upstream-fashn --output /tmp/bers-vton-parserless

# In a separate research Python environment, install the generated package:
python -m pip install -e /tmp/bers-vton-parserless
```

The generated package retains `fashn_vton.TryOnPipeline`; the **only admitted research mode** is `garment_photo_type="flat-lay", segmentation_free=True`. Unsupported clothing/semantic parsing paths raise an error before model inference. Required research weights remain external: `model.safetensors`, `dwpose/yolox_l.onnx`, `dwpose/dw-ll_ucoco_384.onnx`. Do not run the weight-downloading upstream script from production or treat a local file's existence as weight provenance approval.

Unit proof: `python -m unittest discover -s tests -p 'test_build_fashion_vton_parserless.py' -v`. A path-scoped GitHub Actions R&D workflow separately clones the exact upstream SHA and attempts to build/compile it with **no GPU**; its success is not an image-quality/performance acceptance.

The optional CPU-only weight preflight is `scripts/fashion_vton_weight_preflight.py`. Supply **reviewer-pinned** identities for the three paths in this JSON format (values below deliberately omitted; do not invent hashes):

```json
{
  "schema": "BERS_FASHION_RESEARCH_WEIGHTS_V1",
  "files": {
    "model.safetensors": {"bytes": 123, "sha256": "<actual 64-character lowercase SHA-256>"},
    "dwpose/yolox_l.onnx": {"bytes": 123, "sha256": "<actual 64-character lowercase SHA-256>"},
    "dwpose/dw-ll_ucoco_384.onnx": {"bytes": 123, "sha256": "<actual 64-character lowercase SHA-256>"}
  }
}
```

These byte lengths are illustrative and do not represent real checkpoints. Once a reviewed manifest exists, run `python scripts/fashion_vton_weight_preflight.py --weights-dir <local-folder> --manifest <reviewed-file.json>`. This checks local size, SHA-256 and symlink exclusions. **A self-authored manifest is not a trust root or commercial-license approval.** The research validator does not import the VTON model or download weights.

We intentionally do **not** claim that installing third-party dependencies is offline or that arbitrary Python dependency code has been audited for all network activity. A fully disconnected runtime needs a pre-audited, pinned Python wheel environment and content-hashed ONNX/safetensors weights; that is a separate acceptance gate.

## Bounded GPU research smoke (implemented; execution not yet measured)

Once a **reviewer-pinned** weights manifest, compatible GPU host and isolated research package exist, the optional GPU smoke runner records actual output hashes, per-run wall latency and peak CUDA allocated bytes:

```bash
# Install the generated source fork in a disposable pinned Python environment first.
# Load model weights from a pre-reviewed local folder; no cloud API is invoked.
python scripts/fashion_vton_gpu_smoke.py \
  --person /private/research/person.png \
  --garment /private/research/flat-lay-shirt.png \
  --weights-dir /private/models/fashn-v15 \
  --weights-manifest /private/models/approved-research-weights.json \
  --category tops \
  --runs 3 \
  --output /private/research/tryon-run-01
```

The local output folder contains PNGs and `run-report.json`, including raw input and output SHA-256 identities, GPU name, p50/p95 wall time and allocated CUDA memory. The runner refuses missing/malformed inputs, reused output directories and missing local weight attestations. It forces `flat-lay`, `segmentation_free=True`, `num_timesteps=30`, one output, and a fixed default seed. **It has not run on a GPU in this PR.** No comparable FASHN upstream GPU baseline, quality decision, temperature/energy measurement, model distribution approval, Core ticket, FINAL or production authority is established.

The environment variables `HF_HUB_OFFLINE` and `TRANSFORMERS_OFFLINE` are only defense in depth; a network-isolated container and pinned dependency wheel hashes are still required for hard offline assurance. Review the local photos' use rights; the smoke runner does not upload them.

## Next development slices

1. Parserless source fork in isolated Fashion Pack; pin Apache-2.0 notices and dependencies.
2. Local GPU A/B proof for flat-lay without parser (reference versus fork).
3. Canonical server-owned garment mask binding and optional SCHP ATR-18 **research** adapter after separate rights check.
4. Implement explicit local Runtime capability registration and ticket/FINAL lineage only once quality/security gates pass.

Do not close #230 or change release readiness while these conditions remain open.
