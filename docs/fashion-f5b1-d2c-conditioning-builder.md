# Fashion F5b.1 D2c — authoritative offline conditioning builder

Status: **STAGING / NO CONDITIONING AUTHORITY**.

This stage defines how accepted D2b prompt semantics are converted into reproducible Kandinsky 2.2 prior embeddings. It does not contain the 10.57 GB prior, generated conditioning tensors, a tested container lock, decoder parity evidence, runtime admission, or product wiring.

## Selected architecture

The authoritative build is deliberately offline and expensive:

1. Materialize a **sealed prior mirror** containing exactly the D1 allowlist: every `offlinePrior.safeWeights` file plus every `offlinePrior.requiredConfigIdentity.files` file. No symlink and no extra file is accepted.
2. Run inside a container pinned by immutable image digest with networking disabled at the container boundary.
3. The public builder entrypoint re-checks exact file-set closure before invoking the internal implementation.
4. The implementation streams SHA-256 over every required prior weight/config before model load.
5. It enforces exact Python/package/platform identities from a `TESTED_EXACT` toolchain lock.
6. It verifies the installed historical `KandinskyV22PriorPipeline` source by Git-blob SHA `3b9974a5dd70e8b775caa01efab6b637ff22d9e5` and Diffusers version `0.18.0.dev0`.
7. Execution is CPU FP32, one intra-op thread, one inter-op thread, deterministic algorithms enabled, fixed CPU generator seed, no external latents.
8. The builder consumes one accepted D2b prompt contract and verifies both the caller-provided expected SHA and the hard-bound accepted A/B/C contract SHA.
9. Output is only `image_embeds` and `negative_image_embeds` in safetensors plus canonical builder evidence.
10. A Node finalizer re-binds builder evidence to the D1 trust root and accepted D2a/D2b contracts, re-parses the actual safetensors bytes, and only then emits the canonical research manifest.

## B → C experimental isolation

D2b defines `C_PRESERVATION_EXPLICIT_NEGATIVE` as an experiment that changes only negative conditioning relative to `B_REALISM_ZERO_NEGATIVE`.

Therefore C **must not regenerate or independently accept a new positive embedding**. The C builder requires both the canonical B research manifest and the exact B conditioning bundle. It loads B `image_embeds` and writes those bytes into the C bundle. The C prior run is used only for the explicit-negative `negative_image_embeds`; its generated positive embedding is not admitted into the C bundle.

The finalizer independently proves this rule:

- the B manifest must pass the accepted D2a canonical validator;
- its candidate identity must be `B_REALISM_ZERO_NEGATIVE` with the accepted D2b contract SHA;
- B and target C must use the same tested toolchain identity and the same deterministic tuple/seed;
- the supplied B bundle size/SHA must equal the canonical B manifest;
- both B and C safetensors envelopes are parsed and their tensor byte ranges validated;
- C `image_embeds` raw bytes must be byte-identical to B `image_embeds`;
- builder evidence must bind the exact B manifest SHA, B bundle SHA/size, and reused image-tensor SHA.

A/B forbid positive-source arguments entirely. This keeps A→B as the positive-conditioning experiment and B→C as the negative-conditioning experiment.

## Why the prior directory must be an exact mirror

Hashing only known files is insufficient if `from_pretrained()` can see additional tokenizer/config/weight files. A loader could prefer a file that was never included in D1 trust. The public D2c entrypoint therefore requires the recursive set of regular files to equal the D1 allowlist exactly. This also excludes accidental pickle `.bin` weights without relying on filename preference.

## Toolchain lock

No toolchain lock is committed by this staging step because an unexecuted lock would be false evidence. The first real D2c run must establish and record a `TESTED_EXACT` lock containing:

- container image digest;
- Python version;
- Diffusers version;
- PyTorch version;
- Transformers version;
- NumPy version;
- safetensors version;
- platform machine identity.

The builder refuses to run if any observed identity differs. `BERS_CONTAINER_IMAGE_DIGEST` must be bound to the digest of the image actually launched; this environment value is an in-process evidence check, not a substitute for the container runtime's external digest verification.

Historical Diffusers revision `746215670a61af1034c470d0b6555be9c60cb7b6` declares compatible dependency ranges rather than one authoritative package tuple. D2c therefore must not invent an admitted package set before a real sealed-prior execution.

## Required reproduction evidence

One successful generation is insufficient. Promotion from `UNPROVEN` conditioning requires at least:

- two clean builds from the same tested container digest and sealed prior mirror;
- byte-identical safetensors bundle SHA-256 for the same candidate/seed/source bundle;
- byte-identical canonical manifest SHA-256;
- exact tensor dtype/shape and finite-value checks;
- for C, identical recorded B source manifest/bundle/tensor identities on both builds;
- decoder-only parity against the historical full pipeline using the same conditioning tensors;
- real-image review before any quality conclusion.

If independent host reproduction is available, prefer it over two runs on one host. Host-specific metadata must never enter immutable bundle identity.

## Candidate sequence

Build in dependency order:

1. **A** — generate its own positive embedding and historical zero-image negative embedding.
2. **B** — generate its own realism positive embedding and historical zero-image negative embedding.
3. **C** — require accepted B manifest+bundle from the same tested toolchain and deterministic seed, reuse B `image_embeds` byte-for-byte, and generate only the explicit-negative prior embedding used as C `negative_image_embeds`.

Do not choose a winner during generation. A→B isolates neutral versus realism positive conditioning. B→C isolates explicit-negative conditioning while holding the positive tensor fixed.

## Non-authority invariants

- Prior remains offline build/research only.
- Runtime positive prompt, runtime negative prompt and runtime prior stay forbidden.
- D1 manifest stays CANDIDATE until separate evidence/promotion work.
- `GARMENT_APPEARANCE_REFINEMENT` remains NOT_ADMITTED.
- No provider/Billing/cloud/FASHN authority is introduced.
- `TRYON_EXECUTION_NOT_WIRED` remains required.
