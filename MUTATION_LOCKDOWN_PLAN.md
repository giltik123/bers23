> **HISTORICAL — RETIRED BASE44 MIGRATION PLAN.**
>
> This file preserves the old PR 4B.5 threat analysis and migration sequencing. Its Base44 ACL/entity instructions are no longer an implementation plan for current `main`. The current financial authority is the PostgreSQL transaction runtime, and future Subscription/Billing/Usage work must use explicit server authorities described in `PROJECT_SOURCE_OF_TRUTH.md`. Do **not** restore Base44 entities, service-role writers, browser SDK mutation permissions, or a generic entity proxy from this document.

# PR 4B.5 — Privileged Mutation Lockdown Plan

## Status

Implementation is blocked until the Base44 entity write policy for this
deployment is confirmed. Adding a server function while leaving browser SDK
write permission enabled would move normal application calls but would not form
a security boundary: a modified client could still mutate the entities directly.

A source-level mutation freeze is active in `eslint.config.js`. It rejects new
browser create/update/delete calls for privileged entities everywhere under
`src/`, except for five explicitly listed legacy adapters that keep current
flows working until coordinated cutover. These exceptions are a temporary
infrastructure workaround, not an authorization boundary and not evidence that
lockdown is complete.

The affected privileged entities are:

- `CreditsWallet`;
- `CreditTransaction`;
- `UserSubscription`;
- `SubscriptionUsage`.

## Confirmed direct client mutations

The current browser code creates or updates all four privileged entity types:

- wallet creation, expiration, and arbitrary wallet update;
- credit reservation, settlement, release, grant, and refund transactions;
- subscription creation, trial changes, expiration, and plan changes;
- usage record creation and counter updates.

Consequently, server-side read validation from PR 4B.4 is not sufficient by
itself. A caller that retains entity write access can manufacture the state that
the authorization pipeline subsequently reads.

## Required security boundary

PR 4B.5 must be implemented as one coordinated deployment:

1. Deny browser create/update/delete access for every privileged entity while
   retaining owner-scoped read access where the UI requires it.
2. Add narrow server commands instead of a generic entity proxy. A server
   command must never accept arbitrary patches, balances, plan status, usage
   counters, or transaction status from the client.
3. Move wallet bootstrap and the one-time welcome grant to a server command.
4. Move subscription bootstrap and trial transitions to server commands.
5. Do not allow a client to activate a paid plan. Paid activation must come from
   a verified billing-provider event; until a billing provider exists, the
   server must return a stable `payment_required` response.
6. Move usage increments to trusted operation completion; never accept arbitrary
   usage deltas from the browser.
7. Move reserve/commit/release to the PR 4C transaction service, using registry
   cost and an idempotency key rather than a client amount.
8. Enable a source-level quality gate that rejects new direct privileged entity
   mutations under `src/` after the existing callers have migrated.

The quality gate is already active for new callers. Its temporary exception
list may only shrink; adding another exception requires a security review and is
not an acceptable integration path.

## Single-writer ownership

Every privileged entity has exactly one server-side writer. Other server
functions may consume its read model but must call the owning service to request
a state transition; they must not write the entity through service role.

| Privileged entity | Sole writer | Allowed responsibility |
| --- | --- | --- |
| `CreditsWallet` | Reservation Service | Reserve, commit, release, and server-approved grants |
| `CreditTransaction` | Transaction Service | Append and transition auditable credit transactions |
| `SubscriptionUsage` | Usage Service | Record trusted completed-operation usage |
| `UserSubscription` | Billing Service | Bootstrap Free, trials, verified billing changes, and expiry |

The writer names describe security boundaries, not generic entity repositories.
They must expose narrow domain commands and use the Operation Registry and
`AuthorizedOperationContext` where applicable. A new endpoint must not become a
second writer merely because it has service-role access.

## Why PR 4C is a dependency

The current client reserves credits before invoking a provider. Removing client
wallet and transaction writes before a server reservation command exists would
break every paid AI flow. Leaving those writes enabled while declaring PR 4B.5
complete would leave the security vulnerability open.

The safe implementation order is therefore:

```text
4B.5A  Confirm and codify Base44 entity write-deny rules
4C.1   Server idempotency and credit reservation
4C.2   Provider commit/release and failure recovery
4B.5B  Migrate remaining subscription/bootstrap/usage commands
4B.5C  Remove client mutations and enable the source-level guard
```

The current deployment cannot proceed from source freeze to runtime cutover
until its persistence adapter proves atomic wallet/reservation/journal writes.
The installed Base44 SDK exposes no verified transaction or compare-and-set
primitive. A gateway implemented as sequential entity calls is explicitly
non-compliant because concurrent requests can overspend the same balance.

This is a sequencing adjustment, not an architecture rewrite. The existing
Operation Registry and `AuthorizedOperationContext` remain the inputs to the
transaction layer.

## Required Base44 confirmation

Before changing entity configuration, confirm the supported repository syntax
and deployment behavior for all of the following:

- owner-scoped read;
- browser create/update/delete deny;
- service-role create/update access;
- whether `created_by_id` may be assigned during service-role creation;
- uniqueness or atomic compare-and-set support for one wallet, subscription,
  and monthly usage record per user.

These details must not be guessed. An invalid rule could either leave mutations
open or lock all users out of their account state.

### ACL validation protocol

Validate the rules in an isolated Staging app with non-production data before
changing Production:

1. Create two ordinary users and one administrator/service test identity.
2. Seed one record per privileged entity for the first user through its intended
   server writer.
3. Confirm both ordinary users cannot create, update, or delete any privileged
   entity through the browser SDK, including records they own.
4. Confirm the owner can read only the owner-scoped fields required by the UI;
   confirm the second user cannot read or enumerate those records.
5. Confirm the owning server writer can create and update its entity through
   service role, while a request without authenticated context is rejected.
6. Confirm server-created records receive the intended `created_by_id` and can
   subsequently be found by the exact owner query used by AuthorizationService.
7. Run two concurrent bootstrap/reservation requests and verify the platform's
   uniqueness or compare-and-set behavior prevents duplicate canonical records.
8. Verify rejected browser writes produce an authorization failure and do not
   partially modify balances, subscription state, usage, or transactions.
9. Repeat the checks after deployment using a fresh user, then review server
   logs for unexpected access-denied or duplicate-record events.

Production ACL changes must be deployed together with the corresponding writer;
do not create a window in which browser writes remain enabled after migration or
all writes are denied before the server command is available.

## Acceptance checks

PR 4B.5 is complete only when all of these statements are true:

- a browser SDK call cannot create, update, or delete a privileged entity;
- the application contains no direct privileged entity mutations under `src/`;
- wallet cost comes only from the AI Operation Registry;
- paid plan activation requires trusted billing confirmation;
- usage is incremented only by trusted server completion;
- duplicate retries cannot reserve or spend twice;
- normal owner-scoped reads required by the UI continue to work.
- every privileged entity has exactly one named server writer;
- a source-level guard rejects service-role writes to a privileged entity from
  any module other than its owning writer.
