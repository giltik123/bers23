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

## 26. HSME v2 — Scheduled Hierarchical Sparse Engine

HSME v2 records the preferred advanced research direction once the HSME-1 through HSME-4 foundations are measurable. It strengthens the original sparse-runtime concept with deterministic scheduling and image-specific routing rather than adopting unrestricted LLM-style MoE.

The target hierarchy is:

```text
Request
  |
  v
Task Router
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

The following five mechanisms are selected as the primary HSME v2 research priorities.

### 26.1 Timestep-specialized experts

Different denoising/flow stages may specialize in different work. BERS should explicitly test stage-specialized capacity rather than assuming the same expert set is optimal at every step.

Initial hypotheses include:

- early: composition, coarse geometry and pose;
- middle: garment structure, material and lighting;
- late: identity preservation, texture, boundaries and fine detail.

These semantic labels are research hypotheses, not model or product authority. Learned specialization and measured quality determine the actual expert roles.

The primary experiment compares:

1. dense/shared execution at every step;
2. Adapter-MoE with one fixed expert set;
3. scheduled timestep expert groups;
4. learned bounded timestep routing.

Required evidence includes quality, active/resident bytes, end-to-end latency, per-step latency, expert reuse, bytes moved, cache hit rate and deterministic replay metadata.

A timestep-MoE candidate advances only if stage specialization yields a real product or resource benefit rather than merely different routing labels.

### 26.2 Guided hierarchical and block-level routing before unrestricted token MoE

Mobile BERS should prefer coarse, guided routing before unconstrained per-token routing.

The preferred order is:

```text
Task
 -> Pack
 -> Timestep
 -> Block / Expert Group
 -> optional Spatial Region
 -> optional Token-level specialist
```

The router may consume model inputs derived from admitted operation context, such as timestep embedding, region/segmentation features, pose/garment conditioning, operation embedding and latent features. Such hints are **conditioning only**; they never become Core, Fashion geometry, Artifact, provider or Billing authority.

Research a BERS Guided Router with a two-stage concept where useful:

```text
latent/visual representation
        |
        v
function / coarse route
        |
        v
prototype / specialist route
        |
        v
bounded expert group
```

The purpose is to reduce router collapse, dead experts, unstable specialization and mobile scatter/gather overhead.

Block-level/coarse routing is preferred if it achieves similar quality with more regular kernels, fewer dispatches and lower memory traffic than per-token routing.

Do not hard-code an internal expert as immutable `Face`, `Garment`, `Hair`, etc. merely because the product exposes those concepts. Expert semantics must be learned and measured; product-level packs may remain named while internal experts stay versioned numeric/functional identities.

### 26.3 Deterministic prefetch first; speculative prefetch second

HSME must exploit predictable image-generation schedules before adding speculative expert prediction.

If Task/Pack/Timestep planning establishes a likely sequence such as:

```text
Geometry -> Pose -> Fashion -> Material -> Identity -> Detail
```

then the runtime should use that deterministic or bounded schedule to prefetch the next required expert while the current expert executes.

```text
Accelerator: [ compute A ........ ][ compute B ........ ]
Flash/RAM:           [ load B ... ][ load C ... ]
```

Policy law:

1. known next-stage requirements first;
2. high-confidence bounded prediction second;
3. broad speculative prefetch only if measurements prove benefit.

Speculation must be capped by RAM, flash-bandwidth, thermal and battery budgets. A predictor that improves expert hit rate but increases page faults, flash reads or total latency is rejected.

Required telemetry:

- useful-prefetch ratio;
- wasted-prefetch bytes;
- flash bytes read per generation;
- accelerator stall time waiting for weights;
- cache hit/miss rate;
- prefetch lead time;
- memory pressure caused by prefetched experts.

### 26.4 Shared core plus bounded expert capacity tied to Quality Mode

The shared dense path remains always available. Specialists receive an explicit compute/capacity budget rather than unbounded access to every visual token.

BERS should research expert capacity as a controllable quality/performance dimension. Example experimental policies:

```text
FAST
- few steps
- Top-1 or shared-only where sufficient
- small specialist token/capacity budget
- aggressive cheap-path use

BALANCED
- moderate steps
- Top-1 / bounded Top-2
- medium specialist capacity

QUALITY
- more steps
- larger specialist capacity
- more identity/detail processing
- less aggressive pruning

ULTRA
- maximum admitted local budget
- optional explicit cloud refinement
```

Quality mode therefore becomes a multidimensional execution policy, not only `num_inference_steps`:

```text
quality budget =
steps
x expert activation budget
x expert capacity
x token/spatial compute budget
x precision/runtime tier
```

Target examples such as 5%, 15%, 25% or 40% specialist token capacity are experimental values only. The accepted policy is determined by quality/latency/energy/device evidence.

The runtime must retain a safe shared path so a specialist routing miss does not remove universal image semantics.

### 26.5 Expert Residency Planner

Replace simple LRU as the long-term policy with a schedule-aware **BERS Expert Residency Planner**.

Inputs may include:

- admitted task/capability;
- current and future timestep schedule;
- current expert set;
- predicted expert reuse distance;
- device RAM/unified-memory state;
- accelerator-resident budget;
- flash throughput;
- current cache state;
- battery and thermal state;
- active quality mode.

The planner produces bounded actions such as:

```text
KEEP
PREFETCH
EVICT
MOVE
MATERIALIZE
DEQUANTIZE
```

Example policy:

```text
Fashion expert: needed again next step -> KEEP
Geometry expert: no future use -> EVICT
Identity expert: needed in two steps -> PREFETCH when budget permits
```

The planner must be deterministic/replayable for the same recorded policy inputs where production evidence requires deterministic planning.

**Bytes moved are a first-class optimization target.** A sparse model with fewer active parameters but excessive Flash -> RAM -> accelerator traffic may be inferior to a larger dense resident model.

Required metrics include:

- total bytes moved per generation;
- bytes moved per denoising/flow step;
- flash reads;
- RAM <-> accelerator traffic;
- expert residency duration;
- cache hit/miss ratio;
- accelerator idle/stall time;
- thermal and energy impact.

### 26.6 Secondary experiments retained from the earlier sparse roadmap

The following are retained as explicit comparison tracks, but they are not presumed to beat the primary HSME v2 design.

#### Dense-to-sparse conversion

Start from the accepted dense BERS student, clone or decompose selected candidate FFN capacity into experts, then train specialization/routing while retaining the dense checkpoint as the exact quality/resource baseline.

Advance only if the converted sparse candidate avoids router collapse/dead experts and materially improves at least one product metric without unacceptable quality loss.

#### Expert Choice / capacity-directed routing

Compare conventional token-choice routing against a bounded expert-choice variant in which an expert selects only the highest-value visual tokens up to a fixed capacity budget.

This is especially relevant for Detail/Identity-like learned specialists where only a subset of regions may justify expensive processing.

Expert Choice remains experimental until it proves stable specialization, predictable capacity and hardware-efficient kernels.

### 26.7 HSME v2 acceptance matrix

Every HSME v2 candidate must compare against the same pinned dense/Adapter-MoE baseline using at least:

- real-image and product-domain quality;
- identity/garment/logo/pattern preservation;
- anatomy/artifact failure rate;
- end-to-end and per-step latency;
- active parameters;
- resident bytes;
- installed/package bytes;
- total bytes moved;
- flash reads;
- RAM/accelerator traffic;
- cache hit/miss and wasted-prefetch ratio;
- peak memory;
- energy/battery and thermal behavior;
- routing stability/expert utilization;
- deterministic replay/debug evidence;
- device-specific kernel efficiency.

The architecture decision must be based on wall-clock and product metrics. Sparse FLOPs, theoretical expert count or router novelty are never sufficient promotion evidence.

### 26.8 Relationship to HSME phases

HSME v2 is an advanced overlay on the existing staged roadmap, not permission to skip earlier evidence.

Recommended dependency order:

```text
HSME-1  control-plane/model-pack runtime
   -> HSME-2  dense distilled student
   -> HSME-3  Adapter-MoE
   -> HSME-4  measurable residency/prefetch substrate
   -> HSME-v2.A  timestep specialization + deterministic schedule
   -> HSME-v2.B  guided/block routing
   -> HSME-v2.C  bounded expert capacity + Quality Mode
   -> HSME-v2.D  schedule-aware Expert Residency Planner
   -> HSME-v2.E  optional spatial/token/Expert-Choice experiments
   -> HSME-8  hardware-specialized candidates only after device evidence
```

This preserves the core engineering rule: **first prove a compact dense student and measurable runtime substrate; then add sparse sophistication only where it wins on real devices.**