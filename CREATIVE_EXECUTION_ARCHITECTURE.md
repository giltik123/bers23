# Sprint 6.29 — canonical Creative execution architecture

## Canonical path and ownership

The only recommended production path is:

`CreativeRequest → DecisionPort → PlanningPort → CreativeExecutionPlan → CreativeWorkflowEngine → pipeline operations → TargetSelectorPort → SecurityGatePort → local/provider runtime port → verification → ProductionRecoveryPort → ProductionOutcome → TelemetryBillingBridgePort`.

`CreativeExecutionPlatform` is the public facade. `CreativeWorkflowEngine` is the sole workflow execution authority. Production runtime owns durability, idempotency, operational recovery, limits and observability; it must wrap the facade rather than interpret a creative graph. The AI execution manager is an operation adapter only for migrated callers. Decision describes **what**, planning decomposes **how**, execution compiles the graph, pipeline describes artifact transformations, the operation library defines ISA semantics, target selection chooses resources, and runtime ports perform inference.

Canonical contracts live in `creative/canonical/contracts.ts`. In particular, `CreativeArtifact` and `CreativeOperationState` are semantic authorities. Existing `Artifact`, `ImageArtifact`, provider artifacts and lowercase status types are compatibility views and must be mapped at their boundary, not imported as new domain authorities.

## Inventory completed before consolidation

Status meanings: **CANONICAL**, **ADAPTER**, **DEPRECATED**, and **DELETE_AFTER_MIGRATION**. No files were mass-deleted during inventory.

| Component | Responsibility | Inputs → outputs | Principal dependencies | Owner layer | Status / duplicate | Migration target |
|---|---|---|---|---|---|---|
| `creative/decision/**` | decide what should happen | intent/context → decision | knowledge, preferences | Decision | CANONICAL | `CanonicalDecisionPort` |
| `creative/planning/**` | goal decomposition | decision → creative plan | decision contracts | Planning | CANONICAL | `CanonicalPlanningPort` |
| `creative/execution/**` | graph compilation, estimates, simulation | plan → execution graph | planning, operation metadata | Execution | ADAPTER; engine/retry/replay duplicate workflow/production | compiler + production recovery |
| `creative/workflow-engine/WorkflowEngine` | dependency/state orchestration | compiled workflow → snapshot | runtime, policy, verifier ports | Workflow | CANONICAL, sole authority | unchanged authority |
| `creative/workflow-engine/compiler/**` | compile graph | plan/execution/pipeline views → workflow | workflow contracts | Execution/Workflow boundary | CANONICAL | facade `compile()` |
| `creative/workflow-engine/ArtifactRouter` | scope-safe artifact routing | artifact ids → artifacts | canonical scope | Workflow | CANONICAL implementation view | canonical artifact mapper |
| `creative/pipeline/**` | image transformation topology/quality | operations/artifacts → pipeline graph | operation library | Pipeline | CANONICAL for transformations; recovery/composer are ADAPTER | workflow compiler/recovery port |
| `creative/operations/**` | operation ISA/capability/policy metadata | operation intent → descriptor | capability registry | Operation ISA | CANONICAL | `CreativeOperation` |
| `creative/local-ai/selection/**` | resource/target choice | operation/device/policy → target | local capability data | Resource scheduling | ADAPTER | `TargetSelectorPort` |
| `creative/hybrid/HybridTargetSelector` | legacy hybrid target choice | hybrid operation → target | hybrid services | Resource scheduling | DEPRECATED duplicate | `TargetSelectorPort` |
| `creative/local-ai/runtimes/**`, `local-engine/**` | actual local inference/editing | operation + artifact → result | local model/device APIs | Local Runtime | CANONICAL runtime implementations | workflow runtime port |
| `creative/provider-runtime/**` | external execution boundary | canonical operation request → runtime result | provider adapter | Provider Runtime | CANONICAL boundary | workflow runtime port |
| `creative/providers/**` | provider protocol mapping/transport | provider DTO → provider DTO | external provider | Provider Runtime | ADAPTER; never public | provider-runtime adapter |
| `creative/provider-intelligence/**` | provider availability/ranking | capability/health → provider | provider metadata | Resource scheduling | ADAPTER | target selector/provider port |
| `creative/ai/AIExecutionManager` and graph/coordinator | legacy AI graph execution | AI operations → AI snapshot | provider router/runtime | Runtime adapter | DEPRECATED as graph authority | single-operation adapter invoked after target selection |
| `creative/runtime/**` | cognitive session/blackboard graph | cognitive workspace → runtime snapshot | cognition/orchestrator | Cognitive runtime | DEPRECATED for production execution | decision/planning ports; no execution authority |
| `creative/production/**` | idempotency, durability, timeouts, recovery, concurrency, telemetry | production request → durable state | state store/executor port | Production Runtime | CANONICAL infrastructure; executor is ADAPTER | wrap canonical facade |
| `creative/integration/**` | legacy translators, status/timeline bridges | legacy execution/workflow → mapped view | execution + workflow types | Compatibility | ADAPTER | canonical facade/contracts |
| `creative/hybrid/HybridExecutionEngine`, `HybridExecutionGraph` | legacy local/cloud graph | hybrid request → hybrid result | target/runtime services | Compatibility | DEPRECATED duplicate workflow | canonical facade |
| `creative/hybrid/HybridReplay` | hybrid timeline replay | snapshot → replay | hybrid snapshot | Compatibility | DELETE_AFTER_MIGRATION duplicate | facade logical replay |
| `creative/execution/ExecutionReplay` | execution replay | execution snapshot → replay | execution memory | Compatibility | ADAPTER | logical replay contract |
| `creative/kernel/replay` | cognitive replay | cognitive events → state | kernel events | Cognitive runtime | CANONICAL logical/cognitive replay only | remain non-executing |
| `creative/execution/OperationScheduler` | operation order | execution graph → schedule | graph/resources | Execution scheduling | CANONICAL role | workflow compiler |
| `creative/kernel/scheduling` | assigns cognitive agents | thoughts/agents → assignment | cognitive kernel | Cognitive scheduling | CANONICAL role | remain cognitive only |
| target selectors/resource allocators | choose execution resource | operation/capabilities → location | runtime health | Resource scheduling | ADAPTER | `TargetSelectorPort` |
| `platform/workflow/**` | generic application workflows | workflow definition → execution | generic step runtime | Generic platform | ADAPTER, not Creative authority | Creative compatibility translator |
| `platform/execution/**` | generic execution plans/runners | generic plan → result | generic runtime | Generic platform | ADAPTER, not Creative authority | Creative compatibility translator |
| `platform/orchestrator/**` | generic AI session orchestration | orchestration request → session | generic execution | Generic platform | DEPRECATED for Creative execution | canonical facade |
| `creative/orchestrator/**` | cognitive executive coordination | cognitive state → recommendation | cognition/kernel | Cognitive scheduling | CANONICAL only for thinking; not operations | decision port |
| `creative/vertical-slice/**` | older end-to-end API | edit intent → result | local/provider services | Compatibility | DEPRECATED execution path | canonical facade |

## Dependency and policy rules

Allowed semantic direction is Decision → Planning → Execution → Workflow → Pipeline/Operation ISA → Target Selection → Runtime. Verification reports expected-versus-actual; production recovery alone chooses retry, fallback, partial replan, resume, abort, or unknown. Logical replay is data-only. Execution replay requires an explicit policy and must never make a paid call implicitly.

Forbidden dependencies are runtime → decision, provider → planning, pipeline → decision/provider transport, UI → provider runtime, decision → workflow/provider, and any target/runtime call that bypasses the security gate. The architecture fitness test enforces these rules and checks that authority contracts remain singular.

