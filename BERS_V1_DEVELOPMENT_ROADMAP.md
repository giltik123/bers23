# BERS v1 Development Roadmap

**Status: CANONICAL PRE-RELEASE PROGRAM**

This document defines the development sequence from the current BERS architecture to the exact `BERS_V1_RC` and final `BERS v1.0 RELEASE` coordinates tracked by #365.

It complements, and does not replace, `PROJECT_SOURCE_OF_TRUTH.md`. Current production composition and accepted tests remain the authority when an older planning document conflicts with code.

Primary tracking references:

- #365 — BERS v1.0 Release Gate
- #182 — Platform Completion
- #100 — deployment/security hardening
- #233 — real-browser product-journey E2E
- #132 — Local-First Editor & On-Device AI Fleet
- #230 — Fashion release epic
- #116 — Execution Fabric & Composite DAG
- #352 — Sparse Image Runtime: MoE/DiT + FreeToken-derived architecture

## 1. Program decision

BERS v1 is not only a Core/Editor/Fashion release.

`main` is the **only long-lived development and release line**. BERS will not create a separate long-lived `release`, `rc`, `stable`, `v1` or equivalent branch. `BERS_V1_RC` and `BERS v1.0 RELEASE` are exact accepted SHAs on continuously improving `main`. Short-lived PR branches are review/CI mechanisms only; they carry no independent product or release authority and are discarded after convergence into `main`.

The following workstreams are part of the **mandatory pre-release development program** and are not deferred to a post-v1 roadmap:

1. canonical Agent execution;
2. durable Automation execution;
3. durable Job Center reconciliation/control;
4. advanced local generative/refinement R&D;
5. MoE/DiT sparse image-runtime R&D;
6. FreeToken-derived expert-memory/cache/prefetch/runtime research.

This does **not** mean every research candidate must be promoted to production before v1. Production admission remains evidence-driven and fail-closed. It means the defined pre-release milestone for each mandatory workstream must be completed and recorded before `BERS_V1_RC` is selected.

The release must never obtain a false green result by marking unfinished experimental code `PRODUCTION_READY` merely to satisfy schedule pressure.

## 2. Non-negotiable architecture law

All work below obeys these rules:

- one canonical authority per domain;
- PostgreSQL remains the durable server authority where already established;
- browser intent never becomes Project, Artifact, provider, model, billing, evidence or execution authority;
- deterministic tool first, then trusted local AI, then heavier local AI, then only an explicit admitted cloud path;
- `LOCAL_ONLY` failure cannot silently consume credits or invoke a provider;
- AI planning/routing is advisory until canonical Core admission;
- image-producing work ends as a canonical candidate Artifact; Project mutation requires explicit Accept;
- exact source lineage and stale-source protection remain mandatory;
- exact-head acceptance belongs to the final commit under review;
- one implementation slice -> one short-lived review branch -> one focused PR -> convergence into `main`;
- no long-lived parallel release/development line may compete with `main`;
- no Base44 authority may be reintroduced.

## 3. Readiness classes used by this roadmap

Every user-visible capability is classified as one of:

- `PRODUCTION_READY` — canonical end-to-end journey and required evidence are complete;
- `SOFTWARE_READY_EVIDENCE_PENDING` — implementation is accepted but physical-device/quality/release evidence is missing;
- `FUNCTIONAL_NONCANONICAL` — useful code/UI exists but a compatibility or browser-side authority remains;
- `UI_ONLY_OR_PLACEHOLDER` — visible surface without production execution authority;
- `R&D_VALIDATED` — research milestone reached with reproducible measured evidence, but no production authority is granted;
- `R&D_ONLY` — active experimental work without the required pre-release validation milestone;
- `BLOCKED` — known correctness/security/licensing/performance blocker.

`R&D_VALIDATED` is intentionally distinct from `PRODUCTION_READY`.

## 4. Release strategy

Development proceeds in parallel where authority dependencies allow it. The program has six convergence stages.

### Stage A — Release trust and product convergence foundation

Goal: remove repository/release-process weaknesses while finishing already-mature product foundations.

Mandatory work:

- complete #355: protect `main`, require PRs, required stable acceptance checks, block force-push/deletion and document bypass actors;
- continue #100 deployment/security closure;
- keep `main` as the only development/release line;
- finish canonical Wardrobe/Collections/Outfit UI over the already accepted server/browser authorities;
- preserve working Editor baseline and deterministic Crop/Resize/Rotate-Flip paths;
- close misleading or noncanonical UI states rather than resurrect generic CRUD;
- decide Billing v1 exposure: either complete #189 as production authority or explicitly gate all paid-plan/credit-management UX before RC.

Exit:

- repository acceptance cannot be silently weakened by a PR;
- enabled UI surfaces accurately match canonical authorities;
- no known P0 correctness/security/data-loss flaw exists on enabled current paths.

### Stage B — Deterministic Fashion product completion

Goal: make the existing F4 backend a real user journey.

Mandatory work:

- managed Garment create/upload/update/archive/favorite;
- multi-view capture/enrichment for one stable `garmentId`;
- Collections UI with atomic/revision-safe server authority;
- canonical Outfit builder with ordered/layered garment references;
- manual PARAMETRIC contour acquisition UI;
- manual Project body-anchor acquisition UI;
- #314 deterministic one-garment Try-On UI activation;
- exact orchestration:
  `Project source + garment -> readiness -> warp -> texture composite -> canonical FINAL -> Preview/Compare -> explicit Accept`;
- no FASHN/provider/billing fallback in deterministic F4;
- stale source/evidence change/reload/retry/cancel/discard tests.

Exit:

- deterministic one-garment Try-On is `PRODUCTION_READY`;
- Wardrobe/Collections/Outfit baseline is `PRODUCTION_READY`;
- browser never supplies representation/anchor/layer/storage/SHA evidence as execution authority.

### Stage C — Canonical Agent, Automation and Job Center

Goal: complete the orchestration/productivity verticals before release rather than leaving them as legacy browser orchestration.

#### C1 — Execution Fabric completion

Use #116 as the substrate.

Required:

- capability admission remains explicit and fail-closed;
- canonical intermediate Artifacts between steps;
- supported composite runtimes cannot alias unknown operations to generic image-edit;
- durable run identity/idempotency/cancellation/reconciliation;
- one provider/Billing authority shared with interactive Creative execution;
- local-first target policy remains canonical.

#### C2 — Agent

Pre-release target: `PRODUCTION_READY` for a bounded multi-step v1 Agent surface.

Required:

- no browser `editingEngine -> provider` side path;
- Agent plans compile into admitted structured operations only;
- every image-producing step uses canonical Artifacts;
- explicit operation/target/provider constraints;
- cancellation and retry preserve run identity;
- refresh/reconnect does not invent a new paid run;
- Project mutation remains explicit Accept;
- bounded v1 tool/capability allowlist rather than arbitrary autonomous side effects.

#### C3 — Automation

Pre-release target: `PRODUCTION_READY` for a bounded durable manual/triggered v1 automation surface.

Required:

- server-owned automation definition + revision;
- durable run state;
- scheduler/worker authority server-side where recurring execution is enabled;
- same canonical Creative/Artifact/Transaction authorities as interactive execution;
- idempotent trigger/run semantics;
- pause/cancel/retry/recovery;
- no generic browser entity CRUD as execution truth.

If recurring scheduler execution cannot reach the bar before RC, the enabled v1 surface must be explicitly narrowed to the subset whose durable execution is fully proven; the underlying Automation workstream itself remains mandatory before RC.

#### C4 — Job Center

Pre-release target: `PRODUCTION_READY` as the unified view/control surface over canonical run authorities.

Required:

- reload active/recent Creative/local/Automation runs after refresh;
- authoritative terminal state and result reconciliation;
- correct cancel routing to the owning authority;
- idempotent retry/UNKNOWN-provider recovery;
- no browser-forged completed/credits-consumed truth;
- explicitly classify unrecoverable client-only work as ephemeral.

Exit for Stage C:

- Agent, bounded Automation and Job Center no longer depend on legacy browser execution authority;
- browser refresh/reconnect tests prove durable recovery;
- multi-step execution cannot bypass canonical Artifact/provider/Billing controls.

### Stage D — Local AI and advanced generative pre-release program

Goal: improve the local-first fleet and complete the mandatory generative research/evidence program before RC.

Run these tracks in parallel with Stages B/C whenever they do not share implementation authority.

#### D1 — MobileSAM / segmentation

- complete real supported-device and representative real-image evidence;
- promote only after #136 acceptance;
- keep CANDIDATE fail-closed otherwise.

#### D2 — MODNet / matting

- resolve cross-host reproducibility classification;
- real-device/runtime/quality evidence;
- production promotion only from a stable accepted artifact identity.

#### D3 — Real-ESRGAN / restoration

- produce exact signed release artifact;
- parity, device, memory, latency and real-image review;
- keep disabled until production evidence passes.

#### D4 — Big-LaMa / local inpainting and Fashion control

- complete model promotion evidence for generic local inpainting as appropriate;
- separately evaluate Fashion F5 semantic admission;
- measure seam/lighting gain under exact F5 support policy;
- prefer reuse if quality gain is competitive with heavier generative candidates.

#### D5 — Tiny-SD

- finish Tiny-SD **Sprint 6.42D6 accelerated real-device/practical-quality admission tracked by #180**;
- characterize cross-run ONNX reproducibility drift without weakening numeric gates;
- do not promote a ~GB runtime merely because it executes;
- record an explicit `ADVANCE`, `LIMITED_TIER`, or `REJECT_FOR_PRODUCT_DEFAULT` decision.

#### D6 — Kandinsky constrained refinement

- reproduce the **Kandinsky F5 D2 conditioning bundles tracked under #349** from clean pinned environments;
- decoder-only parity;
- actual package/RAM/VRAM/latency measurements;
- real-image F5 comparison against deterministic F4 and Big-LaMa;
- advance only if quality gain materially justifies runtime cost;
- no prompt/model/mask authority from the browser.

#### D7 — Generative selection decision

Before RC, record one versioned comparison matrix across the best relevant local candidates:

- quality;
- prompt/semantic adherence where applicable;
- garment/logo/pattern preservation for Fashion;
- artifact/failure rate;
- package/download size;
- peak RAM/VRAM/unified memory;
- cold/warm latency;
- device tiers;
- determinism/replay envelope;
- commercial redistribution/license status;
- local-only/no-credit behavior.

Pre-release milestone:

- at least one clear product decision exists for each enabled generative capability: production candidate, limited supported tier, deterministic fallback, or explicit rejection;
- unresolved research does not masquerade as enabled product behavior.

### Stage E — BERS Sparse Image Runtime: MoE/DiT + FreeToken-derived architecture

Goal: complete a meaningful pre-release architecture validation of the long-term BERS-owned sparse image runtime rather than postponing it after v1.

This stage follows #352 and remains image-specific. FreeToken is a design/reference source for memory/runtime ideas, not a drop-in diffusion runtime.

#### E1 — Dense DiT reference

Required before sparse claims:

- select a commercially admissible dense DiT reference or controlled training baseline;
- pin model/source/toolchain/license identity;
- establish quality, latency, memory and package baselines on representative hardware;
- define replay/evidence format and Core capability boundary.

#### E2 — Sparse/MoE prototype

Compare at least:

- native sparse/MoE design;
- dense-to-sparse conversion where technically credible;
- shared/common expert path + sparse experts;
- small expert count before scaling.

Measure actual resident bytes and traffic; theoretical active-parameter count is not sufficient.

#### E3 — Routing law

Evaluate:

- per-patch/token routing;
- block-level routing;
- timestep/denoising-stage-aware routing;
- top-1 vs tightly bounded top-k;
- shared-expert + sparse-expert variants.

Select by quality, latency, memory traffic, regularity and replay/debug behavior.

#### E4 — FreeToken-derived memory/runtime mechanisms

Reimplement only mechanisms that produce measured image-runtime value:

- global expert cache;
- hot/cold expert residency;
- asynchronous expert prefetch;
- elastic memory budgeting;
- bandwidth-aware placement;
- packed/streamable immutable expert weights;
- expert hit/miss telemetry;
- fail-closed resource admission before materialization.

Do not import LLM-specific KV-cache/prefix-cache/token-sampling assumptions into image authority.

#### E5 — Few-step and quantization

Evaluate:

- distilled/few-step schedules;
- FP16/BF16/mixed precision;
- INT8;
- INT4 weight-only or other lower-bit formats only where quality survives;
- activation-memory reduction.

#### E6 — Desktop and mobile feasibility

Desktop/native:

- GPU/RAM expert residency;
- prefetch/offload;
- tiered quality/performance profiles.

Mobile:

- ARM64 baseline;
- Metal/Core ML/ANE where graph/routing support is real;
- Android Vulkan/GPU and QNN/Hexagon where credible;
- package, latency, RAM/unified memory, battery/thermal behavior;
- avoid pathological flash traffic/scatter-gather routing.

#### E7 — Mandatory pre-release MoE/FreeToken milestone

Before `BERS_V1_RC`, this workstream must reach `R&D_VALIDATED` with:

1. one pinned dense DiT baseline;
2. at least one functioning sparse/MoE prototype;
3. a measured routing comparison;
4. at least one implemented FreeToken-derived expert-memory mechanism;
5. measured comparison against the dense baseline for quality, latency, memory and bytes moved;
6. an explicit desktop feasibility decision;
7. an explicit mobile feasibility decision based on real-device evidence or a recorded blocker;
8. a written `ADVANCE / REDESIGN / REJECT` architecture decision for the next generation of BERS image runtime.

Production admission before v1 is optional and evidence-driven. **R&D validation before v1 is mandatory.**

### Stage F — Final product evidence and release

Goal: turn subsystem acceptance into release evidence for one exact SHA.

#### F1 — Browser product-journey E2E (#233)

Run against:

- built frontend;
- built Core server;
- real PostgreSQL with actual migrations;
- production-interface deterministic provider fakes only where external paid execution would make CI nondeterministic.

Mandatory journeys include:

- Auth register/login/reset/protected-route behavior;
- Project create/open;
- Preview/Accept/Discard;
- Undo/Redo/Version/Restore;
- stale FINAL recovery;
- deterministic Crop/Resize/Rotate-Flip;
- selection/MASK and a local operation;
- Fashion open without object detection;
- Garment upload/manage/multi-view/Collection;
- Outfit create/reorder;
- deterministic Try-On -> FINAL preview -> Accept;
- Agent bounded multi-step run;
- Automation durable run for the enabled v1 subset;
- Job Center refresh/reconciliation/cancel/retry;
- `LOCAL_ONLY` cannot reach provider or credits;
- cross-user/cross-project Artifact/Garment/Outfit/run substitution denied.

If Billing is enabled in v1, add checkout/webhook/entitlement transition as mandatory release E2E. If Billing is not enabled, prove paid-plan and credit-mutation UI is gated.

#### F2 — Release evidence

- production image/migrations/startup/health;
- target deployment/security checks;
- repository rules/protection checks;
- tenant isolation;
- local-only zero-credit evidence;
- real-device/manual quality evidence for every enabled visual/model claim;
- accessibility/error/loading/recovery review;
- rollback/recovery documentation;
- enabled vs CANDIDATE vs R&D classifications audited.

#### F3 — `BERS_V1_RC`

Select one exact accepted `main` SHA only after all mandatory pre-release program gates above are satisfied.

If any release-affecting fix or feature lands afterward, the RC moves to the new accepted SHA and affected evidence is rerun.

#### F4 — `BERS v1.0 RELEASE`

Release only when:

- mandatory release CI/E2E is terminal green on the exact final SHA;
- no open correctness/security/data-loss blocker affects enabled behavior;
- required Agent/Automation/Job Center pre-release gates are complete;
- advanced generative pre-release decision matrix is complete;
- MoE/DiT + FreeToken-derived workstream has reached `R&D_VALIDATED`;
- production configuration/deployment checklist is complete;
- version/tag/release artifact is generated from that exact accepted SHA.

## 5. Parallel execution lanes

To maximize progress without creating authority collisions, use these concurrent lanes:

### Lane 1 — Product/UI convergence

- Wardrobe/Collections/Outfit UI
- PARAMETRIC/body-anchor acquisition UI
- deterministic Try-On UI
- Editor deterministic-tool UX

### Lane 2 — Execution/orchestration

- Execution Fabric
- Agent
- Automation
- Job Center
- local-first target/fallback policy

### Lane 3 — Model evidence

- MobileSAM
- MODNet
- Real-ESRGAN
- LaMa
- Tiny-SD
- Kandinsky/F5

### Lane 4 — Sparse runtime R&D

- dense DiT baseline
- MoE routing
- FreeToken-derived expert cache/prefetch
- quantization/few-step
- desktop/mobile feasibility

### Lane 5 — Release/security/E2E

- main protection/rulesets
- deployment/security
- browser E2E
- release classification/evidence

A shared authority file/contract must not be edited independently by multiple active branches. If two lanes converge on the same authority, serialize the dependency and clean-reparent the later change to current `main`.

## 6. Priority order inside each lane

When choosing between multiple useful tasks, prefer:

1. correctness/security/data-loss blockers;
2. canonical user journey completion;
3. recovery/idempotency/reconciliation;
4. real-device/real-image evidence;
5. latency/memory/package reduction;
6. additional capabilities;
7. speculative optimization.

Quality is preferred over speed, but complexity without measured product benefit is rejected.

## 7. Decision process for each technical problem

For material architecture/runtime decisions:

1. identify at least two credible alternatives when alternatives genuinely exist;
2. compare correctness and authority impact first;
3. compare quality and user outcome;
4. compare latency/memory/storage/cost;
5. compare implementation and maintenance complexity;
6. select one approach and record why the alternatives were rejected;
7. build the smallest focused acceptance slice that can falsify the decision;
8. promote only after exact-head evidence.

Do not broaden thresholds or authority merely to obtain green CI.

## 8. Current next sequence from main

From current `main`, the preferred execution sequence is:

1. land this roadmap and bind it to #365;
2. finish repository protection/ruleset authority (#355);
3. continue Fashion UI convergence over the already accepted Garment/Wardrobe/Collections/Outfit clients;
4. activate deterministic Try-On product UI only after prerequisites remain production-real (#314);
5. in parallel, advance Execution Fabric -> Agent -> Automation -> Job Center;
6. in parallel, complete local model real-device/quality evidence and the F5 Big-LaMa/Kandinsky comparison;
7. in parallel, start #352 at E1 dense DiT baseline and E2 sparse prototype rather than waiting until after product UI work;
8. bring #233 browser E2E online incrementally as each user journey becomes canonical;
9. close/gate Billing before RC;
10. execute the complete pre-release matrix, select exact `BERS_V1_RC`, then run final release evidence.

## 9. Definition of program success

The pre-release program is complete when BERS has:

- a secure canonical Core/Project/Artifact foundation;
- a production-usable Editor and deterministic local tool base;
- production Wardrobe/Collections/Outfit and deterministic Try-On;
- a bounded production Agent;
- a bounded durable production Automation path;
- a durable production Job Center;
- an evidence-based advanced local generative strategy;
- a validated MoE/DiT + FreeToken-derived sparse-runtime architecture direction;
- honest model/device/license classifications;
- protected release governance;
- mandatory browser E2E against built frontend + Core + PostgreSQL;
- one exact accepted `main` SHA that can truthfully be declared `BERS v1.0 RELEASED`.
