# BERS v1 RC readiness guard

The release program now has a fail-closed machine-readable coordinate at `config/v1-release-readiness.json`.

It deliberately does **not** use the number of open GitHub issues as release truth. Accepted software can coexist with stale/open parent issues. Instead, RC selection is blocked only by verified mandatory release gaps.

Current blocker:

1. **Repository main protection (#355 / R1).** The frontend deployment/header gate (#233 / R4) is now cleared by hosted exact-SHA evidence on `c5292b4a65341050d664de715eff2feff0b4b32f`. Repository main protection remains external GitHub administration work: the connected GitHub App cannot create the required ruleset/branch protection.

Stage D product decisions are already frozen and fail-closed. The browser release journey matrix is complete, including hosted external deployment proof for journey 22. Billing redesign (#189), additional Editor expansion (#192), and physical-mobile HSME qualification (#352/#862/#871/#867) are not RC blockers under the current v1 scope.

HSME remains non-production. Its physical-device work is explicitly deferred as post-v1 R&D and still requires real-device evidence before any future production admission.

Until the blocker array is empty, the classifier must emit `BERS_V1_RC_NOT_SELECTABLE` and the RC SHA remains null.


## State transitions

The readiness guard validates the ledger state rather than assuming the repository will remain blocked forever.

- With one or more accepted external blockers, `rcSelectable=false`, `rcCoordinate=null`, and `status=BERS_V1_RC_NOT_SELECTABLE`.
- Either external blocker may close independently; the remaining blocker keeps RC fail-closed.
- The frontend blocker may be removed only when browser journey 22 is promoted from `DEPLOYMENT_TARGET_PENDING` to `PROVEN`.
- With no blockers, `rcSelectable=true`, `rcCoordinate` must be one exact lowercase 40-character accepted `main` SHA, and `status=BERS_V1_RC_SELECTED`.
- HSME physical-mobile work remains post-v1 and is rejected if reintroduced into the v1 blocker array.
- Unknown blocker IDs, duplicate blockers, non-terminal mandatory browser journeys, or coordinate/status drift fail closed.

The GitHub open/closed state of an issue is not itself release evidence. The machine-readable ledger may advance only after the corresponding external evidence has been reviewed and recorded.
