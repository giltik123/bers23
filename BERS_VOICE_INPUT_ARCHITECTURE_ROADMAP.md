# BERS Voice Input Architecture Roadmap

**Status: CANONICAL COMPANION ROADMAP — AEE AE-9 / Voice Intent Layer**

This document defines the BERS voice-control architecture as a dedicated input/control subsystem. It complements `BERS_V1_DEVELOPMENT_ROADMAP.md`, especially AEE `AE-1`, `AE-1.5`, `AE-2`, `AE-3`, `AE-7`, `AE-8`, and `AE-9`. It does not create a second Agent, execution engine, provider router, Billing authority, Artifact authority, or Project state machine.

## 1. Product decision

BERS voice is not a dictation-only feature.

The target is a full **Voice Intent Layer** that can become a natural control interface over:

- Editor and Prompt/AI Planner;
- Wardrobe and garment discovery;
- Outfit navigation;
- deterministic/canonical Try-On;
- BERS Agentic Execution Engine (AEE);
- later bounded creative workflows and Automation proposals where their authorities are already accepted.

Canonical product flow:

`Microphone -> Russian-first ASR -> VoiceIntentDraftV1 -> visible/editable interpretation -> typed UI/AEE intent -> Core admission where execution is required -> existing canonical execution -> candidate Artifact -> explicit Accept where Project mutation is required`.

The user must be able to see what BERS understood before any materially consequential action is executed.

## 2. Core architecture law

Voice is **intent**, never authority.

- Voice audio/transcript cannot mint execution identity, provider/model choice, Billing permission, Artifact identity, Project mutation, retry identity, or Automation authority.
- Voice Intent Layer may navigate, populate fields, resolve typed references, and propose actions.
- Any image-producing or financially relevant action must pass through the same canonical application/Core/AEE authority used by non-voice input.
- Voice cannot bypass `editorBusy`, `agentActive`, `tryOnActive`, stale-source, readiness, capability, credit, cloud, or `LOCAL_ONLY` rules.
- A spoken phrase is never equivalent to Project Accept.
- Where current UI deliberately separates selection from execution, Voice preserves that separation.
- Ambiguity fails closed to clarification or visible candidate selection; no destructive/object-targeted best-effort guessing.

Architectural shorthand:

`VOICE = WHAT THE USER SAID`

`VOICE INTENT LAYER = WHAT IT PROBABLY MEANS`

`AEE / PLANNER = WHAT WORK COULD SATISFY IT`

`CORE = WHETHER THAT WORK IS ALLOWED`

`HSME / canonical runtime = HOW ADMITTED WORK IS REALIZED`

`WorkflowContinuation + ExecutionRun = EXECUTION TRUTH`

`Artifact / Project = RESULT AND ACCEPTED STATE TRUTH`

## 3. Russian-first language strategy

Russian is a first-class acceptance target, not merely a supported locale.

Required evaluation categories:

- ordinary conversational Russian;
- Russian morphology and free word order;
- imperative and elliptical commands;
- colloquial phrases such as `вот эту`, `верни как было`, `сделай чуть свободнее`;
- corrections such as `нет, я сказал тёмно-синюю, не чёрную`;
- RU/EN code-switching common in fashion/product vocabulary;
- brand names and proper nouns;
- noisy room / phone microphone / Bluetooth microphone / outdoor speech;
- short commands and longer multi-clause creative instructions;
- numerals and dimensions such as `1024 на 1024`, `на девяносто градусов`, `уменьши процентов на двадцать`.

A model is not accepted for BERS merely because it advertises `ru-RU` support. Promotion requires BERS-owned Russian evidence.

### Primary Russian ASR candidate

The **GigaAM family** is the primary Russian quality candidate.

Current research evidence from the official GigaAM project reports average Russian ASR WER of approximately 8.3% for GigaAM-v3 RNNT across its published validation matrix versus approximately 21.0% for the Whisper baseline used in that evaluation. This is useful quality evidence, but it is not BERS production approval.

Promotion policy:

- benchmark GigaAM-v3 CTC/RNNT as the Russian quality reference where export/runtime support permits;
- use an ONNX/mobile-ready GigaAM representation only after exact model provenance, licensing, hash/signature, runtime compatibility, device performance and BERS-Voice-RU-Eval evidence are accepted;
- GigaAM-v2 has an existing `sherpa-onnx` NeMo-transducer ONNX path and is therefore a practical integration candidate if the preferred v3 representation is not yet suitable;
- no GigaAM model weights are committed directly to Git; they follow the DurableModelFleet/model-pack distribution rules.

### Multilingual fallback

`whisper.cpp` remains a strong multilingual/offline fallback/reference because it has mature C/C++, mobile and browser/WebAssembly examples including microphone streaming and voice-command execution.

Whisper is not automatically the preferred Russian engine when a Russian-specialized candidate materially outperforms it on BERS evidence.

### Ultra-light fallback

A smaller grammar/ASR engine may be evaluated for very weak devices and narrow command vocabularies, but it must not silently replace full-language recognition when doing so would materially reduce intent quality.

## 4. Voice Capability Router

Do not hard-wire BERS UI to one speech recognizer.

Define an engine-neutral `VoiceRecognitionPort` / equivalent with capability metadata and a **Voice Capability Router**.

Target tiers:

1. `BERS_LOCAL_RUSSIAN` — signed/verified BERS Local Voice Pack, Russian-first;
2. `OS_ON_DEVICE` — operating-system/browser on-device ASR when the API explicitly proves local processing and the requested locale is supported;
3. `BERS_LOCAL_MULTILINGUAL` — local multilingual fallback such as an accepted Whisper representation;
4. `REMOTE_EXPLICIT` — remote/cloud ASR only after explicit user policy/consent permits it;
5. `BLOCKED` — no acceptable engine for the requested privacy/quality policy.

Rules:

- the router never changes Core execution target for image work;
- speech routing and image-generation routing are separate authorities;
- `LOCAL_ONLY` voice cannot silently use a remote browser speech service;
- absence of a suitable local engine means Voice may be unavailable rather than silently uploading audio;
- engine selection is inspectable and logged as voice evidence, not execution authority.

## 5. Audio front-end

Voice quality depends on the audio path as much as the acoustic model.

Target pipeline:

`Microphone -> permission -> mono capture -> resample to model rate -> VAD/endpointing -> optional denoise/AGC where evidence supports it -> ASR`.

Requirements:

- push-to-talk first; no always-listening wake word in v1;
- visible recording state;
- explicit stop/cancel;
- bounded maximum utterance duration;
- VAD/end-of-speech detection for latency and battery control;
- device/sample-rate normalization;
- microphone failure and permission denial are explicit states;
- raw audio is transient by default.

Wake-word/background listening is deferred because of privacy, permission, battery, thermal and lifecycle complexity.

## 6. `VoiceIntentDraftV1`

ASR output is not sent directly to execution.

The Voice Intent Layer produces a versioned draft that can contain:

- `schemaVersion`;
- `locale` and detected language/code-switch information;
- final transcript;
- optional partial transcript;
- ASR engine/version/representation evidence;
- confidence where the engine exposes meaningful confidence;
- normalized fashion vocabulary;
- proposed intent kind;
- target surface such as `PROMPT`, `EDITOR`, `WARDROBE`, `OUTFITS`, `TRY_ON`, `AGENT`;
- typed target references when already resolved;
- extracted parameters such as transform mode, width/height, color, garment query;
- preserve/mutable constraints where expressed;
- ambiguities and candidate references;
- whether explicit confirmation is required;
- privacy/processing class.

`VoiceIntentDraftV1` is advisory and editable. It is not `AgentIntentV1` and not an admission receipt.

When AEE processing is needed, the accepted/edited Voice draft becomes one source modality for `AgentIntentV1` through the normal AEE interpretation/compiler boundary.

## 7. Russian Fashion Normalizer

Speech recognition and fashion semantics are separate layers.

Add a Russian-first normalization layer that can map inflected/colloquial language to canonical vocabulary without changing canonical entity identity.

Examples:

- `чёрная куртка`, `черную куртку`, `в чёрной куртке` -> category hints `jackets`, color hint `black`;
- `синие джинсы` -> `jeans` plus `blue/navy` candidates;
- `бежевое платье` -> `dresses` + `beige`;
- `бомбер`, `косуха`, `водолазка`, `кардиган`, `лоферы`, `плиссе`, `деним`, `оверсайз` -> canonical category/style/material hints where defined;
- brand names remain proper-name search tokens rather than being translated destructively.

Normalization rules:

- hints may improve search/ranking, but cannot invent a garment ID;
- canonical Wardrobe/Garment identity must be resolved against current server-owned data;
- 0 good matches -> clarification;
- multiple materially plausible matches -> visible candidate list/clarification;
- one strong READY match may be prepared for explicit user confirmation;
- current selection/context may narrow resolution only when the reference is typed and current.

## 8. Initial supported command families

### Navigation / focus

Low-risk commands may execute immediately when they only change UI focus:

- `открой промпт`;
- `открой Creative Studio`;
- `открой агента`;
- `открой гардероб`;
- `открой образы`;
- `открой примерку`.

### Prompt dictation and editing

Examples:

- `запиши в промпт: сделай освещение теплее`;
- `замени промпт на ...`;
- `добавь: лицо не менять`;
- `очисти промпт`.

Dictation changes text only. It never automatically executes generation unless a separately confirmed command requests execution.

### History

Examples:

- `отмени`;
- `повтори`;
- `верни оригинал`.

These commands call the existing Editor history handlers and inherit their disabled/availability rules.

### Deterministic Editor actions

Examples:

- `поверни на девяносто вправо`;
- `отрази по горизонтали`;
- `сделай 1024 на 1024`;
- `поверни вправо и затем сделай 1024 на 1024`.

For v1, materially mutating image operations are previewed and confirmed before launch, then use existing deterministic application paths or the bounded Agent path.

### Wardrobe

Examples:

- `открой гардероб`;
- `обнови гардероб`;
- `добавь вещь`;
- later `покажи чёрные куртки`, `покажи избранное`, `найди джинсы` once read-only filtering/search is canonicalized.

Voice-triggered create/archive/favorite mutations require the same confirmations/concurrency rules as direct UI actions.

### Try-On

Examples:

- `открой примерку`;
- `примерь чёрную куртку`;
- `проверь готовность этой вещи`;
- `запусти примерку`;
- `продолжи примерку`;
- `восстанови примерку`.

Rules:

- Voice may resolve/select one canonical Outfit/Garment candidate;
- selection never silently implies run;
- run/resume/recover enters the existing canonical Try-On host and preserves readiness/recovery/lineage rules;
- ambiguous garment references require clarification;
- no voice shortcut may bypass manual contour/body-anchor remediation when the canonical workflow requires it.

### AEE

Examples:

- `сделай это через агента`;
- `попробуй три варианта, лицо не меняй`;
- `сохрани фон и измени только одежду`.

These become Voice input to AEE planning. The Voice layer does not construct an executable graph itself.

## 9. Confirmation policy

Classify Voice intents by risk.

`NO_CONFIRMATION`:

- open/focus UI surface;
- populate or edit transcript/prompt;
- read-only search/filter/navigation.

`CONFIRM_BEFORE_ACTION`:

- any image-producing operation;
- deterministic transform/resize initiated from voice;
- Try-On run/resume/recover;
- Wardrobe mutation;
- Agent workflow start;
- cloud/paid request;
- any action that can create a canonical candidate or durable state.

`SEPARATE_CANONICAL_ACCEPT`:

- accepting a generated candidate into Project state remains the existing explicit Accept step even if execution was voice-initiated.

## 10. Privacy and retention

Defaults:

- raw voice audio: transient, memory-only where practical, discarded after recognition unless an explicit feature says otherwise;
- transcript: session-scoped by default;
- durable transcript/history: separate opt-in/policy, not implied by using Voice;
- sensitive identity/face context: never embedded into ordinary ASR vocabulary or durable voice logs without explicit purpose;
- contextual ASR vocabulary: minimized to necessary fashion terms/current bounded candidates;
- `LOCAL_ONLY`: audio and transcript do not leave the local device for ASR;
- remote ASR: explicit processing indicator and user policy required;
- diagnostics should prefer engine/latency/error-class metrics over raw audio retention.

## 11. Integration boundaries

### Editor

Voice connects through typed UI/application callbacks, not DOM clicking automation and not direct provider calls.

### Wardrobe / Outfit

Voice search/resolution consumes canonical read models. Mutations reuse existing revision-safe canonical view models/services.

### Try-On

Voice uses the existing canonical Try-On selection/host API. It cannot create its own Try-On run state.

### AEE

Voice is one `sourceModality` for `AgentIntentV1`. AEE compilation/admission remains unchanged.

### HSME

Voice ASR engine selection may later reuse HSME pack/residency/runtime primitives, but speech model residency does not grant image-work execution authority. A Voice Pack is a local capability pack, not an alternative Core execution target.

### DurableModelFleet

Every downloadable BERS Voice Pack representation follows current fleet identity law: runtime/format/URI/hash/platform are immutable under the accepted model identity/version. Different hardware/runtime representations use distinct accepted fleet identities/versions until a reviewed representation schema says otherwise.

## 12. BERS Voice RU Evaluation

Create `BERS-Voice-RU-Eval-v1` before claiming production Russian quality.

Evaluation groups:

1. **ASR accuracy**
   - WER/CER;
   - short-command exactness;
   - numbers/dimensions;
   - punctuation-independent semantic accuracy.

2. **Intent accuracy**
   - command-family classification;
   - parameter extraction;
   - preserve/mutable constraints;
   - correction handling.

3. **Reference resolution**
   - garment/category/color;
   - `эта/вторая/предыдущая` references;
   - zero/multiple-match ambiguity behavior.

4. **RU/EN fashion code-switching**
   - brands;
   - model/product names;
   - `oversize`, `denim`, `look`, `try-on`, etc.

5. **Acoustic robustness**
   - quiet room;
   - background TV/music;
   - outdoor noise;
   - laptop/phone/Bluetooth microphones;
   - far-field where supported.

6. **Device/runtime metrics**
   - cold/warm start latency;
   - partial/final transcript latency;
   - peak RAM;
   - package/download size;
   - CPU/GPU/NPU utilization;
   - energy/battery;
   - thermal behavior;
   - cache/residency behavior;
   - offline success rate.

7. **Safety/authority**
   - prompt injection in spoken text cannot mint provider/Billing/Artifact authority;
   - spoken `ignore the rules` cannot bypass Core;
   - ambiguous destructive actions do not execute;
   - `LOCAL_ONLY` never remote-falls-back;
   - recognition retry does not duplicate execution.

## 13. Model selection matrix

No ASR engine is accepted by brand/name alone. Compare at least:

- GigaAM-v3 candidate representation(s) where technically feasible;
- GigaAM-v2 ONNX/sherpa-onnx integration candidate;
- Whisper/whisper.cpp multilingual local candidate;
- OS on-device speech engines on supported iOS/Android/browser surfaces;
- optionally one ultra-light command-oriented baseline for weak devices.

Select separately for device tiers if evidence warrants it. Do not force one universal model.

Primary ranking criteria:

`Russian semantic command accuracy -> latency -> offline/privacy -> peak memory -> package size -> battery/thermal -> multilingual robustness`.

For BERS, lower WER is useful but **correct intent and reference resolution** matter more than transcript cosmetics.

## 14. Implementation sequence

### VI-0 — Architecture and authority contract

- companion roadmap accepted;
- `VoiceRecognitionPort` and `VoiceIntentDraftV1` schemas designed;
- no direct provider/Billing/Artifact imports from voice subsystem;
- privacy classes defined.

### VI-1 — Separate Voice UI shell

- dedicated Voice Intent Layer panel/control, separate from `AgentPanel`;
- push-to-talk;
- live/partial transcript;
- stop/cancel;
- engine/privacy indicator;
- editable final transcript;
- understood-intent preview.

### VI-2 — Russian deterministic intent parser

- navigation;
- prompt dictation/edit;
- history;
- deterministic transform/resize;
- Russian number parsing;
- explicit ambiguity states.

This parser is bounded and deterministic; it is not a replacement for future AEE language reasoning.

### VI-3 — Russian Fashion Normalizer

- Russian category/color/material/style vocabulary;
- inflection/alias normalization;
- canonical Wardrobe/Garment candidate search;
- 0/1/N candidate handling.

### VI-4 — Editor / Wardrobe / Try-On bridges

- typed event/callback bridges;
- preserve all existing busy/readiness/revision rules;
- confirmation policy;
- no DOM automation.

### VI-5 — `BERS-Voice-RU-Eval-v1`

- curated and recorded Russian command set;
- noisy/clean audio corpus with licensing/provenance;
- semantic accuracy metrics;
- authority/security cases;
- exact-head CI for deterministic intent behavior.

### VI-6 — Local Russian Voice Pack bake-off

- benchmark GigaAM v3 where export/runtime permits;
- benchmark GigaAM v2 ONNX/sherpa integration;
- benchmark local Whisper representation;
- real-device evidence;
- choose per-device candidate(s) by quality rather than convenience.

### VI-7 — Signed Local Voice Pack distribution

- DurableModelFleet identity/version;
- signed/hash-verified manifest and assets;
- optional download;
- cache/residency lifecycle;
- no network required during inference once installed;
- explicit storage controls.

### VI-8 — AEE multimodal integration

- Voice draft becomes AEE source modality;
- Context Graph references;
- conversational correction/history references;
- bounded Voice -> PlanProposal flow;
- no widening of AEE authority.

### VI-9 — Advanced conversational control

Only after AEE evaluation/replanning is accepted:

- `первый вариант лучше`;
- `возьми свет из второго, а одежду из четвёртого`;
- `сделай ещё два, но лицо не меняй`;
- contextual multi-turn editing;
- Voice + touch/object grounding.

## 15. V1 cut line

For a useful initial Voice release, require at minimum:

- VI-0 through VI-5;
- one accepted Russian ASR route on the target release platform;
- explicit confirmation for image-producing/durable actions;
- no silent remote ASR in `LOCAL_ONLY`;
- Russian intent/reference tests green;
- Voice can control at least Prompt, navigation, History, bounded deterministic Agent actions, Wardrobe navigation, and canonical Try-On selection/run flow without bypassing existing authorities.

VI-6/VI-7 local model promotion may land before or after the first UI slice depending on real-device evidence, but the architecture must already allow it without UI/AEE rewrite.

## 16. Non-goals

Do not implement yet:

- always-listening wake word;
- raw-audio long-term history by default;
- Voice-owned provider selection;
- Voice-owned Billing decisions;
- Voice-owned Project Accept;
- unrestricted arbitrary tool execution;
- automatic cloud fallback from local speech failure;
- full conversational autonomous Agent before AEE bounded autonomy/evaluation is proven;
- committing large speech-model binaries directly to Git.

## 17. Research references

Primary research/integration references to keep under review:

- GigaAM official project: `https://github.com/salute-developers/GigaAM`
- GigaAM Russian evaluation matrix: `https://github.com/salute-developers/GigaAM/blob/main/evaluation.md`
- sherpa-onnx GigaAM v2 NeMo Transducer support: `https://github.com/k2-fsa/sherpa-onnx`
- whisper.cpp local/mobile/WebAssembly speech and voice-command reference: `https://github.com/ggml-org/whisper.cpp`

These projects are references/candidates, not copied wholesale into BERS and not production-approved by inclusion in this roadmap.

## 18. Final architecture target

`Microphone`

`-> Audio Front-End / VAD`

`-> Voice Capability Router`

`-> Russian-first local ASR / accepted fallback`

`-> transcript + ASR evidence`

`-> Russian Fashion Normalizer`

`-> VoiceIntentDraftV1`

`-> visible/editable user interpretation`

`-> typed Editor/Wardrobe/Try-On/AEE intent`

`-> existing Core/AEE admission`

`-> existing WorkflowContinuation / ExecutionRun / HSME / canonical execution`

`-> canonical candidate Artifact`

`-> explicit Accept where Project mutation is required`

This is the canonical BERS Voice Input Architecture unless later evidence-driven ADR/roadmap changes explicitly replace it.
