# BERS v1 Stage D generative decision matrix

Evidence base: `13e85cfb6b3bb9ab2ba2c9f4d10a3e278eb9b59a`.

This file records the **v1 product decisions** required by Stage D/D7. It does not close the underlying research/evidence issues and it grants no model, provider, Billing, Project, Artifact, or cloud-fallback authority.

The release rule is deliberately conservative: when the current repository has accepted software/reproducibility evidence but lacks the production-grade device, real-image quality, signed release artifact, latency/memory, or product-license evidence required by that model's own gate, BERS v1 rejects that model from the default product path or keeps the existing deterministic/manual fallback.

| Track | Candidate | v1 decision | Release posture |
| --- | --- | --- | --- |
| D1 MobileSAM | `mobilesam-vit-t@1.0.2` | explicit rejection from v1 default | Manual canonical Selection remains the product path; #136 remains open for real-device/real-image promotion evidence. |
| D2 MODNet | `modnet-photographic-portrait-matting@1.0.0-candidate.2` | explicit rejection from v1 default | Canonical mask/manual paths remain available; signed release + device/quality evidence is still required. |
| D3 Real-ESRGAN | `realesr-general-x4v3@1.0.0-candidate.1` | explicit rejection from v1 default | Deterministic Resize is not represented as equivalent super-resolution; model upscale remains unavailable by default until its release gate passes. |
| D4 Big-LaMa | `lama-big-places-inpainting@1.0.0-candidate.1` | deterministic fallback | Hosted CPU/WASM feasibility does not substitute for real-device/quality promotion. Deterministic masked editing and Fashion F4 remain the v1 fallback. |
| D5 Tiny-SD | `segmind-tiny-sd@1.0.0-candidate.1` | explicit rejection from v1 default | Composition feasibility is retained as R&D; no ~GB local text-to-image default is enabled without accelerated real-device + human quality evidence. |
| D6 Kandinsky | `kandinsky-2-2-decoder-inpaint-refinement@0.1.0-feasibility.3` | deterministic fallback | Conditioning/runtime/material quality gain remain unproven; deterministic Fashion F4 stays authoritative. |

The machine-readable source of truth is `config/v1-generative-decision-matrix.json`. Hosted acceptance verifies that every matrix identity/status matches its manifest and that none of these candidates appears in production model or v2 MODEL executor authority.

Research can continue after this v1 decision. A later promotion must update the relevant manifest/evidence, change this matrix in a dedicated reviewed change, and pass exact-head release acceptance.
