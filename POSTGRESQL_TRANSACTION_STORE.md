# ADR — PostgreSQL Transaction Store

## Status

Accepted for implementation. PostgreSQL is the financial source of truth.
Supabase may host PostgreSQL for Beta, but Supabase APIs are not application
architecture. AI endpoints are not connected until migrations and concurrency
tests pass against a real PostgreSQL instance.

## Boundary

Transaction Gateway executes `TransactionStore` inside one PostgreSQL
transaction. Reserve/commit/release rules remain in TypeScript. PostgreSQL is
limited to transactions, row locks, constraints, reads, inserts and updates.
Business policy must not move into stored procedures or database functions.

Internal financial tables are never browser-accessible. RLS is not used for this
boundary. `PUBLIC` has no privileges; deployment grants only the backend service
role the minimum required table permissions.

## Isolation and lock order

Every command uses `READ COMMITTED` with explicit row locks. All commands use
one order whenever those resources participate:

1. Wallet (`credit_wallets ... FOR UPDATE`).
2. Reservation (`credit_reservations ... FOR UPDATE`).
3. Journal sequence (`reservation_journal_sequences ... UPDATE RETURNING`).
4. Journal append (`transaction_journal INSERT`).

No code may acquire these locks in the opposite order. Deadlocks are treated as
retryable infrastructure failures with bounded retries at the gateway; business
commands themselves remain idempotent.

## Invariants

Wallet:

- `balance >= 0`;
- `reserved >= 0`;
- `reserved <= balance`;
- `total_credited >= 0`;
- `lifetime_spent >= 0`;
- `balance = total_credited - lifetime_spent`.

Reservation:

- exactly one financial state: reserved, committed, or released;
- committed and released are mutually exclusive terminal states;
- immutable amount, operation ID/version, provider, fingerprint and owner;
- provider state is stored separately from financial state;
- provider success is required before commit.

Journal:

- append-only and immutable;
- uniqueness only on `(reservation_id, sequence)`;
- sequence is gapless, strictly increasing and never reused;
- repeated events such as provider retry or recovery deferred are valid;
- terminal uniqueness and causality are enforced by TransactionStore, not by
  event-name uniqueness.

## Recovery leases

Recovery claims abandoned reservations atomically with `FOR UPDATE SKIP LOCKED`
and persists `lease_owner`, `lease_until`, and incremented `lease_version` in the
same transaction. This prevents two workers from processing the same reservation
concurrently.

## Schema ownership

Journal sequencing is stored separately in `reservation_journal_sequences` so
reservation business state does not own journal mechanics. Wallet stores only
financial aggregates: total credited, lifetime spent, balance, and reserved.

## Version strategy

Wallet commands hold the wallet row with `FOR UPDATE`; therefore optimistic CAS
is redundant inside the same command. `version` is intentionally an audit and
reconciliation counter: every successful wallet mutation increments it while
the row lock supplies concurrency control. If a future command cannot hold the
row lock, it must use `WHERE version = expected_version` and reject a zero-row
update rather than silently weakening concurrency.

## Constraint timing

PostgreSQL does not provide deferrable `CHECK` constraints. Deferral is not
needed here because each wallet statement updates balance, reserved,
lifetime-spent, and total-credited aggregates together and leaves the row valid
at statement end. Multi-statement temporary inconsistency is forbidden.

## Migrations

`001_transaction_store.sql` is a forward migration and
`001_transaction_store.down.sql` is its explicit rollback. The forward migration
is intentionally not silently re-runnable: the deployment migration table must
record it exactly once. A partial or repeated application fails visibly rather
than hiding schema drift behind `IF NOT EXISTS`.

## Retry policy

The driver runner makes at most three attempts with bounded exponential delays.
Only classified PostgreSQL serialization, deadlock, connection, shutdown, and
capacity codes are retried. Validation, constraint, authorization, and business
errors are never retried. Command idempotency makes retry after an uncertain
connection outcome safe.

## Transaction timeouts

Each attempt sets transaction-local `lock_timeout` (2 seconds by default) and
`statement_timeout` (15 seconds by default) through parameterized `set_config`.
The lock timeout must be lower than the statement timeout. Configuration is
bounded so a caller cannot accidentally disable timeouts or hold financial locks
indefinitely.

## SQLSTATE and connection reuse

Retry classification uses the PostgreSQL SQLSTATE `code` only and never parses
localized error messages. Every retry performs a new pool checkout. Any physical
client involved in a retryable error is discarded even when rollback succeeds;
therefore the pool cannot hand that same connection to the next attempt. A
rollback failure also forces discard. Connection-acquisition failures are
retried without a client to release.

`55P03` lock timeout is retryable within the same bounded policy. `57014`
statement cancellation is intentionally not retried automatically: it indicates
that the whole command exceeded its execution budget rather than briefly losing
a lock race.

## Recovery query plan

Recovery batches are limited to 1–100 records. The production query filters
`status = 'reserved'`, expired `expires_at`, and expired/null `lease_until`, then
orders by `expires_at` and uses `FOR UPDATE SKIP LOCKED`. The partial composite
index `(expires_at, lease_until) WHERE status = 'reserved'` matches this actual
filter/order shape. Separate provider-state and lease-owner indexes support
operations and diagnostics but are not claimed as substitutes for the recovery
index.
