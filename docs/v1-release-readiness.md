# BERS v1 RC readiness guard

The release program now has a fail-closed machine-readable coordinate at `config/v1-release-readiness.json`.

It deliberately does **not** use the number of open GitHub issues as release truth. Accepted software can coexist with stale/open parent issues. Instead, RC selection is blocked only by verified mandatory release gaps.

Current blockers:

1. **Frontend deployment headers (#233 / R4).** The repository contract and verifier are accepted, but the final canonical deployed frontend URL still needs live response-header evidence.
2. **Repository main protection (#355 / R1).** The repository ruleset collection is currently empty. The connected GitHub App cannot read or change branch protection requiring administration permission. This is an external GitHub administration action, not a code change.
3. **HSME real-mobile evidence (#352 / R3).** Physical-phone/device evidence was intentionally skipped during current development cycles, but the canonical release roadmap still requires a functioning real-mobile backend plus device measurements before RC.

Stage D product decisions are already frozen and fail-closed. The browser release journey software matrix is complete except for the external deployment target proof. Billing redesign (#189) and additional Editor expansion (#192) are not RC blockers under the current v1 scope.

Until the blocker array is empty, the classifier must emit `BERS_V1_RC_NOT_SELECTABLE` and the RC SHA remains null.
