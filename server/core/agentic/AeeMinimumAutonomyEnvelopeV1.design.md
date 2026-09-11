# AEE AE-7 minimum autonomy envelope V1

Issue: #555
Release gate: #365

## Decision

BERS v1 does not add a second autonomy-policy state machine for the enabled bounded Agent surface.

The production browser command is converted by `BoundedAgentAeeCompatibilityCompilerV1` into a server-owned `AgentIntentV1` and then into the immutable `AdmittedPlanGraphV1`. The browser does not supply node/retry/replan/candidate/cloud/credit/time/memory limits, provider identity, model identity or autonomy level.

For the enabled compatibility surface, product semantics are **L1 PLAN_AND_CONFIRM**: the user explicitly initiates the bounded plan. Runtime execution may recover or retry only inside the already admitted graph envelope. It cannot implicitly accept a Project result.

## Minimum RC envelope

The current server-owned compatibility envelope is:

- execution policy: `LOCAL_ONLY`;
- cloud allowed: `false`;
- paid credits: `0`;
- maximum graph nodes: `2`;
- maximum graph-wide retries: `8`;
- maximum replans: `0`;
- maximum candidates: `1`;
- maximum wall clock: `86_400_000 ms`;
- maximum memory: the immutable graph field enforced at executor admission by #548.

AE-3 binds these values into the admitted graph digest. AE-4b enforces graph shape, retry and wall-clock state from `WorkflowContinuation + ExecutionRun`. #548 owns executor-specific peak-memory admission. No browser/planner telemetry can widen those authorities.

## Retry interpretation and backward safety

Existing durable graphs already define `maxRetries` as one graph-wide retry budget. V1 retains that meaning.

This is conservative with respect to the AE-7 requirement for a maximum retry count per node: retries for any one node can never exceed the graph-wide total. Reinterpreting an old graph with `maxRetries = N` as `N` independent retries for every node would widen previously admitted authority after restart, so that change is forbidden.

If later autonomy requires independent per-node quotas, they must be introduced through a versioned intent/graph policy contract with explicit replay compatibility. They are not retrofitted into V1.

## Unsupported autonomy remains zero-authority

AE-5/6 repair, replan, candidate fan-out and ranking are not reachable from the enabled V1 execution driver. `maxReplans=0` and `maxCandidates=1` reflect that fact rather than pretending unsupported autonomy exists.

Paid/cloud autonomy, HSME/provider routing and proactive scheduling are likewise outside this minimum slice. Any future introduction must use the existing Core provider/Billing/Automation authorities and must not create a second policy vocabulary or scheduler.

## Project and Artifact law

Agent execution may produce canonical candidate FINAL/COMPOSITE lineage, but Project mutation still requires explicit Project Accept. Retry, recovery or future evaluation cannot bypass stale-source checks or mutate the Project cursor directly.

## Memory dependency

This minimum AE-7 gate is not complete until #548 is accepted. A digest-bound `maxMemoryBytes` value without executor-owned runtime admission is only a sentinel, not an enforced resource guarantee.

## Exit

#555 can close only when:

1. the exact server-owned envelope is regression-locked;
2. browser/API surfaces expose no budget/autonomy widening fields;
3. retry and wall-clock enforcement remains durable and replay-safe;
4. #548 memory enforcement is accepted;
5. exact-head AEE, WorkflowContinuation, Node.js, R3k and Automation regressions are GREEN.
