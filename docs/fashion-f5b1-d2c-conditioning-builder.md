# Fashion F5b.1 D2c — authoritative offline conditioning builder

Status: **STAGING / NO CONDITIONING AUTHORITY**.

This stage defines how accepted D2b prompt semantics are converted into reproducible Kandinsky 2.2 prior embeddings. It does not contain the 10.57 GB prior, generated conditioning tensors, a tested container lock, decoder parity evidence, runtime admission, or product wiring.

## Selected architecture

The authoritative build is deliberately offline and expensive:

1. Materialize a **sealed prior mirror** containing exactly the D1 allowlist: all `offlinePrior.safeWeights` plus all `offlinePrior.requiredConfigIdentity.files`. No symlink and no extra file is accepted.
2. Run inside a container pinned by immutable image digest with networking disabled at the container boundary.
3. The public builder entrypoint re-checks exact file-set closure before invoking the internal implementation.
4. The implementation streams SHA-256 over every required prior weight/config before model import/use.
5. It enforces exact Python/package/platform identities from a `TESTED_EXACT` toolchain lock.
6. It verifies the installed historical `KandinskyV22PriorPipeline` source by Git-blob SHA `3b9974a5dd70e8b775caa01efab6b637ff22d9e5` and Diffusers version `0.18.0.dev0`.
7. Execution is CPU FP32, one intra-op thread, one inter-op thread, deterministic algorithms enabled, fixed CPU generator seed, no external latents.
8. The builder consumes one accepted D2b prompt contract and requires its expected SHA-256 on the command line before generation.
9. A/B output only `image_embeds` and `negative_image_embeds` in safetensors plus canonical builder evidence.
10. Candidate C is different by contract: its prior run is a raw measurement only. The public entrypoint requires an accepted B conditioning manifest and its exact B bundle. A stdlib-only composer copies the B `image_embeds` safetensors data slice byte-for-byte and combines it with only the raw C `negative_image_embeds` data slice. The raw C positive embedding is hashed into evidence as explicitly discarded and never enters the authoritative C bundle.
11. A Node finalizer re-binds builder evidence to the D1 trust root and accepted D2b registry/contract. For C it also re-validates the canonical B D2a manifest, recalculates the B bundle size/SHA and matches that identity against the composition evidence before invoking the accepted D2a closed-schema validator.

## Why C reuses B positive conditioning

Historical explicit-negative prior execution changes the prior batch shape and therefore may also change the positive output even when the positive prompt text is identical. Treating a fully independent C prior result as a B→C negative-conditioning experiment would confound two variables.

Accepted D2b therefore fixes `C_PRESERVATION_EXPLICIT_NEGATIVE.positiveEmbeddingSourceCandidateId = B_REALISM_ZERO_NEGATIVE`. D2c enforces that policy physically, not just in metadata:

- B `image_embeds` bytes are the sole positive source for final C;
- C prior execution contributes only `negative_image_embeds`;
- final C evidence records B manifest SHA, B bundle SHA/size, B positive tensor SHA, raw C bundle SHA, discarded raw-C-positive SHA and used C-negative SHA;
- C finalization fails if the B manifest/bundle are absent, altered or not the accepted B candidate identity.

This makes A→B a positive-conditioning experiment and B→C a true negative-conditioning experiment.

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

The builder refuses to run if any observed identity differs. The container launcher must also bind `BERS_CONTAINER_IMAGE_DIGEST` to the digest of the image it actually launched; this environment field is evidence binding, not a substitute for the external container-runtime digest check.

Historical Diffusers revision `746215670a61af1034c470d0b6555be9c60cb7b6` declares `transformers>=4.25.1`, `torch>=1.4` and `safetensors` rather than a single tested environment. Therefore D2c must not invent an authoritative package set before a real sealed-prior run.

## Required reproduction evidence

One successful generation is not sufficient. Promotion from `UNPROVEN` conditioning requires at least:

- two clean builds from the same tested container digest and sealed prior mirror;
- byte-identical safetensors bundle SHA-256 for the same candidate/seed;
- byte-identical canonical manifest SHA-256;
- exact tensor dtype/shape and finite-value checks;
- for C, byte-identical final `image_embeds` tensor data to the accepted B source on every run;
- decoder-only parity against the historical full pipeline using the same conditioning tensors;
- real-image review before any quality conclusion.

If independent host reproduction is available, prefer it over two runs on one host. Host-specific metadata must never enter immutable bundle identity.

## Candidate sequence

Build A and B as independent accepted D2b candidates first. C may be built only after the exact B manifest+bundle pair is available and verified. Do not choose a winner during generation. A→B isolates positive prompt semantics; B→C isolates explicit-negative conditioning while holding B positive conditioning byte-identical.

## Non-authority invariants

- Prior remains offline build/research only.
- Runtime positive prompt, runtime negative prompt and runtime prior stay forbidden.
- D1 manifest stays CANDIDATE until separate evidence/promotion work.
- `GARMENT_APPEARANCE_REFINEMENT` remains NOT_ADMITTED.
- No provider/Billing/cloud/FASHN authority is introduced.
- `TRYON_EXECUTION_NOT_WIRED` remains required.
