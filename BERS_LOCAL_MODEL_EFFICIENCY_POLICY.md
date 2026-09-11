# BERS Local Model Efficiency Policy

**Status: CANONICAL R&D POLICY / NO PRODUCTION AUTHORITY**

This policy is a cross-cutting companion to `BERS_HYBRID_SPARSE_MOBILE_ENGINE_ROADMAP.md`, `BERS_UNIVERSAL_LOCAL_AI_RUNTIME_ROADMAP.md`, Stage E of `BERS_V1_DEVELOPMENT_ROADMAP.md`, and all BERS-owned local model programs.

It exists to prevent Model Virtual Memory, sparse streaming, large optional Expert Vaults, or future hardware capacity from becoming an excuse for unnecessarily large BERS-owned models.

## 1. Dual-budget law

Every BERS-owned local model or model family has **two independent resource budgets**:

1. **Installed footprint budget** — how many bytes the user must store or download.
2. **Working-memory budget** — how many bytes must be resident/materialized in RAM, unified memory, GPU/NPU memory, staging and execution workspaces during inference.

Neither budget may be treated as a substitute for the other.

A model that fits RAM but occupies excessive user storage fails the product goal.
A model that is compact on disk but requires excessive peak RAM also fails the product goal.

The governing invariant is:

> **BERS must minimize both installed model footprint and active working memory while preserving required product quality. MVM is an additional capability for justified large local models, not permission to stop making BERS models smaller.**

## 2. Compact-first product law

For BERS-owned models, the default product target remains a compact local stack.

The optimization order remains:

1. task/domain specialization;
2. teacher/student distillation;
3. few-step generation where applicable;
4. architecture simplification and parameter reduction;
5. shared-core reuse;
6. Adapter-MoE / bounded sparse specialization where it reduces total bytes or active compute;
7. sensitivity-aware mixed precision and quantization;
8. weight packing / deduplication / compression;
9. hardware-specific representation optimization;
10. MVM streaming/residency to handle the remaining justified capacity.

MVM must not be used to skip steps 1–9.

## 3. Default versus extended local AI

BERS should maintain two distinct product profiles.

### 3.1 Compact Local AI — default

The normal installation should prioritize:

- small initial AI download;
- small persistent storage footprint;
- broad device support;
- mostly resident or lightly streamed models;
- zero unnecessary duplicate representations;
- optional capability packs rather than mandatory full-fleet downloads.

The existing HSME research targets remain the starting point unless newer evidence justifies a better target:

- application payload `< 200 MB` where feasible;
- first useful AI download approximately `600–900 MB`;
- typical installed BERS AI approximately `1.0–1.5 GB`;
- normal managed AI cache approximately `<= 2 GB`;
- ordinary-task active weights approximately `400–800 MB` where feasible.

These are engineering targets, not promises, and may be tightened as models improve.

### 3.2 Extended Local AI / Expert Vault — optional

A user may explicitly choose a larger local model/expert vault when the additional storage produces material value such as:

- higher quality;
- broader offline capability;
- stronger local reasoning;
- reduced cloud use;
- higher privacy;
- richer specialist coverage.

The extended tier may materially exceed normal installed size, but it must remain optional and separately budgeted. Installing it must never be required merely because MVM makes it technically executable.

## 4. Model efficiency gate

Before a BERS-owned model is accepted for MVM/Expert-Vault packaging, compare it against credible smaller alternatives.

At minimum evaluate:

- smaller dense student;
- distilled/few-step student;
- shared-core + compact adapters;
- selective sparse/MoE form;
- mixed precision/quantized form;
- deduplicated/packed representation;
- larger MVM-streamed form.

The selected candidate must justify its additional installed bytes with measurable product value.

A larger candidate is rejected when a materially smaller candidate meets the same product-quality target with acceptable latency, energy and memory.

## 5. Storage efficiency metrics

Every local-model evidence pack must report, where applicable:

- application-added bytes;
- first-use download bytes;
- mandatory installed model bytes;
- optional installed model bytes;
- per-capability pack bytes;
- shared-core bytes;
- expert-vault bytes;
- recovery-adapter bytes;
- backend-specific side-artifact bytes;
- duplicate bytes across hardware representations;
- cache high-water mark;
- update/delta download bytes;
- bytes retained after capability removal/eviction.

Report storage separately from RAM/accelerator memory.

## 6. Quality-per-byte law

Parameter count alone is not useful evidence.

Primary storage-oriented model metrics include:

```text
quality / installed GB
quality / downloaded GB
capability coverage / installed GB
successful local tasks / installed GB
cloud GPU avoided / installed GB
```

These are considered together with:

```text
quality / active FLOP
quality / joule
latency
peak working memory
bytes moved
battery / thermal
```

A model with excellent RAM behavior but poor quality-per-installed-GB is not automatically a BERS success.

## 7. Shared-byte law

BERS should prefer one reusable shared core plus compact capability deltas over independent full-model copies.

Do not store full duplicate backbones for Fashion, Identity, Material, Background, Detail or other capabilities when a shared representation can achieve the required quality.

Where hardware representations differ, measure duplicated storage explicitly. If a device does not need a representation, do not install it.

## 8. Capability-pack law

Optional model capability should be installable independently where technically reasonable.

Examples:

```text
BERS Base AI
+ Fashion Pack
+ Identity Pack
+ Advanced Generation Pack
+ Local Agent Pack
+ Voice Pack
```

A user who never uses a capability should not normally pay its full storage cost.

Capability removal must cleanly release evictable model bytes without corrupting DurableModelFleet identity or active executions.

## 9. Update efficiency

Model updates should not repeatedly redownload unchanged gigabytes when content-addressed or delta-safe delivery is feasible.

Evaluate:

- content-addressed shards;
- immutable shard reuse;
- delta updates where integrity can remain fail-closed;
- independent expert/adapter versioning;
- staged replacement with rollback safety.

Security, signature/hash identity and rollback correctness outrank bandwidth savings.

## 10. Compression law

Smaller is not automatically better.

Do not promote INT4/INT2/INT1, pruning, extreme distillation or compression when they cause unacceptable:

- identity loss;
- garment/logo/pattern damage;
- anatomy artifacts;
- instruction/adherence loss;
- reasoning degradation;
- runtime dequantization cost;
- latency regression;
- unsupported accelerator fallback.

Use recovery adapters only when they improve the total quality/resource tradeoff; they are themselves counted in installed bytes.

## 11. MVM relationship

MVM solves a different problem from model compression.

```text
Model efficiency
= reduce bytes that need to exist at all

MVM
= reduce bytes that must be resident at the same time
```

The preferred architecture combines both:

```text
smaller model / shared core / compact experts
        |
        v
immutable efficient representation
        |
        v
MVM streams only the remaining active subset
```

This order is mandatory for BERS-owned models unless evidence proves another order superior.

## 12. Promotion decision

For each BERS-owned local model family, release evidence must support one of:

- `COMPACT_DEFAULT` — suitable for normal local installation;
- `OPTIONAL_EXTENDED` — justified larger user-selected local pack/vault;
- `LIMITED_DEVICE_TIER` — useful only on declared device classes;
- `R&D_ONLY` — architecture/quality/storage evidence incomplete;
- `REJECT` — storage/resource tradeoff does not justify product value.

No MVM feasibility result automatically upgrades a model from `R&D_ONLY` to a product tier.

## 13. Final law

The long-term BERS objective is simultaneously:

> **Make our models as small as we can without sacrificing the quality required by the product, and make the runtime capable of executing justified models whose total installed capacity still exceeds available RAM.**

These goals are complementary, not competing.

A successful BERS local-AI architecture therefore optimizes both axes:

```text
                 lower installed bytes
                        ^
                        |
          preferred     |     avoid unnecessary
          direction     |     model bloat
                        |
                        +----------------------> lower working memory
                         preferred direction
```

The ideal candidate moves toward the lower-storage and lower-working-memory corner while maintaining or improving product quality.