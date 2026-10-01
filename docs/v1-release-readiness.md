# BERS v1 RC readiness guard

The release program has a fail-closed machine-readable coordinate at `config/v1-release-readiness.json`.

It deliberately does **not** use the number of open GitHub issues as release truth. RC selection advances only from reviewed mandatory release evidence.

## Current state

All v1 RC blockers are cleared in the machine-readable ledger and `BERS_V1_RC` is selected at:

`9faa33345dc674ddd632b0bfc1543c498e46de96`

The selected coordinate is the exact accepted product SHA bound to browser journey 22 hosted frontend evidence. Later commits on `main` are release metadata/evidence changes and do not silently move the product coordinate.

GitHub repository protection is proven by active branch ruleset `BERS v1 main release protection` (id `24246282`) targeting the default branch with:

- no bypass actors;
- pull requests required with zero mandatory human approvals;
- strict required status checks;
- the seven stable release contexts;
- deletion blocked;
- non-fast-forward/force-push updates blocked.

The browser release journey matrix is complete, including hosted exact-SHA deployment proof for journey 22 from workflow run `36845376046` and artifact `bers-v1-frontend-security-9faa33345dc674ddd632b0bfc1543c498e46de96`. Stage D product decisions remain frozen and fail-closed. Billing redesign (#189), additional Editor expansion (#192), and physical-mobile HSME qualification (#352/#862/#871/#867) remain outside the v1 RC blocker set.

HSME remains non-production. Its physical-device work is explicitly deferred as post-v1 R&D and still requires real-device evidence before any future production admission.

## State transitions

The readiness guard validates the ledger state rather than issue counts.

- With one or more accepted external blockers, `rcSelectable=false`, `rcCoordinate=null`, and `status=BERS_V1_RC_NOT_SELECTABLE`.
- The frontend blocker may be removed only when browser journey 22 is `PROVEN` with accepted live evidence.
- Main protection may be removed only with accepted machine-readable GitHub protection evidence.
- With no blockers, `rcSelectable=true`, `rcCoordinate` must be one exact lowercase 40-character accepted `main` SHA, and `status=BERS_V1_RC_SELECTED`.
- The selected RC must equal journey 22's reviewed deployment SHA.
- HSME physical-mobile work remains post-v1 and is rejected if reintroduced into the v1 blocker array.
- Unknown blocker IDs, duplicate blockers, non-terminal mandatory browser journeys, or coordinate/status drift fail closed.

RC selection is not final publication authorization. Package version remains `0.0.0`; no `v1.0.0` tag, release SHA, or publication evidence is declared at this state.
