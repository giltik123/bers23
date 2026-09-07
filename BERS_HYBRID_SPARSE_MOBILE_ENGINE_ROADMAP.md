# BERS Hybrid Sparse Mobile Engine Roadmap

**Status: CANONICAL R&D ARCHITECTURE / NO PRODUCTION AUTHORITY**

This document is the detailed companion to Stage E of `BERS_V1_DEVELOPMENT_ROADMAP.md` and issue #352. It records the selected long-term architecture for the BERS-owned local-first image AI engine.

It does **not** promote any current R&D model or expert path into production, does not replace Tiny-SD/Kandinsky/LaMa acceptance programs, and does not weaken Core, Artifact, Project, Billing, provider, lineage, local-only, or real-device evidence boundaries.

## 1. Canonical architecture decision

The selected direction combines two complementary systems:

1. **BERS Hybrid Sparse Mobile Engine (HSME)** — top-level execution architecture: what may run on-device, which model packs are required, and how an already Core-admitted execution target is realized.
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
        |
        v
advisory hierarchical routing
Task proposal -> Pack -> Timestep -> Block/Spatial -> Sparse Expert
        |
        v
FreeToken-inspired adaptive runtime
NPU/GPU <-> RAM <-> Flash <- verified Model CDN
        |
        v
canonical Core target remains LOCAL / HYBRID / CLOUD / BLOCKED
```

## 2. Product goals

The architecture optimizes measurable product outcomes, not parameter-count aesthetics.

Primary goals:

- high-quality local generation/editing on supported mobile hardware;
- first useful AI footprint near 1 GB rather than 15–20 GB;
- typical installed AI footprint around 1–1.5 GB and normal cache budget around 2 GB;
- no repeat model download during normal repeated generation;
- majority of eligible inference performed on the user's GPU/NPU;
- minimal server GPU cost for local-capable workloads;
- graceful device-tier fallback rather than universal lowest-common-denominator execution;
- offline-capable local execution after required packs are present;
- model/expert additions without forcing every user to download the complete fleet;
- deterministic, inspectable routing/evidence sufficient for debugging and release qualification.

All numeric values are R&D targets until verified on real devices.

## 3. Teacher / student law

Large Kandinsky-class models, specialized VTO teachers, face/identity teachers, restoration teachers, and future BERS foundation models are primarily **training teachers**, not mandatory mobile runtime payloads.

The mobile path may use:

- semantic/text representation matching;
- intermediate feature matching;
- attention/relationship matching;
- latent/noise/flow target matching;
- final-image/perceptual targets;
- preference/quality training;
- few-step consistency/distillation.

BERS must not promise that a sub-2 GB student preserves every universal capability of a much larger teacher. The target is to preserve or exceed teacher usefulness on BERS product domains.

## 4. Shared dense mobile core

The baseline retains a compact **dense shared generative core**. It is not a fully sparse model.

The shared path owns general semantics and provides a safe fallback when specialist routing is imperfect. Specialists augment the shared path rather than replacing all common capability.

Initial experiments should prefer an approximately 500–800M active-scale dense/student baseline before adding deep sparse complexity. Parameter counts are not acceptance gates by themselves.

## 5. Adapter-MoE first

The first true BERS MoE generation should be **Adapter-MoE**, not a giant conventional expert model.

Specialists should primarily be compact deltas such as:

- LoRA/low-rank adapters;
- decomposed FFN experts;
- residual adapters;
- small attention experts;
- embeddings/normalization deltas;
- other compact domain modules.

Initial expert-family names such as Fashion, Identity/Face, Pose/Person, Material/Texture, Background and Detail/Restoration are research hypotheses. Training and measured specialization must justify them. Expert packs must not be full independent copies of the backbone.

## 6. Hierarchical routing law

One router must not own every decision.

### 6.1 Task router is advisory only

The runtime/task router may **propose** a capability family such as Try-On, portrait edit, background operation, restoration, or general generation.

It may not admit that capability. **Canonical Core remains the only capability/execution admission authority.** Core must validate the proposal against operation, Artifact, provider, Billing, project, privacy and execution policy before any HSME execution begins.

No browser/device router output is trusted as an authorization decision.

### 6.2 Pack router

After Core admission, the runtime determines which signed local packs are required for the admitted local subgraph.

### 6.3 Timestep / stage router

Different specialists may be used at different denoising/flow stages, such as coarse geometry early, material/appearance mid-run and identity/detail late.

### 6.4 Block / spatial router

Coarse block/group routing is preferred before unrestricted token routing. Spatial routing may differentiate high-value regions from low-information background where measurements justify it.

### 6.5 Sparse expert router

Use tightly bounded Top-1/Top-2 or another measured policy inside selected blocks. Routing must remain sufficiently inspectable for replay/debug/performance evidence.

## 7. Selective internal MoE

Do not convert every transformer block into MoE.

After Adapter-MoE is proven, selected large FFN/attention-adjacent blocks may be tested as sparse experts. Each conversion requires an A/B comparison against the dense baseline for quality, latency, peak memory, bytes moved, energy/thermal behavior, kernel efficiency and replay/debug complexity.

If sparse routing reduces theoretical FLOPs but performs worse on real hardware, keep the dense block.

## 8. Token/spatial sparsity

Later generations may reduce expensive processing of low-value visual tokens/regions. Critical areas such as identity, garment boundaries, hands or fine texture may receive more compute while low-information background uses a cheaper shared path.

Token pruning may not degrade anatomy, identity, garment shape, logos/patterns, or canonical Fashion support regions.

## 9. Few-step generation before aggressive offload

Preferred optimization order:

1. task-specific student/distillation;
2. few-step generation;
3. compact hardware-aware dense core;
4. mixed quantization;
5. Adapter-MoE;
6. selective internal MoE;
7. timestep/block/spatial/token sparsity;
8. expert residency/offload refinements where measurements prove value.

Initial quality modes:

- `FAST`: ~2 steps;
- `BALANCED`: ~4 steps;
- `QUALITY`: ~6–8 steps;
- `ULTRA`: immediate local result plus optional separately Core-admitted cloud refinement.

Exact schedules require model-specific evidence.

## 10. FreeToken-derived runtime principles

FreeToken is a reference for system mechanisms, not a drop-in BERS image runtime.

Adopt/evaluate only where image-runtime evidence proves value:

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

```text
Accelerator / NPU / GPU  -> hot active state
RAM / unified memory     -> warm experts / staging buffers
Flash                    -> installed cold model packs
Verified Model CDN       -> acquisition/update source only
```

The CDN is **not** a live inference memory tier. Normal local inference must not depend on network fetches after execution begins.

## 12. Deterministic prefetch before speculative prefetch

Before generation, the planner determines the known required expert set and, where possible, a stage schedule.

```text
GPU/NPU:   [ compute A ........ ][ compute B ........ ]
Flash/RAM:          [ prefetch B ][ prefetch C ]
```

Policy order:

1. known next-stage requirements;
2. high-confidence bounded prediction;
3. broader speculation only if measurements prove benefit.

Speculation is capped by RAM, flash-bandwidth, thermal and battery budgets.

## 13. Heterogeneous execution

Research defaults:

- CPU: advisory routing, orchestration and lightweight preprocessing/control;
- NPU: static dense supported graph regions;
- GPU: dynamic attention/expert paths and unsupported/irregular accelerator operations;
- device-specific alternatives where benchmarks prove a better mapping.

Dynamic expert routing must not be forced onto an NPU when scatter/gather, dynamic shapes or graph recompilation erase the benefit.

## 14. Hardware-specific representation identity

A single universal binary is not the long-term target. Candidate families include Apple Core ML/Metal/ANE, Snapdragon LiteRT/QNN/Hexagon, generic Android GPU, browser ONNX/WebGPU/WASM and desktop/native variants.

**Current fleet law:** `DurableModelFleet` binds runtime/format/URI/hash/platform metadata to immutable `modelId@version`. Therefore two different hardware/runtime representations must not currently masquerade as one existing `modelId@version` identity.

Until a separately reviewed representation-discriminator/evidence-schema change exists, each materially different hardware representation must receive a distinct fleet identity/version with its own immutable manifest, hash, promotion evidence and supported-device claim.

A future representation discriminator may unify these under a higher-level logical model family, but that schema change is a separate authority/evidence migration and is not granted by this roadmap.

## 15. Mixed precision law

Do not globally force INT4.

Use sensitivity- and hardware-aware mixed precision. Smaller storage that causes slower dequantization, worse accelerator utilization or unacceptable quality is not a win.

## 16. Model acquisition and cache policy

Model packs are versioned, signed and hash-verified before use.

- Base pack: retained where required;
- frequently used experts: retained hot/warm within resource policy;
- rare experts: evictable from RAM and potentially flash cache;
- not-installed experts: acquired from CDN before admitted local execution;
- repeat generation with unchanged installed packs: zero model-network transfer.

Delta/content-addressed update techniques should be evaluated.

## 17. Mapping HSME states to canonical execution policy

HSME does **not** create a second execution-policy vocabulary.

Canonical Core targets remain exactly:

- `LOCAL`;
- `CLOUD`;
- `HYBRID`;
- `BLOCKED`.

Canonical policies remain exactly:

- `LOCAL_ONLY`;
- `CLOUD_ALLOWED`;
- `CLOUD_PREFERRED`;
- `AUTO`.

Terms such as `FULL_LOCAL` or `LOCAL_WITH_INSTALLED_OR_PREFETCHED_EXPERTS` are **internal residency/readiness states beneath an already admitted canonical `LOCAL` target**. They must never be passed as Core execution-policy values and must never cause unknown-policy fallback to `AUTO`.

Conceptual internal ordering for an admitted `LOCAL` run may be:

```text
LOCAL / all required packs resident
LOCAL / required packs must be acquired or prefetched before start
LOCAL / blocked because packs/resources are unavailable
```

If Core admits `HYBRID` or `CLOUD`, HSME may realize only the subgraph and target already admitted by Core. No local failure may silently switch to a paid cloud provider or consume credits.

Classical layer-level split inference remains experimental and requires clear latency/cost/privacy benefit.

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

## 20. Product metric law

Every candidate is selected by measured outcomes:

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

Reject as default architecture unless later evidence overturns the decision:

- giant 15–20 GB mobile MoE with constant flash thrashing;
- literal FreeToken CUDA/LLM runtime port;
- full-model network weight streaming during denoising;
- layer-by-layer phone/server round trips as normal execution;
- dozens of full-size expert model copies;
- universal fully dynamic MoE on NPU without hardware evidence;
- universal INT4 regardless of quality/kernel support;
- silent cloud fallback from `LOCAL_ONLY`;
- using users' devices to execute other users' workloads.

## 22. Roadmap phases

### HSME-1 — Control-plane expert runtime

- advisory task/capability routing under Core admission;
- signed expert-pack identity;
- on-demand acquisition and cache state;
- device profiling and resource budgets;
- canonical local/hybrid/cloud policy integration;
- download/prefetch observability.

### HSME-2 — Dense distilled BERS mobile student

- select teacher/reference set;
- establish compact dense baseline;
- few-step distillation;
- exact package/quality/latency/memory evidence;
- hardware-specific representation feasibility.

### HSME-3 — Adapter-MoE

- shared core + compact specialist deltas;
- small expert count first;
- Top-1/Top-2 and shared+specialist comparisons;
- prove measured product benefit.

### HSME-4 — FreeToken-inspired adaptive residency

- hot/warm/cold cache;
- deterministic/predictive prefetch;
- double buffering;
- bandwidth/device profiling;
- elastic RAM/accelerator budgets;
- exact bytes-moved telemetry.

### HSME-5 — Selective internal sparse MoE

- convert only measured candidate blocks;
- compare dense vs sparse wall-clock performance;
- reject sparse blocks that lose actual device efficiency.

### HSME-6 — Timestep/stage routing

- measure geometry/appearance/detail stage specialization;
- exploit predictable stage transitions for prefetch;
- record deterministic routing evidence.

### HSME-7 — Spatial/token sparsity

- region-aware routing;
- bounded token pruning/cheap-path processing;
- strict identity/Fashion preservation tests.

### HSME-8 — Hardware-specialized candidates

- distinct fleet identities/evidence for Apple and Android runtime representations under current schema;
- NPU/GPU/CPU placement benchmarks;
- battery/thermal qualification;
- explicit supported-device classes;
- promotion only through existing fail-closed model policy.

## 23. Relationship to BERS v1 Stage E

Before `BERS_V1_RC`, Stage E still requires the defined `R&D_VALIDATED` milestone, not completion of the entire HSME roadmap.

The pre-v1 evidence must establish:

1. one pinned dense reference/student baseline;
2. at least one functioning sparse/Adapter-MoE prototype;
3. measured routing comparison;
4. at least one implemented FreeToken-derived memory mechanism;
5. quality/latency/memory/bytes-moved comparison against dense;
6. explicit desktop feasibility decision;
7. **explicit mobile feasibility decision based on real supported-device evidence, or a recorded blocker when such evidence cannot be obtained**;
8. `ADVANCE / REDESIGN / REJECT` decision.

Browser/WASM capability evidence alone cannot satisfy item 7.

## 24. Authority law

The BERS AI runtime remains subordinate to canonical Core authority.

It may not independently authorize:

- capability admission;
- execution target/policy outside Core admission;
- Project mutation;
- Artifact acceptance;
- provider selection;
- Billing/credit consumption;
- model identity or provenance;
- cloud fallback;
- Fashion garment/body geometry truth;
- signed lineage/support evidence.

Image-producing work still ends as a canonical candidate Artifact and requires the established explicit Accept path where Project mutation is involved.

## 25. Architecture success criterion

The architecture advances only if it produces a material product benefit over the best relevant dense baseline on at least one target device class while preserving Core authority, provenance, local-first policy, quality gates, Fashion lineage/geometry constraints and fail-closed cloud/billing behavior.

## 26. HSME v2 — Scheduled Hierarchical Sparse Engine

HSME v2 is the preferred advanced research direction once HSME-1 through HSME-4 are measurable.

```text
Core-admitted request
  |
  v
Advisory Task Router
  |
  v
Pack Router
  |
  v
Compact Dense Core + Adapter-MoE
  |
  v
Timestep Planner
  |
  v
Guided / Coarse Block Router
  |
  v
Optional Spatial / Token Router
  |
  v
Shared Path + Bounded Specialist Capacity
  |
  v
Expert Residency Planner
  |
  v
CPU / GPU / NPU <-> RAM <-> Flash
```

### 26.1 Timestep-specialized experts

Explicitly compare:

1. dense/shared execution every step;
2. Adapter-MoE with fixed expert set;
3. scheduled timestep expert groups;
4. learned bounded timestep routing.

Initial semantic hypotheses: early composition/geometry/pose; middle garment/material/lighting; late identity/texture/boundaries/detail. Learned specialization, not labels, determines actual roles.

### 26.2 Guided hierarchical and block-level routing

Preferred order:

```text
Task proposal
 -> Core admission
 -> Pack
 -> Timestep
 -> Block / Expert Group
 -> optional Spatial Region
 -> optional Token specialist
```

Admitted operation context may provide conditioning hints, but those hints never become Core/Fashion/Artifact/provider/Billing authority.

Block/coarse routing is preferred if it achieves similar quality with more regular kernels, fewer dispatches and lower memory traffic than per-token routing.

### 26.3 Deterministic prefetch first

Exploit known schedules before speculation.

Required telemetry:

- useful-prefetch ratio;
- wasted-prefetch bytes;
- flash bytes read per generation;
- accelerator stall time waiting for weights;
- cache hit/miss rate;
- prefetch lead time;
- memory pressure caused by prefetched experts.

### 26.4 Shared core + bounded expert capacity tied to Quality Mode

Quality mode controls multiple axes:

```text
quality budget =
steps
x expert activation budget
x expert capacity
x token/spatial compute budget
x precision/runtime tier
```

`FAST`, `BALANCED`, `QUALITY` and `ULTRA` may use different bounded specialist capacity, but the shared path remains available.

### 26.5 Expert Residency Planner

Inputs may include admitted task, timestep schedule, expert reuse distance, memory state, accelerator budget, flash throughput, cache state, battery/thermal state and quality mode.

Bounded actions:

```text
KEEP
PREFETCH
EVICT
MOVE
MATERIALIZE
DEQUANTIZE
```

**Bytes moved are a first-class optimization target.** A sparse model with fewer active parameters but excessive flash/RAM/accelerator traffic may be inferior to a larger dense resident model.

Required metrics:

- total bytes moved/generation;
- bytes moved/step;
- flash reads;
- RAM <-> accelerator traffic;
- expert residency duration;
- cache hit/miss ratio;
- accelerator idle/stall time;
- thermal/energy impact.

### 26.6 Secondary experiments

#### Dense-to-sparse conversion

Start from the pinned dense BERS student, decompose selected capacity into experts and retain the dense checkpoint as exact quality/resource baseline. Advance only if router collapse/dead experts are controlled and measured product benefit exists.

#### Expert Choice / capacity-directed routing

Compare token-choice routing against bounded expert-choice routing where an expert selects only the highest-value visual tokens up to a fixed capacity. This remains experimental until specialization and hardware efficiency are proven.

### 26.7 HSME v2 acceptance matrix

Every candidate compares against the same pinned dense/Adapter-MoE baseline using:

- real-image/product-domain quality;
- identity/garment/logo/pattern preservation;
- anatomy/artifact failure rate;
- end-to-end/per-step latency;
- active parameters;
- resident/installed bytes;
- total bytes moved;
- flash reads;
- RAM/accelerator traffic;
- cache hit/miss and wasted-prefetch ratio;
- peak memory;
- energy/battery/thermal behavior;
- routing stability/expert utilization;
- replay/debug evidence;
- device-specific kernel efficiency.

Sparse FLOPs or router novelty are never sufficient promotion evidence.

### 26.8 Dependency order

```text
HSME-1 control-plane/model-pack runtime
 -> HSME-2 dense distilled student
 -> HSME-3 Adapter-MoE
 -> HSME-4 measurable residency/prefetch substrate
 -> HSME-v2.A timestep specialization + deterministic schedule
 -> HSME-v2.B guided/block routing
 -> HSME-v2.C bounded expert capacity + Quality Mode
 -> HSME-v2.D schedule-aware Expert Residency Planner
 -> HSME-v2.E optional spatial/token/Expert-Choice experiments
 -> HSME-8 hardware-specialized candidates only after real-device evidence
```

Core engineering rule: **first prove a compact dense student and measurable runtime substrate; then add sparse sophistication only where it wins on real devices.**