# Fashion VTON parser routing — inert extraction

**Status: R&D only; no release/model/provider/Billing/Project/Artifact/Core execution authority.**

This small research-only change extracts the pure Python decision function from Draft #983. Its only input is an untrusted *proposal* about how a hypothetical future local FASHN VTON v1.5 adapter might use garment masks; it never validates mask lineage, downloads model weights or performs inference.

- For `segmentation_free=True` and `garment_photo_type="flat-lay"`, the decision is to omit parsing. This is a source-level optimization hypothesis, not equivalence or photorealistic quality proof.
- For model-worn garment photos, the plan requires independently approved garment-mask evidence or separately admitted parser evidence, preferring the former. Boolean flags **are not proof of approval**: only future authenticated Core server decisions could supply them.
- Unsupported category, photo types, non-boolean policy claims and person masked mode fail closed.

The two files under `scripts/` and `tests/` are copied unchanged from research Draft #983 at `d93b9dc169684b3b473fb5bf5a3b0b0f8a966458`. Their offline tests run at the exact PR SHA. The new workflow has no external model/network fetch and cannot activate Fashion, parser inference, credit spending or production endpoints.

**Unmet separate gates:** rights to actual model/parser weights and redistribution, signed checkpoints, CPU/GPU latency and memory, real-portrait/cross-arm/hair/print quality evaluation, independent matte/tenant/source-identity admission, and Fashion release epic #230. Do not merge the entire Draft #983 merely because this inert routing helper is sound.
