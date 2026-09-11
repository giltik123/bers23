# BERS Model Lab / BYOM Roadmap

**Status: CANONICAL R&D COMPANION / NO PRODUCTION AUTHORITY**

Tracking issue: **#563 — BERS Model Lab — BYOM, User Model Vault and universal local model environment**.

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

Model Lab must not create a second execution queue, provider registry, model-provenance authority, Billing authority, Project lifecycle, or Artifact acceptance path.

## 3. Trust classes

BERS-owned production models and user-imported models are separate trust classes.

BERS production models may be `SIGNED / VERIFIED / PROMOTED / SUPPORTED` under DurableModelFleet and existing promotion evidence.

User models begin as:

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

The User Model Vault must never silently activate or promote a model into DurableModelFleet.

## 5. Import quarantine

Every imported model begins in quarantine:

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

## 6. Safe-format policy

Initial safe/data-oriented formats should be prioritized, including safetensors, GGUF, ONNX, BERS Model Vault representations, and other separately reviewed non-executable formats.

Formats that may embed executable deserialization behavior, arbitrary Python, native libraries, custom operators, scripts, or remote code require an isolated conversion/validation path.

Arbitrary `.pt` / `.pth` files must not be treated as safe data simply because they are called model checkpoints.

## 7. No automatic remote-code execution

Imported model repositories must never automatically gain code execution.

Forbidden defaults include arbitrary Python, automatic `trust_remote_code`, shell scripts, arbitrary native shared libraries, model-defined paths/endpoints, or arbitrary custom operators loaded into the main BERS process.

If conversion requires code, it must occur in a separately reviewed isolated conversion environment with explicit user intent and bounded immutable outputs.

## 8. Model Inspector first

The first BYOM capability should be **Open / Inspect**, not Execute.

Inspector may report format, architecture, parameter/tensor counts, experts/routing, precision, installed size, metadata, tokenizer/text encoder presence, backend compatibility, MVM streamability, unsupported operators, and security warnings.

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

Unknown architecture fails closed to inspection-only rather than speculative execution.

## 10. Runtime modes

For a supported model, Model Lab may expose MVM execution profiles:

```text
RESIDENT
HYBRID_RESIDENT
FLASH_SPARSE
```

These are runtime states only. Canonical Core targets remain `LOCAL / HYBRID / CLOUD / BLOCKED`.

## 11. Runtime Playground

Model Lab should let users compare accepted runtime strategies for the same representation, including peak RAM, installed bytes, cold/warm latency, flash movement, energy/thermal observations and quality/parity.

The platform still enforces hard resource limits.

## 12. Benchmark Lab

Benchmark evidence should expose real resource behavior rather than parameter-count marketing.

Measure where available: installed bytes, peak RAM/unified memory, accelerator memory, flash/SSD bytes read, RAM-to-accelerator movement, cache behavior, I/O stall, cold/warm latency, workload throughput, energy/battery, thermal behavior, and parity/quality.

Evidence must be bound to model digest, representation digest, device class, backend, runtime version, and benchmark configuration.

## 13. Model Optimizer

Model Lab may create explicit derived representations such as `Original / Balanced / Compact / Flash Sparse`.

Candidate transformations may include mixed precision, validated INT8/INT4, architecture-specific packing, deduplication, graph optimization, backend compilation, sparse/vault indexing, and bounded recovery adapters.

Every transformation preserves source digest, converter version, settings, output digest, target, and available parity/quality evidence. The source is never silently replaced.

## 14. Dual-budget model efficiency

Model Lab follows `BERS_LOCAL_MODEL_EFFICIENCY_POLICY.md`.

Storage and working memory remain separate budgets. Show source and derived installed bytes, additional cache/compiled bytes, expected/measured working memory, movement tradeoffs, and conversion/download cost where relevant.

MVM is not a justification for unnecessary storage growth.

## 15. MVM integration

A safe range-addressable user representation may use the same MVM substrate as BERS-owned models:

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

MVM is neutral to ownership of bytes. Trust class and capability authority remain distinct above it.

## 16. Capability claims

Imported models may expose `USER_DECLARED`, `BERS_INFERRED`, and `BENCHMARK_OBSERVED` claims. None automatically means `BERS_PRODUCTION_TRUSTED`.

Metadata cannot promote a model into a canonical provider.

## 17. Custom Capability Binding

Advanced users may explicitly bind a validated model to a private/custom workflow capability:

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

Candidate private capabilities may include image generation, inpainting, upscaling, experimental Try-On, local reasoning, speech, embeddings/classification, or other bounded inference.

The binding never widens global platform authority.

## 18. `Add to BERS` law

`Add to BERS` means create a typed user-scoped integration. It does **not** mean promote the model.

Studio consumes a stable capability contract and does not own model-specific storage, quantization, streaming, or execution controls.

## 19. Product UX separation

BERS Studio remains creator-first. BERS Model Lab targets advanced users, developers, researchers, and BERS internal qualification workflows.

Suggested surface:

```text
My Models
+-- Open model
+-- Inspect
+-- Benchmark
+-- Optimize
+-- Run
+-- Add to BERS
+-- Remove
```

Advanced information may include storage, working RAM, backend, precision, runtime mode, throughput/latency, compatibility, quality/parity evidence, and last-used state.

## 20. Internal BERS use

Model Lab should also serve as the internal R&D frontend for HSME/MVM model qualification, with permission-separated `USER MODE`, `DEVELOPER MODE`, and `BERS INTERNAL` evidence surfaces.

Production promotion authority remains separate.

## 21. Optional future community layer

A future BERS Model Catalog may distribute models/adapters, but must distinguish `BERS VERIFIED / COMMUNITY / LOCAL IMPORT` both visually and technically.

Community publication never collapses into production trust.

## 22. Network/privacy law

Opening and running a local user model must not silently upload model weights, prompts/inputs, or generated results.

`LOCAL_ONLY` remains zero-network during execution. Remote acquisition/conversion/benchmark services require explicit separately admitted behavior.

## 23. Resource law

A user-imported model is not entitled to exhaust the device. Execution remains bounded by RAM, accelerator memory, storage, thermal, battery, background restrictions, expected movement, and backend support.

If safe execution cannot be admitted, the model remains inspectable but blocked from execution.

## 24. Failure law

Failures remain explicit and non-destructive, including `UNSUPPORTED_ARCHITECTURE`, `UNSAFE_FORMAT`, `CORRUPT_MODEL`, `HASH_CHANGED`, `INSUFFICIENT_STORAGE`, `INSUFFICIENT_RAM`, `BACKEND_UNAVAILABLE`, `UNSUPPORTED_OPERATOR`, `CONVERSION_FAILED`, and `THERMAL_BLOCKED`.

A local failure must not silently switch to paid cloud execution.

## 25. BYOM roadmap

### BYOM-0 — Trust / isolation contract
Define `BERS_USER_MODEL_V1`, quarantine state, content identity, ownership, and no-production-authority law.

### BYOM-1 — Model Inspector
Read-only safe inspection for first supported data formats.

### BYOM-2 — Safe import formats
Initial target families: safetensors, GGUF, ONNX, BERS Model Vault. Import must be hash-bound, bounds-checked, fuzz-tested and non-executable by default.

### BYOM-3 — User Model Vault
Private persistent identity/versioning, derived-representation provenance, storage accounting, deletion, and stale-content detection.

### BYOM-4 — Universal Runtime execution
Run one supported imported dense model through shared resource admission and an accepted backend.

### BYOM-5 — MVM integration
Run one safe sparse/range-addressable imported model under bounded `RESIDENT`, `HYBRID_RESIDENT`, or `FLASH_SPARSE` evidence.

### BYOM-6 — Model Optimizer
Create immutable derived representations with provenance and parity/resource evidence.

### BYOM-7 — Custom Capability Binding
Allow explicit user/workspace-scoped bindings into canonical Core/AEE paths.

### BYOM-8 — Model Lab product surface
Ship the separate Model Lab environment with My Models, Inspector, Benchmark, Runtime Playground, Optimizer, and integration controls.

### BYOM-9 — Advanced adapters / expert packs
Support safe user-owned LoRA/adapters/expert packs where architecture and trust rules permit composition.

### BYOM-10 — Internal qualification convergence
Reuse Model Lab evidence primitives for BERS internal model qualification without exposing promotion controls to normal users.

## 26. Initial acceptance matrix

Before BYOM execution is accepted, prove that filenames are never canonical identity; digest changes invalidate cached bindings; malformed ranges fail closed; unknown architecture remains inspect-only; executable formats do not run in the main process; no automatic remote code execution occurs; user models cannot mutate DurableModelFleet production state or bypass Core; resource budgets are enforced before materialization; `LOCAL_ONLY` has zero execution-time network bytes; derived representations preserve provenance; deletion does not touch BERS-owned roots; backend fallback stays within accepted local paths; and MVM measurements remain bound to exact user representation identity.

## 27. Relationship to model efficiency

For BERS-owned models, compactness remains a design obligation.

For user-owned models, BERS does not control the original architecture but should expose storage-efficient derived representations when safe and useful.

> **BERS-owned models: make them as compact as quality permits. User-owned models: run them as efficiently as the architecture permits, while offering transparent optimization rather than silently changing them.**

## 28. Relationship to AEE

AEE may reason about a user-bound capability only after the binding exists and Core admits it. AEE does not parse arbitrary model files, choose raw tensor ranges, trust user metadata, or promote models.

## 29. Branding decision

The selected product name is **BERS Model Lab**. `BYOM` remains the technical architecture/workstream name inside it.

Suggested positioning:

```text
BERS Studio     — Create with AI.
BERS Agent      — Control AI.
BERS Model Lab  — Run your AI.
```

Marketing wording is non-authoritative and may change without altering architecture.

## 30. Final decision

BERS Model Lab is a separate environment under one BERS brand, backed by the same canonical platform and runtime.

It should make BERS extensible enough to open and run user-owned models without turning arbitrary model files into trusted executable extensions or creating a second local-AI architecture.
