# BERS Agentic Execution Engine — authority boundary

This file is an implementation-boundary companion to `BERS_V1_DEVELOPMENT_ROADMAP.md`. It does not create a second Agent runtime.

## Production execution truth

The only production Agent execution-state authority remains the accepted server path built on:

- `BoundedAgentDeterministicWorkflowService`;
- `WorkflowContinuation`;
- `ExecutionRun`;
- canonical local/Creative execution authorities;
- canonical Artifact authority;
- explicit Project FINAL Accept.

AEE is a planning/compiler plane **above** those authorities. `AgentIntentV1`, future `PlanProposalV1`, evaluators, memory and reasoning output are advisory until deterministic Core compilation/admission.

## Existing Agent layers

### `src/lib/agent/*`

Classification: **legacy/advisory compatibility planning facade — no production execution authority**.

Useful concepts may be retained (structured request parsing, dependencies, ambiguity, task optimization and preview state). `executionQueue.run()` must remain fail-closed with `AGENT_EXECUTION_NOT_WIRED`. Browser task/history objects are not Artifact lineage, rollback, terminal state, retry identity or Billing truth.

### `src/platform/agent/*`

Classification: **planning/reasoning/research primitives and compatibility harness — no production execution authority**.

The historical `Agent`/`ExecutionSupervisor` can execute against an injected `AIOrchestrator` for isolated research/tests. That process-memory session/history path is explicitly non-production and must not be imported by production UI/application/Core composition. Individual pure primitives may be adopted later only behind reviewed AEE Core contracts.

## AEE v1 contract sequence

`untrusted reasoning -> AgentIntentV1 -> PlanProposalV1 -> deterministic Core Plan Compiler -> AdmittedPlanGraphV1 -> WorkflowContinuation + ExecutionRun`.

Rules:

- reasoning output cannot directly select provider/model/runtime or mint execution identities;
- no browser/in-memory Agent state is durable run truth;
- no AEE planning component mutates Project or accepts Artifacts;
- `LOCAL_ONLY` remains transitive through planning/repair/replan;
- repair/replan is a new bounded proposal admitted by Core, never an unbounded model-owned loop;
- HSME is a Core-subordinate execution realization, not an Agent authority;
- Automation and future proactive AEE reuse the accepted scheduler/execution authorities rather than inventing background loops.
