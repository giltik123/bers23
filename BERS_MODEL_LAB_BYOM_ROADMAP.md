# BERS Model Lab / BYOM Roadmap

**Status: CANONICAL R&D COMPANION / NO PRODUCTION AUTHORITY**

This document defines **BERS Model Lab** as a distinct environment under the BERS brand for opening, inspecting, validating, benchmarking, optimizing, running, and optionally integrating user-owned AI models. Its internal import/runtime layer is **BERS BYOM — Bring Your Own Model**.

Model Lab is deliberately separate from the ordinary BERS Studio/Editor experience, but it is **not** a second execution stack. It reuses canonical Core admission, AEE boundaries, HSME, the BERS Universal Local AI Runtime, Model Virtual Memory (MVM), resource evidence, and existing Artifact/Project authority.

Imported models never gain platform trust merely because they can be parsed or executed.

## 1. Product decision

BERS will expose three related product surfaces under one brand:

```text
BERS
|
+-- BERS Studio
|   Editor / Fashion / Try-On / Wardrobe / creation
|
+-- BERS Agent
|   AEE / Planner / Voice
|
+-- BERS Model Lab
    |
    +-- BYOM
    +-- Model Inspector
    +-- User Model Vault
    +-- Runtime Playground
    +-- Benchmark Lab
    +-- Model Optimizer
    +-- Custom Capability Builder
    +-- BERS Integration
```

Product law:

> **Model Lab is a separate technical environment, not a separate runtime or authority system.**

Studio remains creator-first and hides tensor/runtime details unless explicitly requested. Model Lab is the advanced surface for users, developers, researchers, and internal BERS qualification work.

## 2. Shared platform architecture

```text
BERS Studio              BERS Model Lab
     |                         |
     +------------+------------+
                  |
             BERS Core
                  |
                 AEE
                  |
                 HSME
                  |
      Universal Local AI Runtime
                  |
                 MVM
                  |
          CPU / GPU / NPU / Web
```

Model Lab must not create:

- a second execution queue;
- a second provider registry;
- a second model-provenance authority;
- a second Billing authority;
- a parallel Project lifecycle;
- a parallel Artifact acceptance path.

## 3. Trust classes

BERS-owned production models and user-imported models are separate trust classes.

### 3.1 BERS production model

Typical state:

```text
SIGNED
VERIFIED
PROMOTED
SUPPORTED
```

DurableModelFleet and existing model-promotion evidence remain authoritative.

### 3.2 User model

Typical state:

```text
USER_IMPORTED
LOCALLY_HASHED
LOCALLY_VALIDATED
UNTRUSTED_FOR_PLATFORM_AUTHORITY
```

A user model may be runnable without becoming BERS-supported, globally trusted, or eligible to replace a canonical production capability.

## 4. User Model Vault

Create a private **User Model Vault** separate from DurableModelFleet production authority.

Conceptual identity:

```text
BERS_USER_MODEL_V1

contentSha256
sourceFormat
architecture
parameterMetadata
tensorMetadata
quantization
installedBytes
capabilityClaims
ownerScope
validationStatus
backendCompatibility
conversionProvenance
createdAt
```

The canonical identity is content-derived. File names are display metadata only.

`my-model.gguf` is not an identity. A validated content digest is.

The User Model Vault must never silently activate or promote a model into DurableModelFleet.

## 5. Import quarantine

Every imported model begins in quarantine.

```text
User file / local directory
        |
        v
Import Quarantine
        |
        +-- hash
        +-- format detection
        +-- bounds/structure validation
        +-- architecture detection
        +-- metadata normalization
        +-- compatibility analysis
        |
        v
User Model Manifest
```

No imported model may execute before the selected safe import path succeeds.

Quarantine is a data/trust boundary, not merely a UI label.

## 6. Safe-format policy

Initial safe/data-oriented formats should be prioritized, including:

- safetensors;
- GGUF;
- ONNX;
- BERS Model Vault representations;
- other separately reviewed non-executable model formats.

Formats that may embed executable deserialization behavior, arbitrary Python, native libraries, custom operators, scripts, or remote code require an isolated conversion/validation path.

Arbitrary `.pt` / `.pth` files must not be treated as safe data simply because they are called model checkpoints.

## 7. No automatic remote-code execution

Imported model repositories must never automatically gain code execution.

Forbidden default behavior includes:

- arbitrary Python shipped with a model;
- automatic `trust_remote_code`;
- shell scripts from imported packages;
- arbitrary native shared libraries from a model directory;
- model-defined filesystem paths outside the approved import root;
- model-defined network endpoints;
- arbitrary custom operators loaded into the main BERS process.

If conversion requires code, it must occur in a separately reviewed isolated conversion environment with explicit user intent and bounded immutable outputs.

The preferred result is a safe BERS-compatible data representation.

## 8. Model Inspector first

The first BYOM capability should be **Open / Inspect**, not Execute.

Inspector may report:

```text
format
architecture
parameter count where derivable
tensor count
experts / routing structure
precision / quantization
installed size
metadata
tokenizer / text encoder presence
known backend compatibility
MVM streamability
unsupported operators
security warnings
```

Inspector is read-only and does not assign trusted platform capability.

## 9. Compatibility result

Model Lab should derive a typed result such as:

```text
SUPPORTED_RESIDENT
SUPPORTED_MVM
SUPPORTED_AFTER_CONVERSION
INSPECT_ONLY
UNSUPPORTED
BLOCKED_UNSAFE_FORMAT
```

Compatibility is based on actual architecture/operators/representation and current device capabilities, not filename extensions.

Unknown architecture fails closed to inspection-only rather than speculative execution.

## 10. Runtime modes

For a supported model, Model Lab may expose MVM execution profiles:

```text
RESIDENT
HYBRID_RESIDENT
FLASH_SPARSE
```

These are runtime states only. Canonical Core targets remain:

```text
LOCAL
HYBRID
CLOUD
BLOCKED
```

Model Lab must never introduce alternative policy values into Core.

## 11. Runtime Playground

Model Lab should provide an explicit experimentation surface where a user can compare accepted runtime strategies for the same representation.

Example:

```text
                    Resident       Flash Sparse
Peak RAM              7.8 GB          2.1 GB
Installed bytes       8.2 GB          8.2 GB
Cold latency          4.1 s           6.3 s
Flash read            0.4 GB          2.7 GB
Energy                 ...             ...
Quality                ...             ...
```

The platform still enforces hard RAM/storage/thermal/battery bounds.

## 12. Benchmark Lab

Benchmark evidence should expose real resource behavior rather than parameter-count marketing.

Measure where available:

- installed bytes;
- peak RAM/unified memory;
- accelerator memory;
- flash/SSD bytes read;
- RAM-to-accelerator movement;
- cache hit/miss ratio;
- I/O stall;
- cold/warm latency;
- workload-appropriate throughput;
- battery/energy observations;
- thermal behavior;
- parity/quality against a chosen reference where meaningful.

Evidence must be bound to model digest, derived representation digest, device class, backend, runtime version, and benchmark configuration.

## 13. Model Optimizer

Model Lab may create explicit derived representations.

Possible profiles:

```text
Original
Balanced
Compact
Flash Sparse
```

Candidate transformations may include:

- mixed precision;
- INT8/INT4 where supported;
- architecture-specific packing;
- deduplication;
- graph optimization;
- backend-specific compilation;
- sparse/vault indexing when the architecture supports it;
- bounded recovery adapters where separately trained/validated.

Every transformation preserves provenance:

```text
source digest
converter version
conversion settings
output digest
backend/runtime target
measured parity/quality evidence if available
```

The source representation is never silently replaced.

## 14. Dual-budget model efficiency

Model Lab follows `BERS_LOCAL_MODEL_EFFICIENCY_POLICY.md`.

For every imported or derived representation, storage and working memory remain separate budgets.

Show at minimum:

- source installed bytes;
- derived installed bytes;
- additional cache/compiled bytes;
- estimated/measured working memory;
- movement tradeoffs;
- first-use conversion/download cost where relevant.

MVM is not a justification for unnecessary storage growth.

## 15. MVM integration

A safe range-addressable user representation may use the same MVM substrate as BERS-owned models.

```text
User Model Vault
      |
validated local representation
      |
MVM index / residency plan
      |
Flash -> RAM -> Accelerator
      |
accepted compute backend
```

MVM is neutral to ownership of the bytes. Trust class and capability authority remain distinct above it.

## 16. Capability claims

Imported models may expose claims from multiple sources:

```text
USER_DECLARED
BERS_INFERRED
BENCHMARK_OBSERVED
```

None automatically means:

```text
BERS_PRODUCTION_TRUSTED
```

A model claiming `try-on`, `image-generation`, or `agent` in metadata must not become the canonical provider merely because that string exists.

## 17. Custom Capability Binding

Advanced users may explicitly bind a validated model to a private/custom workflow capability.

```text
User Model
    |
Custom Capability Binding
    |
user/workspace-scoped Capability Registry entry
    |
Core admission
    |
HSME / Universal Runtime
```

Candidate private capabilities may include:

- image generation;
- inpainting;
- upscaling;
- experimental Try-On;
- local reasoning;
- speech recognition/synthesis;
- embeddings/classification;
- custom bounded inference.

The binding is scoped to the owning user/workspace and never widens global platform authority.

## 18. `Add to BERS` law

`Add to BERS` means create a typed, user-scoped integration. It does **not** mean promote the model.

Studio consumes a stable capability contract and must not know how the imported model is stored, quantized, streamed, or executed.

Model-specific technical controls remain in Model Lab.

## 19. Product UX separation

BERS Studio remains optimized for creators and ordinary users.

BERS Model Lab targets advanced users, developers, researchers, and BERS internal qualification workflows.

Suggested surface:

```text
My Models
|
+-- Open model
+-- Inspect
+-- Benchmark
+-- Optimize
+-- Run
+-- Add to BERS
+-- Remove
```

Advanced information may include:

```text
Storage
Working RAM
Backend
Precision
Runtime mode
Throughput / latency
Compatibility
Quality/parity evidence
Last used
```

## 20. Internal BERS use

Model Lab should also serve as the internal R&D frontend for HSME/MVM model qualification.

Modes remain permission-separated:

```text
USER MODE
open / inspect / run / optimize

DEVELOPER MODE
profiling / routing / tensor inspection / benchmark evidence

BERS INTERNAL
promotion evidence / golden eval / supported-device qualification
```

The internal surface may prepare evidence, but production promotion remains owned by existing lifecycle authority.

## 21. Optional future community layer

A future BERS Model Catalog may distribute discoverable model/adapters, but it is not required for BYOM v1.

Any future catalog must visually and technically distinguish:

```text
BERS VERIFIED
COMMUNITY
LOCAL IMPORT
```

Community publication must never collapse into production trust.

## 22. Network/privacy law

Opening and running a local user model must not silently upload:

- model weights;
- model metadata beyond explicitly required service calls;
- prompts/inputs;
- generated results.

`LOCAL_ONLY` remains zero-network during execution.

Remote acquisition, conversion, or benchmark services require explicit separately admitted behavior.

## 23. Resource law

A user-imported model is not entitled to exhaust the host device.

Before execution, Model Lab must respect bounded evidence for:

- RAM;
- accelerator memory;
- storage;
- thermal state;
- battery state;
- background restrictions;
- expected movement/read amplification;
- backend support.

If safe execution cannot be admitted, the model remains inspectable but blocked from execution.

## 24. Failure law

Failures must remain explicit and non-destructive.

Examples:

```text
UNSUPPORTED_ARCHITECTURE
UNSAFE_FORMAT
CORRUPT_MODEL
HASH_CHANGED
INSUFFICIENT_STORAGE
INSUFFICIENT_RAM
BACKEND_UNAVAILABLE
UNSUPPORTED_OPERATOR
CONVERSION_FAILED
THERMAL_BLOCKED
```

A failure to run locally must not silently switch to paid cloud execution.

## 25. BYOM roadmap

### BYOM-0 — Trust / isolation contract

Define `BERS_USER_MODEL_V1`, quarantine state, content identity, ownership, and no-production-authority law.

Exit: imported bytes cannot masquerade as a BERS-promoted model.

### BYOM-1 — Model Inspector

Read-only safe inspection for the first supported data formats.

Exit: users can open a model and receive deterministic structure/compatibility information without execution.

### BYOM-2 — Safe import formats

Initial target families:

- safetensors;
- GGUF;
- ONNX;
- BERS Model Vault.

Exit: import path is bounds-checked, hash-bound, fuzz-tested, and non-executable by default.

### BYOM-3 — User Model Vault

Private persistent identity/versioning, derived-representation provenance, storage accounting, deletion, and stale-content detection.

Exit: repeat use does not require reparsing/reconversion without cause.

### BYOM-4 — Universal Runtime execution

Run one supported imported dense model through a portable accepted backend and resource admission path.

Exit: BYOM execution reuses the shared runtime rather than a new local engine.

### BYOM-5 — MVM integration

Run one safe sparse/range-addressable imported model under bounded `RESIDENT`, `HYBRID_RESIDENT`, or `FLASH_SPARSE` evidence.

Exit: a user model can exceed working RAM without bypassing MVM budgets.

### BYOM-6 — Model Optimizer

Create immutable derived representations with conversion provenance and parity/resource evidence.

Exit: source and optimized representations remain distinguishable and reversible at the catalog level.

### BYOM-7 — Custom Capability Binding

Allow explicit user/workspace-scoped bindings into canonical Core/AEE paths.

Exit: `Add to BERS` works without global promotion.

### BYOM-8 — Model Lab product surface

Ship the separate Model Lab environment with My Models, Inspector, Benchmark, Runtime Playground, Optimizer, and integration controls.

Exit: technical model workflows no longer overload the Studio Editor UX.

### BYOM-9 — Advanced adapters / expert packs

Support safe user-owned LoRA/adapters/expert packs where architecture and trust rules permit composition.

Exit: composition remains hash/provenance-bound and cannot inject arbitrary executable code.

### BYOM-10 — Internal qualification convergence

Reuse Model Lab benchmarking/inspection primitives for BERS internal model qualification without exposing promotion controls to normal users.

Exit: one evidence surface supports both BYOM and BERS R&D while authority remains separated.

## 26. Initial acceptance matrix

Before BYOM execution is considered accepted, prove relevant items:

- file name is never canonical identity;
- digest change invalidates cached validation/derived bindings;
- malformed lengths/offsets/shapes fail closed;
- unsupported architecture remains inspect-only;
- unsafe executable formats do not run in the main process;
- no automatic remote code execution;
- user model cannot mutate DurableModelFleet production state;
- capability metadata cannot bypass Core admission;
- user model cannot create provider/Billing/Project/Artifact authority;
- resource budgets are enforced before materialization;
- `LOCAL_ONLY` produces zero execution-time network bytes;
- derived representations preserve source/converter/output provenance;
- deletion removes user-owned persisted model state without touching BERS-owned fleet roots;
- backend fallback occurs only among accepted local paths;
- MVM measurements remain bound to the exact user-model/representation digest.

## 27. Relationship to BERS Model Efficiency

For BERS-owned models, compactness remains a design obligation.

For user-owned models, BERS does not control the original architecture, but should still expose storage-efficient derived representations when safe and useful.

Therefore:

> **BERS-owned models: make them as compact as quality permits. User-owned models: run them as efficiently as the architecture permits, while offering transparent optimization rather than silently changing them.**

## 28. Relationship to AEE

AEE may reason about a user-bound capability only after the binding exists and Core admits it.

AEE does not parse arbitrary model files, choose raw tensor ranges, trust user metadata, or promote a model.

The architecture remains:

```text
AEE decides what to propose.
Core decides what is allowed.
HSME decides how admitted local AI is composed.
MVM decides where trusted model bytes live and when they move.
Model Lab/BYOM decides how user-owned model bytes are safely imported, inspected, represented, and explicitly bound.
Backends decide how accepted bytes execute on hardware.
```

## 29. Branding decision

The selected product name is **BERS Model Lab**.

`BYOM` remains the technical architecture/workstream name inside Model Lab.

This avoids presenting a technical acronym as the whole consumer brand while preserving a clear engineering boundary.

Suggested positioning:

```text
BERS Studio     — Create with AI.
BERS Agent      — Control AI.
BERS Model Lab  — Run your AI.
```

Marketing wording is non-authoritative and may change without altering the architecture.

## 30. Final decision

BERS Model Lab is a separate environment under one BERS brand, backed by the same canonical platform and runtime.

It should make BERS extensible enough to open and run user-owned models without turning arbitrary model files into trusted executable extensions or creating a second local-AI architecture.
