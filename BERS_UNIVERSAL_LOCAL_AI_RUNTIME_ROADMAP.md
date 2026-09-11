# BERS Universal Local AI Runtime Roadmap

**Status: CANONICAL R&D COMPANION / NO PRODUCTION AUTHORITY**

This document defines the selected long-term runtime architecture for running model families whose installed size may materially exceed the working RAM available on the device. It is a companion to `BERS_HYBRID_SPARSE_MOBILE_ENGINE_ROADMAP.md`, Stage E of `BERS_V1_DEVELOPMENT_ROADMAP.md`, and the accepted HSME-1/HSME-1b control-plane and preparation/residency contracts.

It does **not** replace HSME, Core admission, DurableModelFleet, Artifact authority, Billing authority, AEE, or existing model-specific acceptance programs. It defines a lower-level local model-memory and execution substrate beneath already admitted local work.

The selected design combines BERS-owned architecture with evidence-driven ideas from Edge0-style sparse streaming and FreeToken-style adaptive memory scheduling, without making either external framework a runtime authority or mandatory dependency.

## 1. Canonical decision

BERS will build one **platform-independent Universal Local AI Runtime** with a shared **Model Virtual Memory (MVM)** layer rather than separate Apple, Android, desktop, browser, LLM, and image runtimes.

The key product law is:

> **Installed model capacity and peak working memory are separate resources.**

A model family may occupy several gigabytes or more on verified local storage while only a bounded active subset is materialized into RAM and accelerator memory for the current execution stage.

The canonical layering is:

```text
AEE / Product intent
        |
        v
Canonical Core admission
        |
        v
HSME Pack / Readiness / HSME_PREPARATION_V1
        |
        v
BERS Universal Local AI Runtime
        |
        +-- Model Virtual Memory (MVM)
        |      Flash -> RAM -> Accelerator
        |
        +-- portable routing / residency / prefetch
        |
        +-- replaceable compute backends
               CPU / GPU / NPU / Web
        |
        v
already-admitted local model execution
        |
        v
canonical execution / Artifact authorities remain unchanged
```

The runtime owns **how trusted model bytes are materialized and executed**. It owns no product, cloud, financial, Project, Artifact, provider, or execution-admission authority.

## 2. Why this design was selected

Three realistic approaches were considered.

### 2.1 Direct Edge0 dependency

Advantages:

- fastest way to reproduce current Apple-Silicon sparse-MoE experiments;
- existing mmap expert access, cache, prerouter and quantized expert execution.

Rejected as the canonical BERS architecture because:

- the current reference implementation is MLX/Apple-centric;
- its model/runtime abstractions are autoregressive-MoE-specific;
- it would create a second residency/cache/runtime authority next to HSME;
- BERS must support image, Agent, multimodal and future local workloads across many platforms.

Edge0 remains a valuable research reference, not a required runtime dependency.

### 2.2 Separate runtime per platform

Examples: one Apple implementation, one Android implementation, one desktop implementation and one browser implementation.

Rejected because it would duplicate:

- vault/index semantics;
- cache and residency policy;
- movement telemetry;
- prefetch logic;
- routing evidence;
- security and bounds validation;
- model-memory behavior.

Platform-specific code belongs behind backend interfaces only.

### 2.3 Selected: one portable MVM/runtime core + replaceable backends

BERS owns:

- model-vault semantics;
- exact byte-range indexing;
- residency planning;
- cache policy;
- deterministic and predictive prefetch policy;
- movement/resource telemetry;
- routing integration;
- model-memory safety rules;
- cross-backend acceptance vectors.

Backends own:

- file mapping implementation details;
- CPU/GPU/NPU allocation;
- tensor upload/materialization;
- backend-specific kernels/graphs;
- synchronization and hardware-specific execution.

This gives one architecture with many hardware realizations.

## 3. Relationship to accepted HSME-1b

The current accepted `HSME_PREPARATION_V1` is the integration seam.

HSME-1b already binds:

- exact pack/fleet revision;
- canonical manifest identity;
- selected active experts;
- RAM/accelerator/storage budgets;
- CPU/GPU/NPU/FLASH_ONLY placement;
- `flashToRamBytes`;
- `ramToAcceleratorBytes`;
- movement evidence;
- `networkBytesDuringExecution: 0`.

MVM must sit **below** that contract.

HSME preparation answers:

> What trusted model roots are required, what is admitted, what budgets apply, and what broad placement is allowed?

MVM answers:

> Which verified byte ranges are resident now, which ranges must move next, what should stay hot, and how are those bytes supplied to the selected compute backend?

MVM must never reinterpret a Core target, execution policy, provider choice, Billing decision, Artifact identity, or Project state.

## 4. Universal portability law

Neither HSME nor MVM may depend on:

- Apple;
- Android;
- Windows;
- Linux;
- a specific SoC vendor;
- MLX;
- Core ML;
- QNN;
- Vulkan;
- CUDA;
- OpenVINO;
- ONNX Runtime;
- ExecuTorch;
- WebGPU;
- any future vendor runtime.

Those are backend implementations, not architecture.

Platform selection is capability-based rather than brand-based.

A device profile should describe capabilities such as:

```text
CPU architecture / precision support
available RAM and memory pressure
local storage free space
measured storage bandwidth / latency class
GPU API and supported precisions
NPU availability and supported graph/quantization features
accelerator memory budget
dynamic-routing support
thermal state
battery / charging state
background restrictions
```

The runtime selects an accepted representation/backend from measured capability evidence. Unknown or insufficient capability fails closed to a supported fallback or `BLOCKED`; it never silently widens cloud policy.

## 5. Model Virtual Memory law

MVM treats local model storage as a cold model-memory tier, not as ordinary fully resident weights.

Canonical hierarchy:

```text
Accelerator / NPU / GPU
HOT: actively executing weights and state
        ^
        |
RAM / unified memory
WARM: reusable experts, staging, prefetch
        ^
        |
Device flash / SSD
COLD: installed verified model vault
        ^
        |
Verified Model CDN
ACQUISITION ONLY, never live inference memory
```

The model CDN is not part of the execution-time memory hierarchy. Any model bytes required for a `LOCAL_ONLY` run must be installed and verified before execution begins.

## 6. BERS Model Vault

The selected storage format is a versioned immutable **BERS Model Vault** abstraction.

Conceptual layout:

```text
BERS_MODEL_VAULT_V1
|
+-- signed / fleet-bound manifest identity
+-- shared core representation
+-- one or more immutable weight shards
+-- BERS_EXPERT_INDEX_V1 / tensor-range index
+-- optional recovery-adapter roots
+-- optional backend metadata / compiled side artifacts
```

The vault may use safetensors-compatible shards or another separately accepted immutable format, but the architecture must preserve exact range-addressable tensor metadata.

### 6.1 `BERS_EXPERT_INDEX_V1`

Each streamable entry must bind enough information to perform exact bounds-checked access, for example:

```text
entryId / expertId
logical family / block / layer / tensor role
shard identity
byte offset
byte length
alignment requirements
shape
dtype / quantization representation
packing layout
representation identity
expected hash-bound parent artifact
```

The index is untrusted until bound to a DurableModelFleet-verified representation.

MVM may never accept arbitrary model-generated or browser-generated file paths, offsets, lengths or tensor identities.

### 6.2 Trust boundary

`DurableModelFleet` remains the authority for:

- model identity/version;
- URI/acquisition source;
- hash/integrity;
- platform/runtime metadata;
- lifecycle state;
- promotion/quarantine evidence.

MVM only performs range access **inside bytes that Fleet/HSME already established as trusted and active**.

For materially different layouts or hardware-specific weight representations, current fleet law continues to require distinct immutable representation identity/version and evidence.

## 7. Portable storage backend

Define one storage interface independent of OS APIs.

Conceptual contract:

```text
ModelStorageBackend
  openVerifiedVault(...)
  mapReadOnlyRange(...)
  prefetchRange(...)
  releaseRange(...)
  adviseSequential(...)
  adviseWillNeed(...)
  measureReadBandwidth(...)
  queryStoragePressure(...)
```

Candidate implementations include:

- POSIX mmap-style file mapping;
- Windows file mapping;
- Android filesystem/mmap-compatible mapping;
- Apple file mapping;
- browser OPFS/IndexedDB/chunk-store emulation where native mmap is unavailable.

All implementations must expose equivalent range/bounds semantics even when the physical mechanism differs.

## 8. Portable compute backend

Define a hardware-neutral compute surface.

Conceptual contract:

```text
BersComputeBackend
  probeCapabilities()
  allocate()
  release()
  materializeWeightRange()
  upload()
  executeDenseRegion()
  executeExpertRegion()
  synchronize()
  collectExecutionMetrics()
```

Backends may internally use existing mature runtimes rather than reimplementing every vendor kernel.

Potential adapters:

- portable CPU / XNNPACK-style path;
- ExecuTorch backend adapters;
- ONNX Runtime adapters for existing accepted model families;
- Apple Metal/MPS/Core ML/ANE;
- Android Vulkan;
- Qualcomm QNN;
- MediaTek NPU runtime;
- Samsung/Exynos NPU runtime;
- NVIDIA CUDA;
- Intel/OpenVINO CPU/GPU/NPU;
- browser WebGPU/WASM;
- future AMD, ARM, RISC-V or embedded accelerators where evidence supports them.

No backend may become model-provenance or execution-policy authority.

## 9. Reference portable core implementation

The architecture is language-neutral, but the preferred implementation strategy is:

- a memory-safe portable native MVM core where practical;
- stable C ABI at backend/application boundaries;
- thin vendor-specific adapters in the language/toolchain required by that platform;
- canonical cross-language schema/golden vectors shared with existing TypeScript HSME contracts.

A Rust core with stable C ABI is the preferred first research candidate for byte-range/index/cache/residency logic because it can target iOS, Android, Windows, Linux and WebAssembly while reducing unsafe mapped-memory parsing surface. C++ backend shims remain acceptable where vendor SDKs or mature runtimes require them.

This language choice is an implementation default, not architecture authority. If measured integration or binary constraints invalidate it, a C++ portable core may replace it without changing MVM schemas or semantics.

## 10. Working-memory accounting

Every MVM-compatible representation must expose a bounded working-memory model.

At minimum:

```text
Peak Working Memory =
  resident shared core
+ activations / persistent model state
+ hot accelerator weights
+ warm RAM expert cache
+ prefetch/staging buffers
+ dequantization/packing workspace
+ backend execution workspace
```

Installed model capacity is measured separately:

```text
Installed Model Capacity =
  shared core
+ cold expert/model vault
+ recovery adapters
+ backend-specific side artifacts
```

A large installed model is useful only if peak working memory and bytes moved remain within device budgets.

## 11. Byte-budgeted global cache

Edge0-style slot caches are useful when experts are nearly uniform, but BERS must support heterogeneous image/Agent expert sizes.

The canonical BERS cache is therefore **byte-budgeted**, not only slot-counted.

Maintain independent bounded budgets for:

- RAM warm cache;
- accelerator hot cache;
- prefetch staging buffer.

Initial policy baseline:

- one global cache budget across the participating model subgraph;
- exact identity includes representation/block/expert/tensor generation;
- LRU as the first deterministic baseline;
- prefetched-but-unused bytes live outside the primary reuse cache until consumed where practical;
- cache admission/eviction never exceeds HSME resource budgets.

Later eviction scoring may incorporate measured future reuse:

```text
value ~
  reuseProbability
  * reloadCost
  * expectedStallPenalty
  * semanticPriority
  / residentBytes
```

Any adaptive policy must beat deterministic LRU on real-device product metrics before promotion.

## 12. Materialization path

The normal path for a cold streamable expert is:

```text
trusted vault/index
      |
exact bounds-checked byte range
      |
read-only mapped/page-backed access
      |
optional unpack/dequantize/format conversion
      |
RAM warm buffer
      |
accelerator upload/materialization
      |
backend execution
      |
cache retention or eviction under budget
```

The runtime must avoid whole-model materialization when the selected representation supports exact sparse access.

Shared/dense components that are repeatedly required should remain resident where budgets permit; only genuinely sparse/rare regions should be streamed.

## 13. Prefetch hierarchy

Predictive prefetch is valuable, but deterministic knowledge must be exploited first.

Canonical priority:

### Level 1 — deterministic requirements

Known next expert/block/tensor requirements from the admitted execution graph or fixed schedule.

### Level 2 — schedule-derived prediction

High-confidence next timestep/stage/block requirements based on model structure.

### Level 3 — learned prerouter

A small predictor estimates future expert demand from bounded runtime features.

### Level 4 — broader speculation

Only after real-device evidence proves net wall-clock/energy benefit.

Every level is capped by RAM, accelerator, flash-bandwidth, battery and thermal budgets.

## 14. BERS prerouter law

For the first BERS implementation, a learned prerouter is **prefetch advisory only**.

The authoritative model router still determines which expert actually executes.

Therefore an inaccurate prerouter initially causes only:

- cache miss;
- wasted prefetch bytes;
- additional latency.

It must not silently change model semantics or choose a different expert output.

Only a future separately trained/evaluated representation may allow predicted routing to replace authoritative routing, and such promotion requires parity/quality evidence specific to that model family.

Potential image-model prerouter features include:

- capability/task family;
- diffusion/flow timestep or stage;
- block/group identity;
- quality mode;
- bounded latent/hidden summary;
- conditioning class;
- previous routed experts;
- region/garment/identity preservation class where the model itself is trained to use such signals.

The predictor does not receive product authority or arbitrary private context merely to improve cache hits.

## 15. Recovery adapters

Adopt the useful idea behind Recover-LoRA without hard-coding LoRA as the only mechanism.

Define **BERS Recovery Adapters** as compact deltas trained to recover quality lost by storage/compute optimization, such as:

- INT8/INT4 expert quantization;
- hardware-specific packing;
- distilled compact experts;
- other bounded compression.

Candidate forms:

- LoRA;
- residual adapters;
- low-rank FFN deltas;
- scale/bias corrections;
- other compact model-specific corrections.

Recovery adapters remain separately versioned/trusted model bytes. They cannot be silently learned or updated on user devices from live outcomes.

## 16. FreeToken-derived adaptive scheduling

Use FreeToken-style system ideas as scheduling mechanisms, not as a literal LLM/CUDA port.

Evaluate:

- storage/RAM/accelerator bandwidth profiling;
- double buffering;
- asynchronous movement;
- hot/warm/cold residency;
- memory-pressure-aware cache resizing;
- heterogeneous CPU/GPU/NPU placement;
- measured overlap of transfer and compute;
- elastic resource budgets bounded by HSME admission.

The adaptive scheduler may choose **where and when** already-admitted work is materialized. It may not change **what capability was admitted** or widen LOCAL to CLOUD.

## 17. Workload-neutral architecture

MVM is model-family-neutral.

Initial intended consumers:

### HSME image/runtime path

- shared compact image core;
- Adapter-MoE;
- selective internal sparse experts;
- timestep/block/spatial routing;
- region-aware refinement experts.

### Local AEE reasoning model

A future sparse local language/reasoning model may reuse the same vault/cache/prefetch substrate, with autoregressive-specific state remaining in the model backend rather than MVM authority.

### Multimodal / voice

Large optional multimodal or voice packs may use MVM where their architecture benefits from range-addressable sparse residency. Compact always-resident voice models do not need to be forced into MVM.

MVM should not make every model sparse. Dense models remain valid when they fit and execute better resident.

## 18. Universal execution tiers

The runtime should degrade gracefully across hardware.

### P0 — Portable CPU

Mandatory reference/fallback for supported model representations where feasible. This establishes correctness independent of vendor acceleration.

### P1 — Generic GPU

Examples:

- Vulkan;
- Metal/MPS;
- CUDA;
- WebGPU.

### P2 — Vendor NPU / specialized accelerator

Examples:

- Core ML / ANE;
- Qualcomm QNN;
- MediaTek NPU;
- Samsung/Exynos NPU;
- Intel/OpenVINO NPU;
- future accepted vendor backends.

### P3 — Browser

MVM semantics over browser storage/chunking with WASM/WebGPU where feasible.

### P4 — Embedded / future devices

Supported only when memory/storage/compute evidence makes a model family meaningful.

`universal` means one architecture and capability negotiation, **not** a promise that every physical device can execute every model.

Unsupported devices fail closed or select a smaller already accepted local representation.

## 19. Automatic residency tiers

For a given model family, runtime policy may classify an execution into internal memory modes such as:

```text
RESIDENT
  most/all required weights fit warm/hot

HYBRID_RESIDENT
  shared core + common experts resident, rare experts streamed

FLASH_SPARSE
  compact resident core + aggressively bounded active expert working set
```

These are internal MVM states only. They must never replace canonical Core targets `LOCAL`, `HYBRID`, `CLOUD`, `BLOCKED`.

A larger-memory laptop may keep far more of the same logical model resident than a phone, while preserving the same model semantics and trusted representation where compatible.

## 20. Backend and representation selection

The runtime selects only from representations already accepted by DurableModelFleet and compatible with current HSME/Core admission.

Selection inputs may include:

- architecture/OS capability;
- available RAM;
- accelerator type;
- supported precision/quantization;
- dynamic gather/scatter support;
- measured storage bandwidth;
- memory pressure;
- thermal/battery state;
- model-specific evidence.

Browser or model output cannot name an arbitrary backend representation and have it trusted.

## 21. Security and correctness law

Mapped model storage creates a large low-level attack/corruption surface. Required rules:

- read-only mapping for immutable model roots;
- exact range bounds checks before any materialization;
- overflow-safe offset/length arithmetic;
- canonical index validation;
- index/shard identity bound to verified model representation;
- no arbitrary path traversal;
- no user/model/browser-controlled raw offsets;
- alignment and shape validation;
- hard caps on mapped/prefetched/resident bytes;
- fail closed on stale fleet revision, mismatched digest or missing representation;
- zero execution-time network bytes for admitted offline/local-only runs;
- deterministic evidence for every admitted movement plan;
- fuzz/property testing for parsers, indices, arithmetic and cache state machines;
- cross-language golden vectors for canonical serialization/digests.

## 22. Metrics and acceptance law

Low RAM alone is not success.

Every candidate must measure at minimum:

- installed model bytes;
- peak RAM/unified memory;
- peak accelerator memory;
- flash/SSD bytes read per inference;
- flash/SSD bytes read per stage/timestep/token where relevant;
- RAM-to-accelerator bytes;
- cache hit/miss ratio;
- accelerator cache hit ratio;
- prefetch submitted bytes;
- prefetch precision/recall where measurable;
- wasted-prefetch bytes;
- I/O stall milliseconds;
- transfer/compute overlap;
- cold latency;
- warm latency;
- energy/joules per successful result where measurable;
- battery impact;
- thermal behavior/throttling;
- quality versus resident baseline;
- failure/corruption rate;
- model-specific product quality metrics.

A useful derived metric is:

```text
bytes moved / useful compute
```

A design that uses 800 MB peak RAM but reads tens of gigabytes per small result may be rejected even if it technically runs.

## 23. Explicit non-goals

Do not make the following default architecture:

- literal Edge0 fork as BERS runtime;
- literal FreeToken fork as BERS runtime;
- Apple/MLX-only architecture;
- Android-only architecture;
- one independent cache/residency implementation per platform;
- giant dense model streamed almost completely from flash every step;
- network-backed weights during normal local inference;
- arbitrary model-generated prefetch ranges;
- one universal binary representation pretending every accelerator has the same constraints;
- universal INT4/INT2/INT1 regardless of quality/kernel evidence;
- predictive routing changing semantics before parity/quality evidence;
- cloud fallback caused by local MVM pressure under `LOCAL_ONLY`;
- using user devices for other users' workloads.

## 24. Development sequence

### MVM-0 — Contract and authority boundary

Define the universal runtime contracts without executing model bytes yet.

Required:

- `BERS_MODEL_VAULT_V1`;
- `BERS_EXPERT_INDEX_V1`;
- backend capability schema;
- residency snapshot/plan schema;
- movement evidence schema;
- exact binding to HSME-1b preparation/fleet revision;
- architecture tests proving no provider/Billing/Project/Artifact authority.

Exit: one portable memory-runtime contract exists beneath HSME.

### MVM-1 — Immutable range-addressable vault

Implement:

- verified read-only vault opening;
- bounds-checked tensor/expert ranges;
- no full-shard materialization requirement;
- deterministic index validation;
- hash/fleet binding;
- synthetic and real-pack fixtures.

Exit: one expert/tensor can be accessed without loading the full model root.

### MVM-2 — Portable CPU reference path

Implement the first correctness backend independent of phone-vendor acceleration.

Goals:

- materialize one selected range;
- execute a bounded real operator/expert path;
- compare elementwise/metric parity with resident reference;
- prove exact memory/movement accounting.

Exit: correctness does not depend on Apple/Android vendor APIs.

### MVM-3 — Cross-platform physical storage/movement probes

Run at least:

- one physical Apple mobile device;
- one physical Android device from a materially different vendor/runtime family;
- one desktop/native environment.

Measure real mapping/range-read latency, bandwidth, page/cache behavior, RAM peaks and thermal/battery signals where available.

This is a storage/materialization probe, not yet proof of a production large model.

Exit: the portable contract is proven on multiple real OS/hardware families.

### MVM-4 — Byte-budgeted RAM and accelerator cache

Implement:

- global byte budgets;
- deterministic LRU baseline;
- separate prefetch staging budget;
- hot/warm/cold evidence;
- exact cache/movement counters;
- resource-pressure shrink/eviction behavior.

Exit: peak working memory stays bounded under repeated/alternating expert demand.

### MVM-5 — Deterministic prefetch and double buffering

Use known graph/stage requirements to overlap storage movement with current compute.

Prove:

- same numerical/model result as no-prefetch reference;
- reduced I/O stall or wall-clock latency;
- bounded extra bytes;
- no budget overrun.

Exit: prefetch benefit exists without learned prediction.

### MVM-6 — Universal compute-backend adapters

Establish a minimum backend matrix rather than one preferred vendor path.

Research/prove as available:

- portable CPU;
- Apple GPU/NPU path;
- Android generic GPU path;
- at least one Android vendor NPU path;
- desktop accelerator path;
- browser path where the model representation is meaningful.

Existing frameworks such as ExecuTorch/ONNX Runtime may be adapters, not owners of MVM policy.

Exit: the same logical MVM contracts survive backend substitution.

### MVM-7 — HSME sparse image integration

Integrate with Adapter-MoE/selective sparse image blocks.

A/B compare:

- resident baseline;
- MVM without prefetch;
- MVM with deterministic prefetch;
- multiple memory budgets.

Measure quality, RAM, accelerator memory, bytes moved, latency, energy and thermal behavior.

Exit: MVM proves value on the primary BERS image workload rather than only LLM-style experts.

### MVM-8 — Learned prerouter

Train/evaluate an advisory prefetch predictor.

Compare:

```text
A. no prefetch
B. deterministic/schedule prefetch
C. deterministic + learned prerouter
```

Promotion requires measurable net benefit in wall-clock/energy/bytes moved after accounting for wasted speculation.

Exit: learned prediction is retained only if it beats deterministic policy on real devices.

### MVM-9 — Quantization recovery adapters

Test compact recovery adapters against high-precision/distilled teachers for model families where aggressive quantization is useful.

No universal precision target is assumed.

Exit: a recovery mechanism is accepted only if it improves quality/resource tradeoff on BERS metrics.

### MVM-10 — Local AEE / multimodal reuse

After the image/runtime path is proven, reuse the same MVM substrate for a suitable sparse local reasoning or multimodal model.

Do not introduce a second LLM-specific model-memory authority.

Exit: one MVM substrate serves more than one model family without weakening isolation.

### MVM-11 — Production qualification

For each production model/backend/device class require:

- exact representation identity and license/provenance;
- real-device quality/performance evidence;
- memory/storage/movement budgets;
- thermal/battery qualification;
- recovery under app restart/background/memory pressure;
- offline/LOCAL_ONLY no-network proof;
- rollout/kill-switch compatibility;
- supported-device class declaration.

No architecture-level success automatically promotes a model to production.

## 25. Pre-RC cut line

Before `BERS_V1_RC`, this companion roadmap should not require every MVM phase to reach production. The minimum architectural/evidence target is:

- MVM-0 contract and authority boundary accepted;
- MVM-1 range-addressable immutable vault proven;
- MVM-2 portable correctness reference proven;
- MVM-3 physical Apple + Android storage/materialization evidence recorded, or a precise blocker documented;
- MVM-4 bounded cache/movement accounting implemented far enough to validate the memory model;
- integration with existing HSME-1b resource/evidence contracts preserved;
- no production claim based only on desktop/browser simulation.

Advanced prerouting/recovery/model-family promotion may continue as R&D if the pre-RC evidence above is complete and no enabled product surface falsely advertises unsupported capability.

## 26. Acceptance matrix

Every substantial MVM/runtime expansion must prove the relevant items below:

- same trusted root/index produces deterministic range identities;
- out-of-bounds/overflow/misaligned range requests fail closed;
- stale fleet revision or representation digest fails closed;
- model/browser input cannot choose arbitrary storage ranges;
- total cache/staging bytes never exceed admitted budget;
- eviction cannot corrupt an in-flight execution;
- prefetch buffer cannot evict required active state incorrectly;
- failed/cancelled execution releases reservations/buffers correctly;
- `LOCAL_ONLY` has zero execution-time network bytes;
- unsupported backend falls back only to an already accepted local representation/path or blocks;
- no backend can create provider/Billing/Project/Artifact authority;
- portable CPU/reference result and accelerated result meet model-specific parity thresholds;
- cold/warm/cache-hit accounting matches measured movement;
- learned prefetch does not change semantic routing in its initial advisory mode;
- restart/memory-pressure recovery does not reuse stale model/fleet identity;
- physical mobile evidence includes at least RAM, storage/movement, latency and thermal/battery observations where platform APIs permit.

## 27. Long-term product shape

This architecture enables two optional local-AI product profiles without changing Core semantics.

### Compact Local AI

- small initial AI download;
- mostly resident compact models;
- minimal storage commitment;
- broad device support.

### Extended Local AI / Expert Vault

- larger optional installed model capacity;
- sparse/range-addressable execution;
- bounded RAM/accelerator working set;
- richer local capabilities on devices with sufficient storage/bandwidth/thermal envelope.

The user may choose more local model storage without requiring equivalent RAM capacity.

The long-term engineering objective is not a fixed numeric promise such as "20 GB model in 1 GB RAM". The objective is a measurable invariant:

> **Total trusted local model capacity may substantially exceed active memory, while working-set size, bytes moved, quality, latency, energy and thermal behavior remain within the declared device-class budget.**

## 28. Final architecture summary

The selected BERS local runtime stack is:

```text
BERS Agentic Execution Engine / Product
              |
          Core admission
              |
             HSME
              |
      HSME_PREPARATION_V1
              |
              v
BERS Universal Local AI Runtime
              |
      Model Virtual Memory
              |
   +----------+-----------+
   |                      |
Expert Vault         Residency Planner
Flash/SSD                 |
   |              deterministic prefetch
byte ranges        + learned advisory prerouter
   |                      |
   +----------+-----------+
              |
       RAM warm cache
              |
     accelerator hot cache
              |
      Compute Backend ABI
   +----------+-----------+----------------+
   |          |           |                |
 CPU       GPU APIs      NPU APIs         Web
   |          |           |                |
Apple / Android / Windows / Linux / Browser / future devices
```

Architecture slogan:

> **AEE decides what to propose. Core decides what is allowed. HSME decides how admitted local AI is composed. MVM decides where trusted model bytes live and when they move. Backends decide how those bytes execute on the available hardware.**

This separation is mandatory because it lets BERS adopt better model architectures, vendor runtimes and hardware without recreating execution authority or model-memory policy for every platform.
