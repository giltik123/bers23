# Transaction Runtime

## Implemented boundary

`server/transactions` is platform-agnostic. `TransactionService` performs only
atomic reservation/commit/release commands. `RecoveryService` owns provider
status orchestration. Persistence implements `TransactionStore`; vendor APIs may
exist only in infrastructure adapters.

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
