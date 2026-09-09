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
- `BERS_HYBRID_SPARSE_MOBILE_ENGINE_ROADMAP.md` — canonical HSME / Hierarchical Adapter-MoE companion architecture

## 1. Program decision

BERS v1 is not only a Core/Editor/Fashion release.

`main` is the **only long-lived development and release line**. BERS will not create a separate long-lived `release`, `rc`, `stable`, `v1` or equivalent branch. `BERS_V1_RC` and `BERS v1.0 RELEASE` are exact accepted SHAs on continuously improving `main`. Short-lived PR branches are review/CI mechanisms only; they carry no independent product or release authority and are discarded after convergence into `main`.

The following workstreams are part of the **mandatory pre-release development program** and are not deferred to a post-v1 roadmap:

1. canonical Agent execution through the BERS Agentic Execution Engine (AEE);
2. durable Automation execution;
3. durable Job Center reconciliation/control;
4. advanced local generative/refinement R&D;
5. BERS Hybrid Sparse Mobile Engine (HSME) / Adapter-MoE sparse image-runtime R&D;
6. FreeToken-derived expert-memory/cache/prefetch/runtime research;
7. evaluation, observability and controlled rollout infrastructure required to operate Agent/local-AI capabilities safely.

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
- **reasoning is flexible, authority is deterministic**: an LLM/model may propose intent, plans, evaluations and repairs, but its output is never itself an admission token, execution identity, ticket, Artifact identity, provider/model choice, Billing decision or Project mutation authority;
- Context Graphs, memories, ranking signals and execution-experience data are derived/advisory projections only and never become Project, Artifact, garment geometry, entitlement or execution truth;
- image-producing work ends as a canonical candidate Artifact; Project mutation requires explicit Accept;
- exact source lineage and stale-source protection remain mandatory;
- every admitted Agent graph and every resulting execution must be traceable from intent/proposal through admission, WorkflowContinuation/ExecutionRun and canonical Artifact/evaluation evidence;
- production Agent/model/runtime rollout is server-controlled and fail-closed; kill switches may narrow/disable capability but never widen authority or bypass evidence;
- an Agent cannot silently increase its own permissions, autonomy level, budget, cloud allowance, recurring schedule or policy envelope;
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

#### C2 — Agent / BERS Agentic Execution Engine (AEE)

Pre-release target: `PRODUCTION_READY` for a bounded multi-step v1 Agent surface, while establishing the long-term **BERS Agentic Execution Engine (AEE)** architecture.

The canonical Agent design is **compile, do not execute model output directly**. Natural-language, voice, vision or multimodal reasoning produces an advisory structured proposal. A deterministic Core compiler validates and binds that proposal into an immutable admitted execution graph. Only the admitted graph may enter the existing durable execution authorities.

Canonical flow:

`Text / Voice / Touch / Image context -> advisory Intent Interpreter -> AgentIntentV1 -> PlanProposalV1 -> deterministic Core Plan Compiler -> AdmittedPlanGraphV1 -> WorkflowContinuation + ExecutionRun -> admitted deterministic/local/HSME/cloud execution -> canonical Artifact -> advisory Result Evaluator -> PASS / REPAIR / REPLAN proposal -> Core admission again`.

This compiler boundary is the central long-term Agent architecture because it allows reasoning models to improve or change without moving execution authority into the model, browser or planner.

##### Current accepted substrate and convergence law

Carry forward the accepted C2/C3 foundation rather than building a new competing run system:

- `BoundedAgentDeterministicWorkflowService` plus `WorkflowContinuation` and `ExecutionRun` are the current production Agent execution substrate;
- Automation invocation binding delegates into that substrate; Automation must not create a parallel Agent run registry;
- `src/lib/agent/*` is legacy/advisory planning code only. Preserve useful concepts such as structured parsing, ambiguity, dependencies and optimization, but keep browser image execution disabled;
- `src/platform/agent/*` is a useful pure planning/memory/events/research library, but its process-memory sessions/history/retry state must not become production execution truth;
- production retry/recovery/cancellation/result state remains durable and server-owned;
- no Agent or planner may bypass canonical Artifact, provider, Billing, local-execution or Project authorities.

Do not maintain three independently evolving Agent architectures. Converge them into one planning plane above one durable execution plane.

##### AEE architecture laws

- model/LLM output is **untrusted advisory data** until compiled and admitted by Core;
- the Agent plans in typed **capabilities**, not provider names or model names;
- ambiguous destructive or object-targeted intent fails closed to clarification or visible candidate selection; no production `best effort` target mutation;
- runtime SUCCESS is not equivalent to user-goal SUCCESS; quality/effect correctness is evaluated separately;
- every replan or repair is a new bounded proposal evaluated by Core policy; evaluators never gain execution authority;
- memory/preferences may influence ranking and defaults but never become Artifact, geometry, entitlement, provider, execution or Project truth;
- `LOCAL_ONLY` remains transitive across planning, repair and replanning: a local failure cannot silently become paid/cloud execution;
- Project mutation remains explicit Accept even when the Agent autonomously plans, executes, evaluates or repairs candidate work;
- bounded autonomy is mandatory: node, retry, replan, candidate, credit, cloud, time and resource budgets are explicit and enforceable;
- plan and intent schemas are versioned, canonicalized and digest-bound for replay/debugging;
- multi-agent/swarm orchestration is a non-goal until one AEE planning/evaluation loop is production-measured; typed components are preferred over multiple opaque agents talking to one another.

##### AE-0 — Agent architecture consolidation

Goal: remove ambiguity about which existing layer owns what before adding more intelligence.

Required:

- classify `src/lib/agent` as legacy/advisory compatibility; no execution authority;
- classify `src/platform/agent` as pure planning/reasoning primitives unless and until specific pieces are adopted behind Core contracts;
- document `WorkflowContinuation + ExecutionRun` as the sole production Agent execution-state authority;
- map legacy concepts worth retaining: structured parser, `depends_on`, ambiguity, task optimization, events, memory/context and debugging;
- prohibit URL-based/browser in-memory task history from being treated as rollback or lineage authority;
- add architecture tests that prevent new provider/Billing/Artifact/Project execution side paths from either planning layer.

Exit: one explicit Agent architecture, with no competing execution truth.

##### AE-1 — `AgentIntentV1`: structured intent and reference contract

Replace coarse `intent: string` / regex-only interpretation as the production planning contract with a versioned structured intent.

`AgentIntentV1` must be able to represent at minimum:

- goal/capability intent;
- current Project/source reference;
- target references such as garment, person, selected region/object or prior candidate;
- mutable regions/entities;
- preserve/locked regions/entities such as face, hair, hands, background or logo;
- quality/style constraints;
- local-first/local-only preference;
- requested credit/cloud/resource budget;
- source modalities and UI context used to resolve references;
- explicit ambiguities and confidence/evidence;
- parser/schema version.

Required behavior:

- exact schema validation and canonical serialization;
- unknown fields fail closed at Core boundary;
- ambiguous object/history references do not silently resolve to a destructive action;
- natural-language/LLM parsing is replaceable; the canonical contract remains stable;
- tests cover multilingual phrasing, adversarial prompt fields, stale UI references and cross-project substitution.

Exit: reasoning is separated cleanly from execution semantics.

##### AE-1.5 — BERS Context Graph

Build one derived, typed context projection that lets text/voice/touch reasoning resolve references without inventing a new state authority.

The Context Graph may expose bounded references to:

- current Project and current source Artifact;
- candidate Artifacts and their canonical lineage;
- current Editor selection / selected region or object;
- Garment, Wardrobe and Outfit references;
- bounded workflow/run history;
- explicit user preferences whose provenance permits use;
- current device/runtime capability summaries where useful for planning.

Rules:

- every durable graph node points back to canonical IDs/revisions or typed ephemeral UI context;
- the graph is recomputable/derived and never substitutes for Project/Artifact/Garment/ExecutionRun truth;
- stale canonical references are rejected during Core compilation;
- phrases such as `this one`, `the second version`, `keep the original face` or `use yesterday's outfit` must resolve to typed candidate references or produce an explicit ambiguity.

Exit: multimodal grounding is inspectable and reference-safe before broader Voice/creative autonomy is enabled.

##### AE-2 — Capability Registry

Create a typed server-owned registry describing **what** the Agent may ask for without encoding **which provider/model** performs it.

Initial bounded capabilities should reuse accepted operations where possible, for example:

- `ORTHOGONAL_TRANSFORM`;
- `RESIZE`;
- `SEGMENT_PERSON` / bounded segmentation where admitted;
- `BACKGROUND_ISOLATION`;
- later `TRY_ON`, `INPAINT_REGION`, `RESTORE_DETAIL`, `UPSCALE`, pose/garment analysis only when their canonical authorities are ready.

Each `CapabilityDescriptor` records:

- versioned capability ID;
- accepted Artifact/input roles;
- output Artifact roles;
- preconditions;
- deterministic/local/cloud eligibility class;
- side-effect class;
- resource class;
- required evidence/readiness class;
- supported evaluator hooks;
- whether user confirmation is required.

Provider/model/runtime identities remain downstream routing/admission concerns and are never accepted from arbitrary Agent text.

Exit: Agent planning is provider-independent and capability-bounded.

##### AE-3 — `PlanProposalV1` and deterministic Core Plan Compiler

Introduce a compiler boundary analogous to source -> intermediate representation -> verified executable plan.

The advisory planner emits `PlanProposalV1` with a bounded DAG of capability requests and dependencies. The Core compiler must:

- resolve references against current authenticated canonical state;
- validate capability/version compatibility;
- reject cycles, unsupported fan-out and unknown node types;
- bind immutable source Artifact identities and exact relevant revisions;
- bind constraints and preserve/mutable policy;
- compute canonical node identities, plan digest and schema/compiler version;
- perform stale-source checks;
- apply budget/autonomy policy;
- apply provider/local/HSME/Billing admission through existing authorities rather than planner claims;
- emit `AdmittedPlanGraphV1` or a structured rejection/clarification requirement.

Initial graph rules:

- DAG only;
- small bounded node count;
- bounded fan-out;
- explicit typed dependencies;
- no arbitrary code/tool names;
- no free-form loops. Repair/replan cycles occur as new bounded graph revisions/invocations rather than an unbounded runtime loop.

The compiler may perform only semantics-preserving, evidence-inspectable optimization passes, including where safe:

- dependency normalization;
- common preprocessing/subgraph reuse;
- elimination of provably duplicate work;
- safe parallelization of independent nodes;
- bounded candidate-prefix sharing;
- HSME-aware scheduling hints that do not alter the admitted capability semantics.

For example, N candidate branches should reuse one canonical segmentation/preprocessing result when all branches have the same exact source and compatible evidence, instead of paying for duplicate work.

Determinism requirement: the same canonical intent/proposal + same canonical state + same compiler/policy version must produce the same admitted graph digest or the same deterministic rejection class.

Exit: no LLM-generated plan can execute without deterministic compilation and Core admission.

##### AE-3.5 — Admission Receipt and unified execution trace

Every admitted graph/node must have immutable admission evidence sufficient to prove what Core authorized.

An `AdmissionReceiptV1` / equivalent must bind, as applicable:

- intent/proposal/graph identity and digest;
- compiler/schema/policy versions;
- node ID and capability/version;
- exact source Artifact/revision bindings;
- preserve/mutable constraints;
- execution policy and admitted target class;
- budget/autonomy reservation identity;
- required evaluator/evidence contract.

One correlation chain must connect:

`Intent -> PlanProposal -> AdmissionReceipt/AdmittedPlanGraph -> WorkflowContinuation -> ExecutionRun(s) -> Artifact(s) -> evaluator evidence -> user Accept/Reject/Rank outcome`.

This trace is observability/audit evidence, not a second execution state machine.

Exit: production support and evaluation can explain exactly what was requested, admitted, executed, evaluated and accepted.

##### AE-4 — Generalize durable execution from one fixed workflow to admitted bounded graphs

Evolve the current fixed `Orthogonal -> Resize -> INTERNAL verify` implementation without weakening its guarantees.

Compare implementation approaches before coding:

1. extend the current service with conditionals for every new workflow — reject once this creates operation-specific branching debt;
2. build a new independent Agent runtime — reject because it duplicates WorkflowContinuation/ExecutionRun authority;
3. **selected:** generalize the accepted WorkflowContinuation/ExecutionRun substrate to execute only `AdmittedPlanGraphV1` node types through capability adapters.

Required proof slices:

- preserve current Orthogonal -> Resize -> verify behavior byte-for-byte/semantically as a compiled graph;
- add at least one second bounded workflow with different dependencies, preferably using already accepted local/deterministic authorities;
- prove canonical intermediate Artifact lineage;
- prove browser refresh/Core restart/lost-response recovery;
- prove retry stays under the same logical workflow while attempt identity changes correctly;
- prove cancellation authority separation;
- prove `LOCAL_ONLY` graph failure cannot reach provider/Billing;
- prove explicit Accept remains the only Project mutation.

Exit: production Agent execution is graph-general enough for multiple bounded workflows without becoming arbitrary.

##### AE-4.5 — AEE <-> HSME execution contract

Define a typed boundary so the Agent can express **what quality/resource semantics are required** without selecting a model/runtime, and HSME can report **how an already admitted local/hybrid subgraph was realized** without changing the goal.

`ExecutionRequirementV1` / equivalent may bind:

- admitted capability/version;
- semantic/preserve constraints;
- quality target;
- canonical execution policy (`LOCAL_ONLY`, `AUTO`, etc.) and admitted target boundary;
- latency/resource/memory/energy budget classes where available;
- privacy/data-movement class;
- evaluator/evidence requirements.

HSME realization evidence may report:

- hardware/runtime representation identity;
- exact signed pack/model identities used;
- expert/residency/scheduling evidence where applicable;
- latency, peak memory, bytes moved, cache/stall and device metrics;
- resulting canonical Artifact/run references.

Rules:

- AEE never chooses arbitrary model/provider IDs through this contract;
- HSME never widens capability, execution policy, cloud/Billing allowance or semantic scope;
- HSME optimization may change scheduling/representation only within the Core-admitted envelope;
- an HSME block/resource failure returns structured evidence to AEE/Core and never silently escalates to cloud.

Exit: AEE and HSME can optimize together without creating a shared ambiguous authority layer.

##### AE-5 — Failure Taxonomy and Bounded Replanner

Replace generic "retry the same task" behavior with structured failure classification and bounded alternative planning.

Initial failure classes should distinguish at least:

- transient transport;
- expired attempt/ticket;
- durable local failure;
- provider `UNKNOWN`/reconciliation required;
- stale source/evidence;
- missing/insufficient mask, anchors or other prerequisites;
- model/capability unavailable;
- insufficient device memory/resources;
- quality rejected;
- user input/clarification required;
- policy/budget denial.

The Replanner may propose only registered capabilities and bounded plan changes. Examples:

- insufficient anchors -> propose anchor acquisition before Try-On;
- missing mask -> propose segmentation/manual selection;
- insufficient device memory -> propose a lower admitted local tier where policy allows;
- quality failure -> propose targeted repair;
- `LOCAL_ONLY` failure -> never propose implicit cloud escalation.

Exit: retries are reserved for genuinely retryable attempts; semantic failures can produce a bounded, inspectable replan.

##### AE-6 — Result Evaluator and targeted repair

Add a separate advisory quality/effect-verification layer because technical runtime success does not prove goal success.

Use multiple evaluator classes rather than one universal judge:

1. deterministic Artifact/lineage/geometry/MIME/hash checks;
2. domain evaluators such as identity preservation, garment alignment, logo/pattern preservation, anatomy, background preservation or mask quality;
3. preference/aesthetic ranking only where appropriate.

Evaluator output is structured evidence such as `PASS`, `REPAIRABLE`, `REPLAN_REQUIRED`, `USER_REVIEW_REQUIRED` plus metrics/reasons. It cannot mutate Project, spend credits, select a provider or execute repair itself.

Repair rules:

- prefer region-specific/low-cost repair over full regeneration when evidence supports it;
- every repair re-enters Core admission with remaining budget;
- cap repair cycles;
- retain all candidate Artifact lineage for audit/recovery;
- quality thresholds are capability/version-specific and evidence-driven.

Exit: Agent can distinguish "a file was produced" from "the requested goal was satisfied".

##### AE-6.5 — Evaluation, feedback and golden benchmark platform

Treat Agent/model/runtime evaluation as a first-class platform rather than ad-hoc tests.

Maintain versioned benchmark families such as:

- `BERS-Agent-Eval-v1` — intent/reference/plan correctness;
- `BERS-TryOn-Eval-v1` — garment/identity/anatomy/background outcomes;
- `BERS-Voice-Intent-Eval-v1` — multilingual/contextual reference resolution;
- `BERS-HSME-Mobile-Eval-v1` — quality/latency/memory/energy/bytes-moved on real devices.

Measure separately:

- execution success;
- goal/semantic success;
- quality/evaluator success;
- user outcome such as Accept/Reject/choice among candidates;
- cost, latency, cloud/local usage and repair/replan rate.

User feedback/outcome records must have explicit provenance and privacy/retention policy. They may feed offline analysis/training/evaluator calibration only through versioned, reviewable promotion processes; production models/planners do not self-train or self-promote directly from live outcomes.

New planners/evaluators/reasoning models should support **shadow mode** before authority-bearing rollout: they receive representative production-like input/context and produce plans/evaluations without executing or spending credits, enabling comparison against the accepted planner.

Exit: intelligence improvements are selected by reproducible product metrics, not prompt anecdotes.

##### AE-7 — Agent Budget and autonomy policy

Introduce an immutable bounded autonomy envelope. At minimum support:

- maximum graph nodes;
- maximum retries per node;
- maximum replans;
- maximum repair cycles;
- maximum candidate fan-out;
- maximum credits;
- maximum paid/cloud executions;
- wall-clock/resource budget where enforceable;
- local-only/local-first policy;
- quality mode.

For paid/cloud autonomy, prefer a server-owned reservation envelope where financial authority supports it:

`approved Agent max -> reserve bounded amount/capacity -> finalize actual admitted spend -> release unused reservation`.

Retries/replans/branches must never exceed the immutable approved financial envelope through concurrency or duplicate delivery.

User-facing autonomy levels:

- `L0 SUGGEST` — propose only;
- `L1 PLAN_AND_CONFIRM` — compile/show plan, user explicitly starts it;
- `L2 BOUNDED_AUTONOMY` — execute/evaluate/repair within an approved envelope;
- `L3 CREATIVE_AUTONOMY` — bounded candidate fan-out/evaluation/ranking, still without implicit Project Accept or unapproved paid/cloud escalation.

Any higher/proactive autonomy remains out of scope until server-owned Automation scheduling is accepted.

Exit: autonomy cannot become an unbounded retry/spend/compute loop.

##### AE-8 — Durable typed Agent memory and execution experience

The current in-memory memory/history abstractions are useful prototypes, not production durable truth.

Separate memory into:

- working/session memory;
- explicit user preference memory;
- episodic workflow summaries;
- reusable workflow-pattern memory;
- device/runtime experience signals for planning optimization.

Every durable memory record must carry at minimum:

- tenant/user/project scope as applicable;
- provenance/source and derived-from references;
- confidence;
- purpose/use class and consent basis where required;
- retention/expiry policy;
- schema/version and last-validation metadata where applicable.

Preferences may rank plans or prefill defaults but cannot override canonical state or authority. Identity/face-related derived data requires an explicit sensitive-data policy and must not be treated as ordinary preference memory.

Do not store raw volatile browser URLs as history identity. Use canonical Artifact/run/project references where durable references are necessary.

Exit: Agent personalization survives restart without becoming a second Project/Artifact/financial authority or an unbounded data-retention surface.

##### AE-9 — Multimodal Intent Engine and Voice

Build voice as one input modality into the same `AgentIntentV1`, not as a separate Voice Agent.

Target inputs:

- text;
- push-to-talk transcript;
- touch/selected object/region;
- current Editor selection;
- current Project image/candidate context;
- Garment/Outfit/Wardrobe references;
- bounded workflow-history references.

Preferred speech architecture is local-first capability routing: OS on-device ASR where adequate -> optional BERS Local Voice Pack -> explicit cloud fallback only when permitted. Speech-to-text itself has no execution authority.

Privacy defaults:

- raw voice audio is transient unless an explicit product feature requires retention;
- transcript retention is separately classified from raw audio retention;
- `LOCAL_ONLY` voice mode cannot silently send audio/transcript to cloud;
- contextual vocabulary and current-selection hints are minimized to what the ASR/intent step actually needs.

Contextual commands such as "this one on me", "do not change my face", "go back to the second version" or "make only the jacket looser" must resolve to typed references/constraints before planning.

Exit: multimodal interaction changes intent quality/UX without weakening Core admission or privacy policy.

##### AE-10 — Creative branching, comparison and ranking

After graph execution/evaluation is proven, add bounded fan-out:

`one goal -> N admitted candidate branches -> canonical candidate Artifacts -> evaluator/ranker -> recommended candidate + alternatives`.

Use cases include:

- multiple outfit candidates;
- controlled color/style alternatives;
- repair strategy comparison;
- local vs admitted higher-quality path comparison where user policy permits.

Requirements:

- every branch has canonical lineage and bounded cost;
- planner cannot silently discard financially relevant execution truth;
- ranking does not auto-Accept a Project result;
- shared exact preprocessing/subgraphs should be reused where compiler proof allows;
- HSME/runtime signals may optimize branch ordering/residency but not alter semantics.

Exit: BERS can act as a bounded creative copilot rather than a single-shot generator.

##### AE-11 — Proactive Agent only on accepted Automation scheduler authority

Do not create a background Agent loop or wake-up mechanism before C3 establishes server-owned scheduler/worker authority.

After recurring/triggered Automation is accepted, the Agent may propose or operate within versioned Automation definitions and explicit user policy for tasks such as scheduled preparation/recommendation. Trigger identity, idempotency, run recovery and permissions remain Automation/Core-owned.

The Agent may not silently modify its own Automation schedule, autonomy level, permissions, cloud/credit limits, evaluation thresholds or policy envelope. Any such widening is a separate authenticated, explicit authority transition.

Exit: proactive behavior reuses canonical Automation authority instead of inventing another scheduler or self-modifying control plane.

##### AEE controlled rollout and kill-switch law

Production Agent intelligence must be operationally reversible without granting a second product authority.

Required controls:

- versioned planner/compiler/evaluator capability configuration;
- server-owned rollout cohorts/percentages where staged rollout is used;
- ability to force a capability back to `L0/L1`, disable repair/replanning, disable cloud/paid autonomy or disable one planner/evaluator/model version;
- model/runtime quarantine that fails closed to an already admitted supported fallback or blocks the capability;
- no client-side flag may bypass Core capability/readiness/evidence policy;
- rollback/kill switches can only restrict/disable behavior, never mint readiness, provider, Billing, Artifact or Project authority.

High-impact planner/evaluator/model changes should progress through offline/golden evaluation -> shadow mode -> bounded canary/staged rollout -> wider production only after measured acceptance.

##### AEE acceptance matrix

Every production AEE expansion must prove, as relevant:

- exact schema and unknown-field rejection;
- parser/model prompt injection cannot mint a capability, provider/model selection, ticket, Artifact or Billing authority;
- cross-user/cross-project reference substitution fails closed;
- stale Project/source/garment/outfit/context references fail closed;
- ambiguous target resolution requires clarification/selection rather than best-effort mutation;
- deterministic plan compiler digest/rejection behavior;
- graph cycle/fan-out/node-count/resource bounds;
- compiler optimization preserves semantics and lineage;
- admission receipt/trace correlation is complete;
- crash/reload/lost-response recovery against real PostgreSQL;
- canonical intermediate Artifact lineage;
- retry vs replan identity semantics;
- cancellation ownership;
- `LOCAL_ONLY` transitive zero-provider/zero-credit behavior including repair/replan/HSME-failure paths;
- budget/reservation exhaustion stops cleanly without hidden continuation;
- evaluator cannot execute or mutate by itself;
- Context Graph/memory cannot override canonical state;
- Project remains unchanged until explicit Accept;
- Agent/Automation/Job Center observe the same canonical execution truth;
- shadow/canary/kill-switch behavior where intelligent production routing is enabled;
- exact-head browser/Core/PostgreSQL acceptance on the final candidate.

##### C2 v1 cut line

The v1 production Agent must not wait for every advanced AEE feature, but it must be built **on** the AEE contracts rather than on a throwaway second architecture.

Required before `BERS_V1_RC` for enabled Agent behavior:

- AE-0 consolidation;
- AE-1 structured intent for the enabled surface;
- AE-2 bounded Capability Registry;
- AE-3 deterministic plan compiler / admitted plan representation;
- AE-3.5 admission receipt / trace identity for the enabled graph path;
- AE-4 durable multi-workflow execution proof;
- minimum AE-7 budget/autonomy envelope;
- server-owned capability kill switch / fail-closed disable path;
- production browser recovery/retry/cancel/Accept evidence;
- no legacy browser execution authority.

AE-1.5, AE-4.5, AE-5 through AE-11 and the broader evaluation platform continue as the canonical Agent development direction and may land before v1 whenever their evidence is ready, but unfinished advanced autonomy must not masquerade as an enabled production capability.

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
- multi-step execution cannot bypass canonical Artifact/provider/Billing controls;
- enabled Agent paths have traceable admission/execution/evaluation evidence and a fail-closed operational disable path.

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

### Stage E — BERS Local-First AI Engine: HSME + Hierarchical Adapter-MoE + FreeToken-inspired Runtime

Goal: complete a meaningful pre-release implementation/evidence validation of the long-term BERS-owned local-first image AI architecture rather than maintaining separate older `MoE/DiT` and newer HSME roadmaps.

The detailed companion authority for this R&D architecture is `BERS_HYBRID_SPARSE_MOBILE_ENGINE_ROADMAP.md` together with #352. The master sequence below intentionally follows the newer HSME architecture:

`HSME control plane -> compact dense distilled student -> Adapter-MoE -> measurable residency/prefetch runtime -> selective/timestep/spatial sparse mechanisms -> hardware-specialized real-device candidates`.

FreeToken is a design/reference source for memory/runtime mechanisms, not a drop-in diffusion runtime. Production admission remains separate and fail-closed.

#### E1 — HSME control-plane / expert-pack runtime

Required:

- advisory task/capability routing remains subordinate to Core admission;
- immutable signed/hash-verified model/expert pack identity rooted in the accepted model fleet;
- on-demand acquisition/cache/readiness states without network weight streaming during active inference;
- device profiling and bounded resource admission;
- canonical `LOCAL` / `HYBRID` / `CLOUD` / `BLOCKED` policy integration without creating a second execution vocabulary;
- download/cache/prefetch/bytes-moved observability;
- fail-closed readiness evidence when a required pack/device/runtime is unavailable.

The already accepted HSME-1 read-only pack identity/readiness slice is the substrate; extend it without granting model/provider/Billing/Project/Artifact authority.

#### E2 — Compact dense distilled BERS mobile student

Before sparse claims:

- select commercially admissible teacher/reference set and controlled training baseline;
- pin model/source/toolchain/license identity;
- establish a compact dense student baseline;
- prioritize task/domain distillation and few-step schedules before complex sparse offload;
- establish quality, latency, memory, package/download, energy/thermal and real-device baselines;
- define replay/evidence format and Core capability boundary;
- evaluate hardware-specific representation feasibility with distinct immutable identities under the current fleet schema.

The dense student remains the exact baseline against which sparse complexity must prove product value.

#### E3 — Adapter-MoE first

The first true BERS MoE generation should use a shared dense core plus compact specialist deltas/adapters rather than many full-model experts.

Compare at least:

- dense shared baseline;
- shared core + small Adapter-MoE expert set;
- Top-1 vs tightly bounded Top-2/shared+specialist routing;
- dense-to-sparse conversion where technically credible as a secondary experiment.

Measure actual resident/installed bytes, quality, wall-clock latency, kernel efficiency and bytes moved. Theoretical active-parameter count is not sufficient.

#### E4 — FreeToken-inspired adaptive residency/runtime

Implement only mechanisms that produce measured image-runtime value:

- hot/warm/cold expert residency;
- global/usage-aware cache policy;
- deterministic known-schedule prefetch before broad speculation;
- asynchronous/double-buffered weight movement;
- elastic memory budgets;
- bandwidth-aware placement;
- immutable packed/sharded expert weights;
- cache hit/miss, useful/wasted prefetch, flash reads, accelerator stall and bytes-moved telemetry;
- fail-closed resource admission before large materialization;
- heterogeneous CPU/GPU/NPU placement where real hardware supports it.

Do not import LLM-specific KV-cache/prefix-cache/autoregressive assumptions into image authority.

#### E5 — Scheduled hierarchical sparsity and HSME v2 experiments

Only after E1-E4 are measurable, evaluate increasingly sophisticated sparse mechanisms in this order:

1. selective internal sparse MoE blocks only where dense-vs-sparse wall-clock comparison is favorable;
2. timestep/denoising-stage specialization and predictable schedule-aware prefetch;
3. guided/coarse block/expert-group routing before unrestricted token routing;
4. bounded expert capacity tied to `FAST` / `BALANCED` / `QUALITY` / `ULTRA` quality budgets;
5. schedule-aware Expert Residency Planner;
6. optional spatial/token sparsity and Expert-Choice/capacity-directed routing.

Every mechanism receives an individual `ADVANCE / REDESIGN / REJECT` decision. Sparse FLOPs or novelty are never promotion evidence.

#### E6 — Hardware-specialized desktop/mobile candidates

Desktop/native:

- GPU/RAM expert residency;
- prefetch/offload;
- tiered quality/performance profiles.

Mobile:

- at least one functioning real mobile backend is required for the pre-RC feasibility gate;
- Apple Metal/Core ML/ANE and Android Vulkan/GPU/QNN/Hexagon are evaluated only where graph/kernel support is real;
- materially different hardware/runtime representations receive distinct immutable fleet identity/evidence under the current schema;
- package, latency, RAM/unified memory, flash/RAM/accelerator bytes moved, battery/energy, thermal and quality evidence;
- avoid pathological flash traffic, scatter/gather and dynamic-routing overhead that erase sparse benefits.

Browser/WebGPU/WASM evidence is useful but does not by itself satisfy the mobile gate.

#### E7 — Mandatory pre-release HSME milestone

Before `BERS_V1_RC`, this workstream must reach `R&D_VALIDATED` with:

1. an implemented HSME control plane with signed/hash-verified pack identity/readiness and device/resource evidence;
2. one pinned compact dense DiT/mobile-student baseline with exact source/toolchain/license identity;
3. at least one functioning Adapter-MoE/sparse prototype with bounded expert capacity;
4. a measured routing comparison across credible task/stage/block/spatial alternatives;
5. implemented FreeToken-derived residency/cache/prefetch/resource mechanisms with hit/miss and bytes-moved telemetry;
6. few-step/precision/quantization evidence rather than theoretical size claims;
7. at least one functioning **real mobile backend** with latency, RAM/unified-memory, storage, bytes-moved, battery/energy, thermal and quality measurements;
8. representative selective internal sparse/timestep/spatial-token candidates tested sufficiently to receive individual `ADVANCE / REDESIGN / REJECT` decisions;
9. an integrated dense-vs-HSME comparison for quality, latency, memory, storage, energy and bytes moved;
10. explicit desktop and mobile feasibility decisions;
11. a final architecture-level `ADVANCE / REDESIGN / REJECT` decision for the next BERS Local-First AI Engine generation.

Production admission before v1 is optional and evidence-driven. **R&D validation before v1 is mandatory.** A recorded blocker may reject a specific backend/mechanism but does not substitute for the required functioning mobile backend.

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
- Agent bounded multi-step run compiled through the admitted AEE plan contract, including admission trace, refresh/recovery and explicit Accept;
- Automation durable run for the enabled v1 subset;
- Job Center refresh/reconciliation/cancel/retry;
- `LOCAL_ONLY` cannot reach provider or credits, including Agent retry/repair/replan/HSME-resource-failure paths;
- cross-user/cross-project Artifact/Garment/Outfit/run/Agent-plan/context substitution denied;
- production Agent capability can be fail-closed disabled/rolled back through server-owned configuration without creating an alternate execution path.

If Billing is enabled in v1, add checkout/webhook/entitlement transition as mandatory release E2E. If Billing is not enabled, prove paid-plan and credit-mutation UI is gated.

#### F2 — Release evidence

- production image/migrations/startup/health;
- target deployment/security checks;
- repository rules/protection checks;
- tenant isolation;
- local-only zero-credit evidence;
- real-device/manual quality evidence for every enabled visual/model claim;
- versioned golden evaluation evidence for enabled Agent/model intelligence where applicable;
- admission/execution/Artifact/evaluator traceability for enabled AEE paths;
- staged-rollout/kill-switch/rollback proof for enabled Agent/model/runtime intelligence;
- accessibility/error/loading/recovery review;
- privacy/retention review for enabled Voice/Agent memory/feedback data;
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
- HSME + Hierarchical Adapter-MoE + FreeToken-inspired runtime workstream has reached `R&D_VALIDATED`;
- enabled intelligent capabilities have trace/evaluation/rollback evidence appropriate to their claim;
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
- Agentic Execution Engine: AE-0 consolidation -> AgentIntent/Context Graph -> Capability Registry -> Plan Compiler/Admission Receipt -> durable graph execution -> AEE-HSME contract -> evaluator/replanner/budget -> multimodal/creative autonomy
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

### Lane 4 — HSME / sparse runtime R&D

- HSME control plane and pack readiness
- dense distilled mobile student
- Adapter-MoE
- FreeToken-derived residency/cache/prefetch
- selective/timestep/block/spatial sparse mechanisms
- quantization/few-step
- desktop/mobile hardware-specialized feasibility

### Lane 5 — Evaluation / observability / rollout

- unified intent -> admission -> execution -> Artifact -> evaluation trace
- golden Agent/Try-On/Voice/HSME benchmark suites
- user Accept/Reject/ranking outcome instrumentation with privacy controls
- planner/evaluator shadow mode
- staged capability rollout/canary and server-owned kill switches
- failure/latency/cost/local-cloud/HSME telemetry

### Lane 6 — Release/security/E2E

- main protection/rulesets
- deployment/security
- browser E2E
- privacy/retention review
- release classification/evidence

A shared authority file/contract must not be edited independently by multiple active branches. If two lanes converge on the same authority, serialize the dependency and clean-reparent the later change to current `main`.

## 6. Priority order inside each lane

When choosing between multiple useful tasks, prefer:

1. correctness/security/data-loss blockers;
2. canonical user journey completion;
3. recovery/idempotency/reconciliation;
4. observability/evaluation needed to prove the user outcome;
5. real-device/real-image evidence;
6. latency/memory/package/cost reduction;
7. additional capabilities;
8. speculative optimization.

Quality is preferred over speed, but complexity without measured product benefit is rejected.

## 7. Decision process for each technical problem

For material architecture/runtime decisions:

1. identify at least two credible alternatives when alternatives genuinely exist;
2. compare correctness and authority impact first;
3. compare quality and user outcome;
4. compare observability/replay/debuggability;
5. compare latency/memory/storage/cost;
6. compare implementation and maintenance complexity;
7. select one approach and record why the alternatives were rejected;
8. build the smallest focused acceptance slice that can falsify the decision;
9. use shadow/golden/canary evidence where intelligent behavior can vary;
10. promote only after exact-head evidence.

Do not broaden thresholds or authority merely to obtain green CI.

## 8. Current next sequence from main

From current `main`, the preferred execution sequence is:

1. keep this roadmap bound to #365 and update it when accepted architecture materially changes;
2. finish repository protection/ruleset authority (#355);
3. continue Fashion UI convergence over the already accepted Garment/Wardrobe/Collections/Outfit clients;
4. activate deterministic Try-On product UI only after prerequisites remain production-real (#314);
5. continue orchestration convergence with **AEE AE-0 -> AE-1 -> AE-1.5 -> AE-2 -> AE-3 -> AE-3.5 -> AE-4**, while Automation proceeds through its remaining UI/scheduler stages and Job Center consumes the same canonical run truth;
6. establish the AEE<->HSME execution/evidence contract before Agent planning begins using HSME resource intelligence for production decisions;
7. after the compiler/graph/trace substrate is proven, advance failure taxonomy/replanning, result evaluation/repair, golden/shadow evaluation and bounded autonomy before broader multimodal/creative autonomy;
8. in parallel, complete local model real-device/quality evidence and the F5 Big-LaMa/Kandinsky comparison;
9. in parallel, continue HSME-1 control-plane work, then establish the dense distilled mobile-student baseline before deeper Adapter-MoE/sparse mechanisms;
10. bring #233 browser E2E and unified observability forward incrementally as each Agent/Automation/product journey becomes canonical;
11. add server-owned staged rollout/kill-switch controls before enabling variable intelligent Agent/model behavior broadly;
12. close/gate Billing before RC, including bounded financial reservation if paid autonomous Agent execution is enabled;
13. execute the complete pre-release matrix, select exact `BERS_V1_RC`, then run final release evidence.

## 9. Definition of program success

The pre-release program is complete when BERS has:

- a secure canonical Core/Project/Artifact foundation;
- a production-usable Editor and deterministic local tool base;
- production Wardrobe/Collections/Outfit and deterministic Try-On;
- a bounded production Agent built on the AEE intent/context/compiler/admission-trace/admitted-graph contracts rather than a competing browser or in-memory execution authority;
- a bounded durable production Automation path;
- a durable production Job Center;
- an evidence-based advanced local generative strategy;
- a validated BERS Local-First AI Engine direction using HSME + Hierarchical Adapter-MoE + FreeToken-inspired runtime mechanisms;
- a unified evaluation/observability path capable of distinguishing runtime success, goal success, quality success and user outcome;
- server-owned staged rollout/kill-switch controls for enabled variable-intelligence capabilities;
- privacy/retention boundaries for enabled Voice, Agent memory and feedback data;
- honest model/device/license classifications;
- protected release governance;
- mandatory browser E2E against built frontend + Core + PostgreSQL;
- one exact accepted `main` SHA that can truthfully be declared `BERS v1.0 RELEASED`.