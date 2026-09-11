# AEE execution resource budget V1

Issue: #548

## Guarantee

`maxMemoryBytes` is enforced as a deterministic Core admission envelope for the currently admitted AE-4 browser deterministic executors before a new or continued local attempt is delegated to the serial driver.

The V1 resource model is intentionally limited to exact reviewed executor/runtime identities for Orthogonal Transform and Resize. Unknown tools, changed executor versions or changed browser realization contracts fail closed until a new versioned profile is reviewed.

The estimate covers the explicit canonical RGBA source/output working sets, deterministic PNG scanlines, the encoder's explicit CompressionStream input copy, a conservative encoded-payload bound, Core decoded/recomputed output working sets and a deterministic runtime/native reserve.

The graph-wide admitted budget is immutable and digest-bound. Retry/reload cannot supply or widen a different memory envelope. Browser, planner, provider and result telemetry are not accepted as admission authority.

Resource admission applies only while an execution can still create or continue local work. A terminal `SUCCESS`, `FAILED`, `CANCELLED` or `UNKNOWN` continuation remains replayable even if a later resource-model version becomes stricter; calibration cannot retroactively revoke durable execution history. Cancellation is likewise never blocked by the memory gate.

## Calibration evidence

The dedicated exact-head acceptance runs the real Orthogonal Transform and Resize browser kernels plus deterministic PNG encoding in system Google Chrome. It samples `Runtime.getHeapUsage` through CDP, including `usedSize`, `embedderHeapUsedSize` and `backingStorageSize`, and records the baseline-delta peak for each reviewed profile.

The calibration must remain below the profile's modeled browser peak. The resulting artifact is JSON-only and explicitly evidence-only; it does not feed measured values back into production admission. A measurement above the model invalidates the profile and requires a reviewed version increase or disablement.

## Non-guarantees

This is not OS/process hard memory isolation and does not claim that browser or libvips allocators can never transiently exceed the modeled peak. Runtime/device telemetry is calibration evidence only. If measurements invalidate a profile, the profile must be versioned/raised or disabled; telemetry cannot widen an already admitted graph budget.

V1 therefore turns the former non-enforced AEE memory sentinel into a real fail-closed resource admission contract for the exact reviewed deterministic tools, while leaving hard sandboxing and broader HSME/model/provider resource profiles to later slices.
