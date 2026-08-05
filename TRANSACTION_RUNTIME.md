# Transaction Runtime

## Implemented boundary

`server/transactions` is platform-agnostic. `TransactionService` performs only
atomic reservation/commit/release commands. `RecoveryService` owns provider
status orchestration. Persistence implements `TransactionStore`; vendor APIs may
exist only in infrastructure adapters.

`ReservationGateway` is the 4C.1 input boundary between an already authorized
operation and `TransactionService`. It accepts no client amount, provider,
operation version, owner, project owner, or fingerprint. Those fields come from
the trusted authorization context, while the request payload is canonicalized
and SHA-256 fingerprinted server-side. Client idempotency keys are restricted to
16–128 safe characters before reaching persistence.

`BillableOperationService` is the 4C.2 orchestration boundary. For a newly
created reservation it records provider dispatch, executes the provider, and
commits only after a recorded provider success. A provider-confirmed failure is
recorded and released. An ambiguous transport failure remains reserved and is
marked for Recovery instead of granting potentially completed work for free.
An idempotent reservation replay never dispatches the provider a second time;
the caller receives `provider_outcome_pending` while the existing reservation is
non-terminal, or the existing terminal reservation after resolution.

Financial and provider state transitions are monotonic. Once a reservation is
committed or released, provider facts and recovery-deferred facts can no longer
be appended. Concurrent commit/release commands serialize on the wallet and
reservation locks; exactly one terminal direction can apply and the other must
conflict. Public orchestration errors use stable codes such as
`provider_failed` and `provider_outcome_pending` without provider or database
error details.

## Operational integration

`createPostgresTransactionRuntime` is the production composition root for the
`pg` pool, retrying runner, PostgreSQL store, transaction services, gateway and
billable-operation orchestrator. Connection strings stay inside pool
configuration and are never emitted to logs or API responses.

`createBillableOperationHandler` exposes a framework-neutral POST boundary with
injected request authentication/authorization and provider routing. It accepts
the idempotency key from the `Idempotency-Key` header (with a body fallback),
returns `202 provider_outcome_pending` for ambiguous or replayed in-flight work,
and maps unexpected failures to `internal_error` without infrastructure detail.

`RecoveryWorker` runs bounded non-overlapping batches. PostgreSQL recovery
leases remain the cross-process concurrency authority, so multiple worker
instances can run without claiming the same reservation. Structured telemetry
contains operation, provider, reservation and `correlation_id`, but never
request payloads, credentials, connection strings or raw provider errors.

The included in-memory adapter is executable for verification and local tests.
It is not a production durability substitute. The current Base44 SDK exposes no
verified transaction or compare-and-set primitive, so no unsafe multi-write
Base44 adapter is connected.

## Journal integrity

Sequence numbers are gapless positive integers per reservation: `1, 2, 3, ...`.
Assignment is atomic with append. A sequence number is never skipped, reused, or
renumbered, including after archival. Same-terminal command replay returns the
existing terminal entry and does not consume another sequence.

Required causality is:

```text
reservation_created
  → provider_dispatched
  → provider_succeeded → reservation_committed
  → provider_failed    → reservation_released
```

A reservation that was never dispatched may be released by Recovery. Commit
without a preceding provider success is forbidden. Provider result without a
dispatch is forbidden. Conflicting provider results are forbidden.

Every reservation and journal entry carries the same internal `correlation_id`
through API, reservation, provider, recovery and audit flows. It is diagnostic
only and does not replace authentication, idempotency, ownership or fingerprint
checks.

Every journal entry has an immutable `source`: `reservation_service`,
`transaction_service`, `recovery_service`, or `manual_resolution`.

## Service responsibilities

Transaction Service is deliberately narrow: it applies valid state transitions,
changes balances atomically, and appends journal facts. It does not schedule,
poll providers, run timers, own queues, or decide retry policy.

Recovery Service owns abandoned-work orchestration. Unknown outcomes remain
reserved, append `recovery_deferred`, and must be retried with bounded policy or
escalated to an audited manual resolution path.

## Production blocker

A production adapter must atomically combine wallet mutation, reservation state,
idempotency uniqueness, gapless journal sequence and journal append. A chain of
independent entity reads and updates is non-compliant and must fail closed.
