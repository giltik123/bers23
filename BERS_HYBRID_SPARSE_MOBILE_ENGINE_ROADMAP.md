# BERS Hybrid Sparse Mobile Engine Roadmap

**Status: CANONICAL R&D ARCHITECTURE / NO PRODUCTION AUTHORITY**

This document is the detailed companion to Stage E of `BERS_V1_DEVELOPMENT_ROADMAP.md` and issue #352. It records the selected long-term architecture for the BERS-owned local-first image AI engine.

It does **not** promote any current R&D model or expert path into production, does not replace Tiny-SD/Kandinsky/LaMa acceptance programs, and does not weaken Core, Artifact, Project, Billing, provider, lineage, or local-only authority boundaries.

## 1. Canonical architecture decision

The selected direction is the combination of two complementary systems:

1. **BERS Hybrid Sparse Mobile Engine (HSME)** — top-level execution architecture: what runs on-device, what model packs are required, when cloud is allowed, and how local/hybrid/cloud execution is selected.
2. **BERS Hierarchical Adapter-MoE + FreeToken-inspired Adaptive Runtime** — internal model/runtime architecture: expert composition, routing, residency, prefetch, memory hierarchy, heterogeneous CPU/GPU/NPU execution, and sparse scheduling.

Together they form the target **BERS Local-First AI Engine**.

```text
Large teacher models / BERS training fleet
        |
        v
multi-teacher distillation
        |
        v
BERS dense shared mobile core
        |
        +-- compact expert/adapters
        |     Fashion / Identity / Pose / Material / Detail / ...
        |
        v
hierarchical routing
Task -> Pack -> Timestep -> Spatial -> Sparse Expert
        |
        v
FreeToken-inspired adaptive runtime
NPU/GPU <-> RAM <-> Flash <- verified Model CDN
        |
        v
FULL LOCAL by default
        |
        +-- semantic HYBRID when explicitly admitted
        +-- CLOUD fallback / Ultra only when required
```

## 2. Product goals

The architecture exists to optimize measurable product outcomes, not parameter-count aesthetics.

Primary goals:

- high-quality local generation/editing on supported mobile hardware;
- first useful AI footprint near 1 GB rather than 15–20 GB;
- typical installed AI footprint around 1–1.5 GB and normal cache budget around 2 GB;
- no repeat model download during normal repeated generation;
- majority of eligible inference performed on the user's GPU/NPU;
- minimal server GPU cost for local-capable workloads;
- graceful device-tier fallback rather than universal lowest-common-denominator execution;
- strict offline-capable local execution after required packs are present;
- model/expert additions without forcing every user to download the complete fleet;
- deterministic, inspectable routing/evidence sufficient for debugging and release qualification.

All numeric values in this document are R&D targets until verified on real devices.

## 3. Teacher / student law

Large models such as Kandinsky-class models, specialized VTO teachers, face/identity teachers, restoration teachers, and future BERS foundation models are primarily **training teachers**, not mobile runtime payloads.

The mobile path is trained through multi-level distillation including, where justified:

- semantic/text representation matching;
- intermediate feature matching;
- attention/relationship matching;
- latent/noise/flow target matching;
- final-image/perceptual targets;
- preference/quality training;
- few-step consistency/distillation.

BERS must not promise that a sub-2 GB student preserves every universal capability of a much larger teacher. The target is to preserve or exceed teacher usefulness on BERS product domains, especially people, fashion, garments, identity preservation, localized editing, backgrounds, restoration, and controlled generation.

## 4. Shared dense mobile core

The baseline architecture retains a compact **dense shared generative core**. It is not a fully sparse model.

The shared path owns general semantics and provides a safe fallback when specialist routing is imperfect. Specialists augment the shared path rather than replacing all common capability.

Target composition, to be established experimentally:

- compact text/vision conditioning;
- dense latent/DiT-style generative backbone;
- compact latent codec/decoder;
- routing/runtime metadata;
- hardware-specific graph variants where required.

The first architecture experiments should prefer approximately 500–800M active-scale dense/student capacity before adding deep sparse complexity. Parameter counts are not acceptance gates by themselves.

## 5. Adapter-MoE first

The first true BERS MoE generation should be **Adapter-MoE**, not a giant conventional expert model.

Specialists should primarily be compact deltas such as:

- LoRA/low-rank adapters;
- decomposed FFN experts;
- residual adapters;
- small attention experts;
- embeddings/normalization deltas;
- other compact domain modules.

Initial expert families to research may include Fashion, Identity/Face, Pose/Person, Material/Texture, Background and Detail/Restoration, but semantic names are hypotheses rather than production truth. Training and measured specialization must justify each expert.

Expert packs must not be full independent copies of the backbone.

## 6. Hierarchical routing law

One router must not be responsible for every decision. BERS uses staged routing:

### 6.1 Task router

Determines the admitted capability family, for example Try-On, portrait edit, background operation, restoration, or general generation.

### 6.2 Pack router

Determines which signed local packs must be resident before execution.

### 6.3 Timestep / stage router

Allows different specialists at different denoising/flow stages, e.g. coarse geometry early, material/appearance mid-run, identity/detail late.

### 6.4 Spatial router

May route different image/latent regions differently, such as garment, face, hair, hands, or low-information background.

### 6.5 Sparse expert router

Uses tightly bounded Top-1/Top-2 or another measured policy inside selected blocks.

Routing must remain deterministic enough to record versioned evidence and diagnose replay/performance behavior.

## 7. Selective internal MoE

Do not convert every transformer block into MoE.

After Adapter-MoE is proven, selected large FFN/attention-adjacent blocks may be tested as sparse experts. Each conversion requires an A/B comparison against the dense baseline for:

- quality;
- end-to-end latency;
- peak memory;
- bytes moved;
- energy/thermal behavior;
- actual kernel/device efficiency;
- replay/debug complexity.

If sparse routing reduces theoretical FLOPs but performs worse on real hardware, keep the dense block.

## 8. Token/spatial sparsity

Later generations may reduce expensive processing of low-value visual tokens/regions. Critical areas such as identity, garment boundaries, hands or fine texture may receive more compute while low-information background uses a cheaper shared path.

Token pruning or spatial sparsity must preserve image coherence and may not become a shortcut that degrades anatomy, identity, garment shape, logos/patterns, or canonical Fashion support regions.

## 9. Few-step generation before aggressive offload

Preferred mobile optimization order:

1. task-specific student/distillation;
2. few-step generation;
3. compact hardware-aware dense core;
4. mixed quantization;
5. Adapter-MoE;
6. selective internal MoE;
7. timestep/spatial/token sparsity;
8. expert residency/offload refinements where measurements prove value.

Target quality modes are initially:

- `FAST`: ~2 steps;
- `BALANCED`: ~4 steps;
- `QUALITY`: ~6–8 steps;
- `ULTRA`: immediate local result plus optional admitted cloud refinement.

Exact schedules require model-specific evidence.

## 10. FreeToken-derived runtime principles

FreeToken is a reference for system mechanisms, not a drop-in BERS image runtime. Reimplement only mechanisms that produce measured image-runtime value.

Adopt/evaluate:

- expert residency;
- hot/warm/cold expert classification;
- usage-aware/LRU-style eviction;
- predictive prefetch;
- asynchronous/double-buffered weight movement;
- runtime bandwidth profiling;
- elastic memory budgets;
- heterogeneous CPU/GPU/NPU execution;
- immutable packed/sharded expert weights;
- cache hit/miss and bytes-moved telemetry;
- fail-closed resource admission before large materialization.

Do not inherit LLM-specific KV-cache, prefix-cache, autoregressive token-sampling, or CUDA/PCIe assumptions without image-specific evidence.

## 11. Memory hierarchy

The on-device runtime treats available memory tiers as a controlled hierarchy:

```text
Accelerator / NPU / GPU  -> hot active state
RAM / unified memory     -> warm experts / staging buffers
Flash                    -> installed cold model packs
Verified Model CDN       -> acquisition/update source only
```

The CDN is **not** a live inference memory tier. Normal local inference must not depend on network fetches after execution begins.

## 12. Predictive prefetch and double buffering

Before generation, the planner determines the likely required expert set and, where possible, a stage schedule.

While expert/block A executes, the runtime may prefetch B from flash to RAM. The goal is to hide I/O behind useful compute.

```text
GPU/NPU:  [ compute A ............ ][ compute B ............ ]
Flash/RAM:          [ prefetch B .. ][ prefetch C .. ]
```

Prefetch policy is device- and workload-specific. Excessive speculative loading that increases memory pressure or thermal cost must be rejected.

## 13. Heterogeneous execution

Do not require one processor to run the entire graph.

Research defaults:

- CPU: routing, orchestration, lightweight preprocessing/control;
- NPU: static dense supported graph regions;
- GPU: dynamic attention/expert paths and unsupported/irregular accelerator operations;
- device-specific alternatives where measurements prove a better mapping.

Dynamic expert routing must not be forced onto an NPU when scatter/gather, dynamic shapes, or graph recompilation erase the benefit.

## 14. Hardware-specific packs

A single universal binary is not the long-term target.

Potential deployment families:

- Apple: Core ML / Metal / ANE-compatible pack where supported;
- Snapdragon/Android: LiteRT/QNN/Hexagon-capable pack where supported;
- generic Android: GPU-oriented pack;
- browser: ONNX/WebGPU/WASM path;
- desktop/native: larger local tier where appropriate.

The same model version may therefore have multiple signed hardware/runtime representations under one canonical model identity and evidence policy.

## 15. Mixed precision law

Do not globally force INT4.

Use sensitivity- and hardware-aware mixed precision. Candidate policy includes FP16/INT8 for sensitive norms/attention paths and INT8/INT6/INT4 weight formats for tolerant large linear/expert blocks where real quality survives.

Quantization is accepted only after parity/quality and device performance evidence. Smaller storage that causes slower dequantization or worse accelerator utilization is not a win.

## 16. Model acquisition and cache policy

Model packs are versioned, signed and hash-verified before use. Required packs are acquired before local execution starts and reused thereafter.

Expected behavior:

- Base pack: retained as required local capability;
- frequently used experts: retained hot/warm within resource policy;
- rare experts: evictable from RAM and potentially flash cache;
- not-installed experts: acquired from CDN on first admitted use;
- repeat generation with unchanged installed packs: zero model-network transfer.

Delta/content-addressed update techniques should be evaluated so small expert changes do not require re-downloading a complete base pack.

## 17. Hybrid execution policy

`HYBRID` does not mean continual layer-by-layer network round trips by default.

Preferred execution order:

1. `FULL_LOCAL`;
2. `LOCAL_WITH_INSTALLED_OR_PREFETCHED_EXPERTS`;
3. semantic hybrid execution when explicitly admitted;
4. full cloud fallback / Ultra.

A useful semantic split may perform segmentation/pose/encoding locally, a heavy synthesis/refinement stage in cloud, then local decode/composite/postprocess. Classical layer-level split inference remains experimental and requires clear latency/cost/privacy benefit.

No local failure may silently switch to a paid cloud provider or consume credits.

## 18. Edit-first mobile strategy

BERS local AI prioritizes operations where existing pixels and canonical geometry reduce generative burden:

- segmentation/matting;
- pose/person understanding;
- garment understanding;
- background operations;
- localized inpainting/editing;
- Try-On support/refinement;
- identity preservation;
- restoration/upscale;
- region-aware generation.

Do not regenerate the entire image when a bounded region can be generated and composited with better identity/background preservation and lower compute.

## 19. Quality / storage / resource targets

Initial engineering targets, subject to evidence:

- application payload: `< 200 MB` where feasible;
- initial useful AI download: `~600–900 MB`;
- typical installed AI: `~1.0–1.5 GB`;
- normal managed AI cache: `<= 2 GB`;
- typical individual expert: tens to low hundreds of MB, not full-model copies;
- active weights per ordinary task: approximately `400–800 MB` target;
- repeat model-network transfer: `0 MB` after required packs are installed;
- cloud GPU usage: minority path for supported local workloads.

The total server-side BERS model/expert fleet may be many GB larger than a user's installed set.

## 20. Product metric law

Every architecture candidate is selected by measured outcomes:

- quality / GB;
- quality / active FLOP;
- quality / joule;
- cold and warm latency;
- peak RAM/VRAM/unified memory;
- flash/RAM/accelerator bytes moved;
- battery usage;
- thermal throttling;
- package and first-use download size;
- cache hit/miss behavior;
- failure/anatomy/artifact rate;
- identity and garment preservation;
- cloud cost per successful generation;
- commercial license/redistribution constraints.

Sparse active-parameter count alone is never sufficient evidence.

## 21. Explicit non-goals

The canonical direction rejects the following as default architecture unless later evidence overturns the decision:

- a giant 15–20 GB mobile MoE that relies on constant flash thrashing;
- a literal FreeToken CUDA/LLM runtime port;
- full-model network weight streaming during every denoising step;
- layer-by-layer phone/server round trips as the normal path;
- dozens of full-size expert model copies;
- universal fully dynamic MoE on NPU without hardware evidence;
- universal INT4 regardless of quality/kernel support;
- silent cloud fallback from `LOCAL_ONLY`;
- using users' devices to execute other users' workloads.

## 22. Roadmap phases

### HSME-1 — Control-plane expert runtime

Build on the existing ModelFleet/DeviceExecutionAdmission/ResourceGovernor/downloader trust foundation.

Required research/prototypes:

- task and capability routing;
- signed expert-pack identity;
- on-demand acquisition and cache state;
- device profiling and resource budgets;
- local/cloud execution policy;
- download/prefetch observability.

### HSME-2 — Dense distilled BERS mobile student

- select teacher/reference set;
- establish a compact dense student baseline;
- few-step distillation;
- exact package/quality/latency/memory evidence;
- hardware-specific representation feasibility.

### HSME-3 — Adapter-MoE

- shared core + compact specialist deltas;
- start with small expert count;
- compare Top-1/Top-2 and shared+specialist behavior;
- prove that expert specialization improves product quality or resource cost.

### HSME-4 — FreeToken-inspired adaptive residency

- hot/warm/cold expert cache;
- predictive prefetch;
- double buffering;
- bandwidth/device profiling;
- elastic RAM/accelerator budgets;
- exact bytes-moved telemetry.

### HSME-5 — Selective internal sparse MoE

- convert only measured candidate blocks;
- compare dense vs sparse wall-clock performance;
- reject sparse blocks that lose actual device efficiency.

### HSME-6 — Timestep/stage routing

- measure coarse geometry/appearance/detail stage specialization;
- use predictable stage transitions for expert prefetch;
- record deterministic routing evidence.

### HSME-7 — Spatial/token sparsity

- region-aware expert routing;
- bounded token pruning/cheap-path processing;
- strict preservation tests for identity/Fashion regions.

### HSME-8 — Hardware-specialized production candidates

- Apple and Android device-tier packs;
- NPU/GPU/CPU placement benchmarks;
- battery/thermal qualification;
- explicit supported-device classes;
- promotion only through existing fail-closed model policy.

## 23. Relationship to BERS v1 Stage E

Before `BERS_V1_RC`, Stage E still requires only the defined `R&D_VALIDATED` milestone, not completion of the entire HSME roadmap.

The pre-v1 evidence should establish:

1. one pinned dense reference/student baseline;
2. at least one functioning sparse/Adapter-MoE prototype;
3. measured routing comparison;
4. at least one implemented FreeToken-derived memory mechanism;
5. quality/latency/memory/bytes-moved comparison against dense;
6. explicit desktop feasibility decision;
7. explicit mobile feasibility decision or recorded blocker;
8. `ADVANCE / REDESIGN / REJECT` decision.

Later HSME phases remain post-validation development unless separately promoted into the v1 mandatory gate.

## 24. Authority law

The BERS AI runtime remains subordinate to canonical Core authority.

It may not independently authorize:

- Project mutation;
- Artifact acceptance;
- provider selection outside admitted policy;
- Billing/credit consumption;
- model identity or provenance;
- cloud fallback;
- Fashion garment/body geometry truth;
- signed lineage/support evidence.

Image-producing work still ends as a canonical candidate Artifact and requires the established explicit Accept path where Project mutation is involved.

## 25. Architecture success criterion

The architecture advances only if it produces a material product benefit over the best relevant dense baseline on at least one target device class while preserving Core authority, provenance, local-first policy, quality gates, Fashion lineage/geometry constraints, and fail-closed cloud/billing behavior.

The intended long-term outcome is a BERS-owned image engine with a large total capability/model fleet while a normal user stores only the subset needed for their workflows and performs most eligible inference locally.