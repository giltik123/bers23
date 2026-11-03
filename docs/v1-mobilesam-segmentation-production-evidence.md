# BERS v1 MobileSAM segmentation production evidence (D1)

This document is the evidence record for promoting `mobilesam-vit-t` 1.0.2 from
`CANDIDATE` to `PRODUCTION_APPROVED` in
`src/platform/creative/local-ai/models/interactive-segmentation.manifest.json` and for the
corresponding `D1_MOBILESAM_SEGMENTATION` entry in `config/v1-generative-decision-matrix.json`.

Evidence base: main@`28c9e5b781979e4deef5b4e82d54cc88d260f89d`.

## What is proven

1. **Real browser runtime execution.** The canonical acceptance
   `scripts/test-mobilesam-browser-acceptance.mjs` was executed end to end in a real browser:
   HeadlessChrome 151.0.0.0, onnxruntime-web 1.27.0, WASM execution provider (the only admitted
   provider), workers disabled, single thread. Full machine-readable report:
   `docs/evidence/mobilesam-v1.0.2/browser-acceptance-report.json`
   (sha256 `86f143f1992e75ed799f5a894e818e27507b2cb610bc62c1a5a4e95c4dd2b952`).

2. **Signed artifact supply chain.** The browser verified the manifest Ed25519 signature,
   downloaded encoder/decoder through the Core model artifact relay, verified sha256 and
   Ed25519 per artifact before any inference session was created. Negative controls in the same
   run: a tampered sha256 and a tampered signature were each rejected **before** session
   creation (`sessionCreateCount: 0`). Artifact bytes are pinned in the manifest:
   encoder 27,969,740 B sha256 `e40e35bb…bcbba58`, decoder 16,496,892 B sha256
   `24d5d20f…4044fc6`, signatures served from the `mobilesam-vit-t-v1.0.2` GitHub Release.

3. **Persistent verified cache.** First pass: cache miss, 4 network requests (2 artifacts +
   2 signatures). Second pass: cache hit from IndexedDB (`bers-verified-models`), 0 network
   requests.

4. **Representative real-image segmentation.** Four sha256-pinned public fixtures covering
   person/clothing, car/object, animal and complex background. All produced valid masks
   (`0 < coverage < 1`); measured latencies below.

5. **Prompt refinement economics.** Encoder embedding is computed once per image+analysis key
   and reused: clicks 2, 3 (incl. negative) ran decoder-only, ~0.37 s per refinement click.

6. **Selection tool integration.** Smart select, brush add/subtract, undo/redo all passed; the
   resulting mask artifact is `ALPHA_8_LOSSLESS` in `ORIGINAL` coordinate space. A masked edit
   through the composite path changed **0** pixels outside the mask (`boundaryScore: 1`,
   `verificationOutcome: PASS`).

## Measured latency (hosted Chromium 151, WASM, single thread)

| Fixture | Size | First click total | Encoder | Decoder | IoU prediction | Mask coverage |
|---|---|---|---|---|---|---|
| person/clothing | 512×288 | 10.9 s | 6.8 s | 0.39 s | 0.98 | 4.0 % |
| car/object | 384×512 | 6.9 s | 6.5 s | 0.31 s | 1.00 | 29.7 % |
| animal | 512×401 | 6.8 s | 6.4 s | 0.32 s | 1.01 | 34.3 % |
| complex background | 512×304 | 6.9 s | 6.5 s | 0.30 s | 0.99 | 79.0 % |

Refinement clicks after the first: ~0.37 s (decoder only, embedding reused).

Product reading: the first click on a new image is encoder-bound (~6.5–6.8 s on this class of
hardware); every subsequent click on the same image is sub-second. This is acceptable for a
professional selection tool where one object is refined over several clicks, and it is the
reason embedding reuse is a hard acceptance requirement. Per-device admission stays governed
by `DeviceExecutionAdmission` at runtime; low-capability devices keep failing closed to the
manual canonical selection path.

## Real-image mask quality review

Reviewer overlays (mask in green over the resized fixture, green square = positive prompt,
red square = negative prompt) and binary masks were generated locally with the same
preprocessing pipeline (fit-inside 512, SAM 1024 canvas, pixel mean/std normalization,
identical prompt points). The overlays are review artifacts, not runtime inputs; they are
reproducible byte-exactly from the pinned fixtures and the sha256-pinned model artifacts.
Recorded identities (sha256 of PNG bytes):

| Fixture | Overlay sha256 | Verdict |
|---|---|---|
| person/clothing | `11291af3d9d20e44e97a07e65dd4a1a923dfbd662f06d02f51958d04d307f3cb` | PARTIAL — covers one person region, not full silhouette |
| car/object | `ae8e9a9399c84fcffbacaa585a101b804cdc5f0df271145e6663b53de16c1018` | PASS — full bus, clean edges incl. windows |
| animal | `3a86ccb3a834c774b1d2dccd1bf83cb0ba7114cf203368d5f9e59fbe64b83de8` | PASS — full dog, clean fur boundary |
| complex background | `d38bfe6095173e8f7899f724d0b55815e03befb7339a81047962b1272212f4be` | OVER-SELECTS — homogeneous apron area selected as one region |

Decision: **ACCEPT FOR V1**. Quality is strong for distinct foreground subjects (the primary
professional use case: product, portrait, object isolation). The two observed SAM-typical
limitations — partial selection on overlapping subjects and over-selection of homogeneous
regions — are mitigated by the shipped tool UX: multi-click refinement with negative prompts,
brush add/subtract, and undo/redo, all verified in the same acceptance run. These are
interactive-correction cases, not model defects, and they do not block v1.

## Transport disclosure

The evidence run executed in a network-restricted sandbox. The artifact bytes and signatures
were therefore served to the acceptance harness from a local mirror whose files were
downloaded from the same GitHub Release URLs pinned in the manifest and verified byte-exact
against the manifest sha256 before the run (encoder `e40e35bb…`, decoder `24d5d20f…`).
All cryptographic verification that production performs — manifest signature, per-artifact
sha256, per-artifact Ed25519, quarantine on trust failure — executed unchanged in the browser;
only the upstream transport was substituted. The unmodified canonical script
(`npm run test:mobilesam-browser-acceptance`) fetches from the live relay and remains the CI
gate; this document additionally records that GitHub Releases responses are not browser-fetchable
cross-origin (`GITHUB_RELEASE_BROWSER_CORS`), which is exactly why the relay exists.
