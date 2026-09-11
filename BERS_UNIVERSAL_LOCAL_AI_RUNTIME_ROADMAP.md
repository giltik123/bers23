# BERS Universal Local AI Runtime Roadmap

**Status: CANONICAL R&D COMPANION / NO PRODUCTION AUTHORITY**

This document defines the selected long-term runtime architecture for running model families whose installed size may materially exceed the working RAM available on the device. It is a companion to `BERS_HYBRID_SPARSE_MOBILE_ENGINE_ROADMAP.md`, Stage E of `BERS_V1_DEVELOPMENT_ROADMAP.md`, the accepted HSME-1/HSME-1b control-plane and preparation/residency contracts, `BERS_LOCAL_MODEL_EFFICIENCY_POLICY.md`, and `BERS_MODEL_LAB_BYOM_ROADMAP.md`.

It does **not** replace HSME, Core admission, DurableModelFleet, Artifact authority, Billing authority, AEE, or existing model-specific acceptance programs. It defines a lower-level local model-memory and execution substrate beneath already admitted local work.

The selected design combines BERS-owned architecture with evidence-driven ideas from Edge0-style sparse streaming and FreeToken-style adaptive memory scheduling, without making either external framework a runtime authority or mandatory dependency.

## 1. Canonical decision

BERS will build one **platform-independent Universal Local AI Runtime** with a shared **Model Virtual Memory (MVM)** layer rather than separate Apple, Android, desktop, browser, LLM, image, or BYOM runtimes.

Two independent product/resource laws apply:

> **Installed model capacity and peak working memory are separate resources.**

> **MVM is not permission to make BERS-owned models unnecessarily large. Storage footprint and working-memory footprint are both first-class acceptance budgets.**

A model family may occupy several gigabytes or more on verified local storage while only a bounded active subset is materialized into RAM and accelerator memory for the current execution stage, but BERS-owned models must still follow the compact-first optimization policy in `BERS_LOCAL_MODEL_EFFICIENCY_POLICY.md`.

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

User-owned models may reach this runtime only through the separate trust/import rules of `BERS_MODEL_LAB_BYOM_ROADMAP.md`; BYOM does not create a parallel runtime.

## 2. Why this design was selected

Three realistic approaches were considered.

### 2.1 Direct Edge0 dependency

Advantages:

- fastest way to reproduce current sparse-MoE experiments;
- existing mmap expert access, cache, prerouter and quantized expert execution.

Rejected as the canonical BERS architecture because:

- the current reference implementation is materially model/backend-specific;
- its abstractions are primarily autoregressive-MoE-oriented;
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

The index is untrusted until bound to a DurableModelFleet-verified representation or, for user-owned models, a locally validated User Model Vault representation governed by `BERS_MODEL_LAB_BYOM_ROADMAP.md`.

MVM may never accept arbitrary model-generated or browser-generated file paths, offsets, lengths or tensor identities.

### 6.2 Trust boundary

`DurableModelFleet` remains the authority for BERS production model identity, lifecycle and promotion.

For BERS-owned models it owns:

- model identity/version;
- URI/acquisition source;
- hash/integrity;
- platform/runtime metadata;
- lifecycle state;
- promotion/quarantine evidence.

User-owned models remain a distinct trust class in the User Model Vault and cannot be promoted merely by reaching MVM.

MVM only performs range access inside bytes that the appropriate upper trust layer already established as immutable and valid for the current local execution.

For materially different layouts or hardware-specific weight representations, current fleet/user-representation identity rules require distinct immutable identity and evidence.

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

Potential adapters include portable CPU paths, ExecuTorch/ONNX Runtime adapters, Apple Metal/MPS/Core ML, Android Vulkan, Qualcomm QNN, MediaTek/Samsung NPU paths, CUDA, OpenVINO, WebGPU/WASM, and future accepted accelerators.

No backend may become model-provenance or execution-policy authority.

## 9. Reference portable core implementation

The architecture is language-neutral, but the preferred implementation strategy is:

- a memory-safe portable native MVM core where practical;
- stable C ABI at backend/application boundaries;
- thin vendor-specific adapters in the language/toolchain required by that platform;
- canonical cross-language schema/golden vectors shared with existing TypeScript HSME contracts.

A Rust core with stable C ABI is the preferred first research candidate for byte-range/index/cache/residency logic because it can target iOS, Android, Windows, Linux and WebAssembly while reducing unsafe mapped-memory parsing surface. C++ backend shims remain acceptable where vendor SDKs or mature runtimes require them.

This language choice is an implementation default, not architecture authority. If measured integration or binary constraints invalidate it, a C++ portable core may replace it without changing MVM schemas or semantics.

## 10. Dual-budget accounting

Every MVM-compatible representation must expose both a bounded working-memory model and an installed-storage model.

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

A large installed model is useful only if peak working memory and bytes moved remain within device budgets **and** the added installed/download footprint is justified against smaller alternatives.

BERS-owned model candidates must be evaluated under `BERS_LOCAL_MODEL_EFFICIENCY_POLICY.md` before MVM is treated as justification for a larger representation.

## 11. Byte-budgeted global cache

The canonical BERS cache is **byte-budgeted**, not only slot-counted.

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

Therefore an inaccurate prerouter initially causes only cache miss, wasted prefetch bytes, or additional latency. It must not silently change model semantics.

Only a future separately trained/evaluated representation may allow predicted routing to replace authoritative routing, and such promotion requires parity/quality evidence specific to that model family.

## 15. Recovery adapters

Define **BERS Recovery Adapters** as compact deltas trained to recover quality lost by storage/compute optimization such as quantization, hardware-specific packing, or distilled compact experts.

Candidate forms include LoRA, residual adapters, low-rank FFN deltas, scale/bias corrections, and other compact model-specific corrections.

Recovery adapters remain separately versioned/trusted model bytes. They cannot be silently learned or updated on user devices from live outcomes.

## 16. FreeToken-derived adaptive scheduling

Use FreeToken-style system ideas as scheduling mechanisms, not as a literal LLM/CUDA port.

Evaluate storage/RAM/accelerator bandwidth profiling, double buffering, asynchronous movement, hot/warm/cold residency, memory-pressure-aware cache resizing, heterogeneous CPU/GPU/NPU placement, measured overlap of transfer and compute, and elastic resource budgets bounded by HSME admission.

The adaptive scheduler may choose **where and when** already-admitted work is materialized. It may not change **what capability was admitted** or widen LOCAL to CLOUD.

## 17. Workload-neutral architecture

MVM is model-family-neutral.

Initial intended consumers include:

- HSME image/runtime models;
- future sparse local AEE reasoning models;
- suitable multimodal/voice models;
- safely imported user-owned models admitted through BERS Model Lab/BYOM.

MVM should not make every model sparse. Dense models remain valid when they fit and execute better resident.

## 18. Universal execution tiers

The runtime should degrade gracefully across hardware.

- **P0 — Portable CPU:** correctness/fallback where feasible.
- **P1 — Generic GPU:** Vulkan, Metal/MPS, CUDA, WebGPU or equivalent accepted paths.
- **P2 — Vendor NPU/specialized accelerator:** Core ML/ANE, QNN, MediaTek, Samsung/Exynos, OpenVINO NPU and future accepted backends.
- **P3 — Browser:** MVM semantics over browser storage/chunking with WASM/WebGPU where meaningful.
- **P4 — Embedded/future devices:** only when memory/storage/compute evidence makes the model family meaningful.

`universal` means one architecture and capability negotiation, **not** a promise that every physical device can execute every model.

Unsupported devices fail closed or select a smaller already accepted local representation.

## 19. Automatic residency tiers

For a given model family, runtime policy may classify an execution into internal memory modes such as:

```text
RESIDENT
HYBRID_RESIDENT
FLASH_SPARSE
```

These are internal MVM states only. They must never replace canonical Core targets `LOCAL`, `HYBRID`, `CLOUD`, `BLOCKED`.

## 20. Backend and representation selection

The runtime selects only from representations already accepted by the relevant trust layer and compatible with current HSME/Core admission.

Selection inputs may include architecture/OS capability, RAM, accelerator type, supported precision/quantization, dynamic gather/scatter support, measured storage bandwidth, memory pressure, thermal/battery state, and model-specific evidence.

Browser or model output cannot name an arbitrary backend representation and have it trusted.

## 21. Security and correctness law

Mapped model storage creates a low-level attack/corruption surface. Required rules include read-only mapping, exact range bounds checks, overflow-safe arithmetic, canonical index validation, trusted parent binding, no arbitrary path traversal, no model/browser-controlled raw offsets, alignment/shape validation, hard byte caps, fail-closed stale identity handling, zero execution-time network for admitted LOCAL_ONLY work, deterministic movement evidence, fuzz/property tests, and cross-language golden vectors.

User-imported model code is governed by the stricter quarantine/no-remote-code rules in `BERS_MODEL_LAB_BYOM_ROADMAP.md`.

## 22. Metrics and acceptance law

Low RAM alone is not success.

Every candidate must measure at minimum:

- first-use/download bytes where applicable;
- mandatory/optional installed model bytes;
- peak RAM/unified memory;
- peak accelerator memory;
- flash/SSD bytes read per inference;
- flash/SSD bytes read per stage/timestep/token where relevant;
- RAM-to-accelerator bytes;
- cache hit/miss ratio;
- accelerator cache hit ratio;
- prefetch submitted/wasted bytes;
- prefetch precision/recall where measurable;
- I/O stall milliseconds;
- transfer/compute overlap;
- cold/warm latency;
- energy/joules per successful result where measurable;
- battery impact;
- thermal behavior/throttling;
- quality versus resident baseline;
- failure/corruption rate;
- model-specific product quality metrics.

Useful derived metrics include `bytes moved / useful compute`, `quality / installed GB`, and `capability coverage / installed GB`.

A design that uses little RAM but reads excessive flash or occupies excessive user storage without corresponding value may be rejected.

## 23. Explicit non-goals

Do not make the following default architecture:

- literal Edge0 fork as BERS runtime;
- literal FreeToken fork as BERS runtime;
- Apple/MLX-only architecture;
- Android-only architecture;
- one independent cache/residency implementation per platform;
- a separate BYOM runtime;
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
Define `BERS_MODEL_VAULT_V1`, `BERS_EXPERT_INDEX_V1`, backend capability schema, residency snapshot/plan, movement evidence, exact HSME-1b binding, and authority tests.

### MVM-1 — Immutable range-addressable vault
Prove bounds-checked exact range access without whole-root materialization.

### MVM-2 — Portable CPU reference path
Execute one bounded real operator/expert path and prove parity/movement accounting independent of vendor APIs.

### MVM-3 — Cross-platform physical storage/movement probes
Run physical Apple mobile, materially different Android, and desktop/native probes; record latency, bandwidth, page/cache behavior, RAM and thermal/battery observations where available.

### MVM-4 — Byte-budgeted RAM and accelerator cache
Implement global byte budgets, deterministic LRU baseline, separate prefetch staging, hot/warm/cold evidence, exact counters, and pressure shrink/eviction behavior.

### MVM-5 — Deterministic prefetch and double buffering
Overlap known movement with compute without changing model results or exceeding budgets.

### MVM-6 — Universal compute-backend adapters
Prove the same logical MVM contracts across portable CPU, Apple, Android generic GPU, at least one Android NPU family, desktop accelerator and meaningful browser paths.

### MVM-7 — HSME sparse image integration
A/B resident vs MVM no-prefetch vs deterministic-prefetch across multiple memory budgets on primary image workloads.

### MVM-8 — Learned prerouter
Compare no prefetch vs deterministic vs deterministic+learned; retain only if wall-clock/energy/bytes evidence improves on real devices.

### MVM-9 — Quantization recovery adapters
Accept only recovery mechanisms that improve BERS quality/resource tradeoffs.

### MVM-10 — Local AEE / multimodal / BYOM reuse
Reuse the same MVM substrate across additional model families and safely admitted user models without introducing another memory authority.

### MVM-11 — Production qualification
Require exact identity/provenance, real-device evidence, memory/storage/movement budgets, thermal/battery qualification, restart/memory-pressure recovery, offline proof, rollout/kill-switch compatibility, and supported-device declarations.

## 25. Pre-RC cut line

Before `BERS_V1_RC`, this companion roadmap should not require every MVM phase to reach production. Minimum architectural/evidence target:

- MVM-0 accepted;
- MVM-1 proven;
- MVM-2 portable correctness proven;
- MVM-3 physical Apple + Android materialization evidence recorded or exact blocker documented;
- MVM-4 bounded cache/movement accounting implemented far enough to validate the memory model;
- HSME-1b resource/evidence contracts preserved;
- local-model storage efficiency policy preserved;
- no production claim based only on desktop/browser simulation.

Advanced prerouting/recovery/model-family promotion and Model Lab execution may continue as R&D where their separate acceptance tracks are incomplete.

## 26. Acceptance matrix

Every substantial MVM/runtime expansion must prove relevant items including deterministic range identity, fail-closed bounds/overflow/alignment validation, stale identity rejection, cache/staging byte bounds, safe eviction/cancellation, zero execution-time network for LOCAL_ONLY, backend fallback only to accepted local paths, no provider/Billing/Project/Artifact authority, reference/accelerated parity, accurate movement accounting, advisory prerouter semantic neutrality, restart/memory-pressure freshness, and physical mobile evidence.

## 27. Long-term product shape

This architecture enables two optional local-AI profiles without changing Core semantics.

### Compact Local AI

- small initial AI download;
- mostly resident compact models;
- minimal storage commitment;
- broad device support;
- default for BERS-owned models.

### Extended Local AI / Expert Vault

- larger optional installed model capacity;
- sparse/range-addressable execution;
- bounded RAM/accelerator working set;
- richer local capabilities on devices with sufficient storage/bandwidth/thermal envelope;
- justified only by measurable quality/capability/privacy/cloud-avoidance value.

The user may choose more local model storage without requiring equivalent RAM capacity, but large installed capacity is never the optimization target by itself.

The engineering invariant is:

> **Total trusted local model capacity may substantially exceed active memory, while installed footprint, working-set size, bytes moved, quality, latency, energy and thermal behavior all remain within declared product/device budgets.**

## 28. Model Lab / BYOM relationship

BERS Model Lab is a separate branded environment for user-owned models, defined in `BERS_MODEL_LAB_BYOM_ROADMAP.md`.

It reuses MVM rather than creating a new one:

```text
BERS-owned model ---- DurableModelFleet ----+
                                          |
User-owned model ---- User Model Vault -----+--> HSME/Core-admitted local path --> MVM --> backend
```

The trust classes remain different even though the low-level memory substrate can be shared.

## 29. Final architecture summary

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

Architecture law:

> **AEE decides what to propose. Core decides what is allowed. HSME decides how admitted local AI is composed. MVM decides where trusted model bytes live and when they move. Model Lab/BYOM safely imports and binds user-owned model bytes without promoting them. Backends decide how accepted bytes execute on available hardware.**
