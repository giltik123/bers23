# AI Operation Registry

The server-side AI Operation Registry is the source of truth for authorization
and billing policy attached to an AI operation. It is implemented in
`base44/functions/_shared/aiOperationRegistry.ts` and is intentionally
independent of React, Base44 entities, provider transports, and client code.

## Trust boundary

A client may eventually submit:

```json
{
  "operation_id": "reve.edit",
  "project_id": "project-id"
}
```

A client must never choose or override these fields:

```json
{
  "credits": 2,
  "plan": "free",
  "feature": "ai_editing",
  "provider": "reve",
  "quota_category": "editing"
}
```

The server resolves all policy from `operation_id`. Unknown operation IDs fail
with the stable code `unknown_operation` and must not reach an AI provider.

## Registered operations

| Operation ID | Provider | Project scoped | Feature | Credits | Quota | Timeout | Max retries | Idempotent | Billing | Version |
| --- | --- | ---: | --- | ---: | --- | ---: | ---: | ---: | --- | ---: |
| `reve.edit` | Reve | Yes | `ai_editing` | 30 | `editing` | 90s | 2 | No | `reserve_commit` | 1 |
| `sam3.segment` | fal.ai SAM 3 | Yes | `ai_editing` | 10 | `segmentation` | 60s | 2 | No | `reserve_commit` | 1 |
| `fashn.tryon` | FASHN | Yes | `virtual_tryon` | 50 | `virtual_tryon` | 120s | 0 | No | `reserve_commit` | 1 |

The initial costs preserve the current values in the existing client credits
calculator. Moving the calculator itself to the server belongs to PR 4B.4.

## Adding an operation

1. Add a stable namespaced `operation_id`; do not reuse an ID for different
   behavior.
2. Add the provider, project scope, required subscription feature, integer
   credit cost, quota category, timeout, maximum retries, idempotency flag,
   billing strategy, and policy version to the registry entry.
3. Add or extend a quota category type only when the server has a corresponding
   usage policy.
4. Add registry validation coverage for the operation.
5. In a later integration PR, resolve the operation before authorization and
   provider routing. Never copy request policy fields into the registry result.
6. Treat cost or access-policy changes as security-sensitive deployment changes.

## Execution and billing policy

- `timeout_seconds` is the maximum duration of one provider attempt. It does not
  include retry backoff or time spent waiting in a job queue.
- `max_retries` counts retries after the initial attempt. A value of `2` permits
  at most three provider attempts.
- `idempotent` describes whether repeating the provider operation is inherently
  safe. All current generative/provider operations are conservatively `false`.
- `billing_strategy: reserve_commit` requires PR 4C to reserve the registry cost
  before provider execution, commit on success, and release/rollback on failure.
- `version` versions the complete operation policy. Any incompatible policy or
  billing-semantic change must increment it; an operation ID must never be
  silently repurposed.

Timeout and retry values preserve the current Reve and SAM client policies. The
FASHN timeout is an explicit server policy for future integration; the current
client has no retry loop, so `max_retries` remains `0`.

## Planned request flow

```text
Client operation_id
  -> Operation Registry
  -> AuthorizationService
  -> Project ownership and access
  -> Subscription and permissions
  -> Credits and quota
  -> Provider Router
```

This PR only establishes the registry. It does not yet change API contracts or
route provider calls through authorization. Those changes remain isolated in PR
4B.1 through PR 4B.5, followed by the PR 4C transaction layer.

## Authorization context

PR 4B.1 adds a server-side `AuthorizationService` that combines request-bound
Base44 identity with immutable registry policy. The resulting context contains
only the authenticated user and the resolved operation definition. It does not
accept client-provided provider, plan, feature, cost, or quota values.

The registry is evaluated before the authorization stages. `AuthorizationService`
does not maintain a second operation map and receives every provider, project
scope, feature, cost, and quota decision from `AI_OPERATION_REGISTRY`:

```text
Request
  -> Operation Registry
  -> AuthorizationService
  -> Ownership
  -> Subscription
  -> Credits
  -> Quota
  -> Provider Router
  -> AI Provider
```

The context is deliberately a **pre-authorization context**, not permission to
call a provider. Project ownership, subscription, permissions, credits, and
quota remain fail-closed integration stages for PR 4B.2–4B.4. Provider endpoints
must not treat `createContext()` alone as a complete authorization decision.

## Project context and ownership

PR 4B.2 makes `operation_id` and `project_id` mandatory for every currently
registered AI operation because all current registry entries are project scoped.
The server loads the Project using service-role access only after request-bound
authentication, then requires an exact `created_by_id === user.id` match.

Missing project IDs fail with `400 project_required`. Missing and foreign project
IDs share the same `403 project_access_denied` response so callers cannot use the
authorization boundary to enumerate projects. The trusted context exposes only
the project ID and owner ID; arbitrary Project fields do not cross the boundary.

## Subscription and feature permissions

PR 4B.3 adds a server-owned subscription policy for features required by the AI
Operation Registry. After ownership succeeds, the server loads the caller's
`UserSubscription` with service-role access and verifies its `created_by_id`,
status, plan, trial expiration, and `required_feature` from the operation.

Only `free`, `active`, and unexpired `trialing` states are accepted. Cancelled,
expired, unknown, missing, foreign, or duplicate subscription records fail
closed with `403 subscription_access_denied`. Missing subscriptions are not
created by authorization, and client-supplied plan or feature fields are ignored.

The initial server feature catalog preserves current product access: Free allows
`ai_editing`; Plus, Pro, Studio, and Enterprise allow `ai_editing` and
`virtual_tryon`. This catalog is the server authority for provider access; the
existing client catalog remains display-only until its later cleanup.

## Credits, quota, and unified context

PR 4B.4 extends the same immutable authorization object instead of replacing its
earlier stages. Downstream code receives one `AuthorizedOperationContext` with
identity, operation, project, subscription, server plan, credits, and quota.
PR 4C can append reservation state without changing those existing fields.

Credit validation loads exactly one owner-matched wallet, validates every known
balance bucket and `reserved`, and takes `required` only from the registry's
`credit_cost`. Client-supplied credit amounts are never read. Missing, duplicate,
foreign, negative, non-finite, or otherwise malformed wallets fail closed.

Current clients reserve credits before calling the provider. As a temporary
compatibility bridge until PR 4C, an existing reserved amount may satisfy the
current registry cost. This bridge cannot bind a reservation to one request and
is not transaction safety; PR 4C must replace it with server-side reservation.

Quota validation loads exactly one owner- and period-matched
`SubscriptionUsage`, then reads the category exclusively from the operation
registry. Current product plans are credit-limited and do not define count caps,
so their explicit category limits are `null` (unlimited). Usage records are
still validated fail-closed, and future finite limits require only server policy
changes rather than a request-contract change.

## Privileged mutation lockdown dependency

The implementation and deployment sequence for PR 4B.5 is documented in
[`MUTATION_LOCKDOWN_PLAN.md`](MUTATION_LOCKDOWN_PLAN.md). Mutation lockdown must
combine verified Base44 write-deny rules with narrow server commands. Merely
moving normal client calls behind a function would not prevent a modified client
from writing privileged entities directly.

The plan also assigns one exclusive server writer to each privileged entity.
Service-role access is not permission for arbitrary endpoints to bypass the
Reservation, Transaction, Usage, or Billing service that owns the state.
