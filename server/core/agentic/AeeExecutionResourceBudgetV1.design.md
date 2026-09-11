# AEE execution resource budget V1

Issue: #548

## Guarantee

`maxMemoryBytes` is enforced as a deterministic Core admission envelope for the currently admitted AE-4 browser deterministic executors at the last server-owned seam before a genuinely new local-execution ticket can be minted.

The V1 resource model is intentionally limited to exact reviewed executor/runtime identities for Orthogonal Transform and Resize. Unknown tools, changed executor versions or changed browser realization contracts fail closed until a new versioned profile is reviewed.

The estimate covers the explicit canonical RGBA source/output working sets, deterministic PNG scanlines, the encoder's explicit CompressionStream input copy, a conservative encoded-payload bound, Core decoded/recomputed output working sets and a deterministic runtime/native reserve.

The graph-wide admitted budget is immutable and digest-bound. Before issuance, the guard rebinds the local request to the durable AEE continuation and immutable admitted graph, verifies the exact deterministic tool identity, source Artifact, operation parameter surface, single PNG output contract and output geometry, then evaluates the graph resource model against `effectiveExecution.maxMemoryBytes`.

`AeeSerialAdmittedGraphDriverV1` remains the sole AEE execution coordinator. The resource gate owns no continuation, retry, ticket, Artifact, Project, provider or billing state. It is installed once on the existing server-only `WorkflowBoundLocalExecutionTicketV2Issuer` and runs only for new workflow-bound issuance. Non-AEE/legacy workflow bindings and standalone local execution retain their previous behavior.

An already durable ticket is replayed before the resource guard and is not re-admitted by a later profile version. Consequently submission/recovery of work that has already executed cannot be retroactively rejected merely because a future resource profile becomes stricter. Retry is checked when it attempts to mint its replacement ticket, and the next graph node is checked when that node attempts issuance.

Browser, planner, provider and result telemetry are never accepted as memory authority and cannot widen a digest-bound graph budget.

## Calibration evidence

The dedicated exact-head acceptance runs the real Orthogonal Transform and Resize browser kernels plus deterministic PNG encoding in system Google Chrome. It samples `Runtime.getHeapUsage` through CDP, including `usedSize`, `embedderHeapUsedSize` and `backingStorageSize`, and records the baseline-delta peak for each reviewed profile.

The calibration must remain below the profile's modeled browser peak. The resulting artifact is JSON-only and explicitly evidence-only; it does not feed measured values back into production admission. A measurement above the model invalidates the profile and requires a reviewed version increase or disablement.

## Non-guarantees

This is not OS/process hard memory isolation and does not claim that browser or libvips allocators can never transiently exceed the modeled peak. Runtime/device telemetry is calibration evidence only. If measurements invalidate a profile, the profile must be versioned/raised or disabled; telemetry cannot widen an already admitted graph budget.

V1 therefore turns the former non-enforced AEE memory sentinel into a real fail-closed resource admission contract for the exact reviewed deterministic tools, while leaving hard sandboxing and broader HSME/model/provider resource profiles to later slices.
