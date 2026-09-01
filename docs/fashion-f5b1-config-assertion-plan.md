# F5b.1 D1.2 exact config assertion gate

Promotion from config **inventory evidence** to config **trust identity** is a separate step.

D1.2 may begin only after the F5b.1 source-weight trust head is green.

## Exact identities to promote

Use only the decoder/prior paths, byte sizes and SHA-256 values recorded in `docs/fashion-f5b1-config-inventory.md`, all at the already pinned 40-hex upstream revisions.

## Required D1.2 behavior

- move decoder/offline-prior `requiredConfigIdentity` from `UNPINNED` to a closed manifest-owned exact file list;
- download only those named small config/tokenizer files, with a strict per-file 5 MiB ceiling;
- SHA-256 each downloaded byte sequence and compare exact size/hash to the manifest;
- reject missing, extra, reordered/duplicate manifest paths and any revision mismatch;
- keep offline prior `runtimeDependencyAllowed: false`;
- keep conditioning `UNPROVEN`, bundle `null`, decoder-only parity `null`;
- keep `productionExecutable: false`, `runtimeAuthorityGranted: false`, F5 deterministic identity `NOT_ADMITTED`;
- do not download or inspect model tensors in this step;
- do not infer runtime shapes or conditioning semantics from config names alone.

Only after D1.2 exact config assertions pass may a later D2 conditioning-reproduction slice use the pinned config+weight trust root.
