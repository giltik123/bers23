# Fashion F5b.1 D1.2 — pinned source/config/license assertion record

## Status

**CANDIDATE — acceptance requires both pre-merge exact-head evidence and post-merge live trust rebinding.**

D1.1 large-weight pointer trust and D1.2 exact small-config/tokenizer plus revision-bound license metadata trust are implemented. This document grants no conditioning/runtime/production authority.

## Authority boundary

- large Kandinsky safetensors remain external and are verified from bounded standard Git-LFS pointer SHA-256 + size; model tensor bytes are not downloaded by the trust verifier;
- decoder and offline-prior small executable config/tokenizer files are manifest-owned exact identities: pinned repository revision, ordered path, byte size and SHA-256;
- every config response is bounded to 5 MiB before/during streaming;
- license evidence is deliberately separate from executable config identity: each source binds exact repository revision + `README.md` + expected `apache-2.0`, reads at most 256 KiB and requires exactly one matching top-level model-card `license` field;
- the revision itself fixes the model-card tree content; the license check proves the semantic metadata needed by D1 without pretending the whole README is executable configuration or final legal approval;
- transient transport retry encloses the complete fetch + bounded body read, with a per-attempt deadline; deterministic trust failures such as bounds, pointer, size, SHA or license drift are not retried;
- the discovery inventory is evidence only; the manifest is the trust authority;
- offline prior remains build/research-only with `runtimeDependencyAllowed: false`;
- `conditioning.state` remains `UNPROVEN` and bundle/parity remain null;
- `productionExecutable=false`, `runtimeAuthorityGranted=false`;
- license product review remains pending even though exact upstream metadata is pinned;
- F5 `GARMENT_APPEARANCE_REFINEMENT` production admission remains `NOT_ADMITTED`.

## Hostile proof surface

D1.2 tests reject or constrain:

- floating/non-40-hex source revisions;
- duplicate or traversal-like config paths;
- invalid config size/SHA identities;
- declared over-limit config/license responses before body access;
- streaming responses at the first chunk crossing their hard ceilings;
- exact upstream config byte-size and SHA-256 drift;
- missing, duplicate, malformed, non-UTF-8 or changed model-card license metadata;
- deterministic trust-policy errors without retry amplification;
- transient mid-body transport failure with a complete bounded read retry.

## Acceptance lifecycle

D1.2 is intentionally two-stage because a squash merge creates a new commit SHA.

### Pre-merge candidate gate

The clean current-main PR must have:

1. exact PR-head `Fashion F5b.1 Kandinsky refinement source trust` success, including live upstream weights/config/license rebinding;
2. full exact-head regression matrix terminal green;
3. zero unresolved blocking review threads and unchanged head;
4. guarded squash merge into `main` using that reviewed head.

### Post-merge trust gate

The workflow is also triggered by relevant file changes pushed to `main`. The exact squash-merge SHA must independently complete the same live upstream source/config/license rebinding successfully.

A successful PR-head run is **not** sufficient evidence for the merged SHA. If the post-merge live trust run fails, D1.2 remains unaccepted and D2 must not start authoritative conditioning generation.

Only after both stages are green may D2 (#349) begin authoritative conditioning generation. D2 must additionally pin an exact executable Diffusers/Transformers/PyTorch generation toolchain; model/config/license trust alone is not sufficient for reproducible conditioning bytes.