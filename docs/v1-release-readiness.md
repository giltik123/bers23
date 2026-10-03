# BERS v1 RC readiness guard

The release program has a fail-closed machine-readable coordinate at `config/v1-release-readiness.json`.

It deliberately does **not** use the number of open GitHub issues as release truth. RC selection advances only from reviewed mandatory release evidence.

## Current state

The previous selected RC `6a5c63ed32e8ae82e500e5a1c4fe22409705b174` is intentionally invalidated on this feature branch because Masked Levels changes the admitted product surface.

The branch is therefore fail-closed before RC selection:

- `rcSelectable=false`;
- `rcCoordinate=null`;
- `status=BERS_V1_RC_NOT_SELECTABLE`;
- browser journey 22 is `DEPLOYMENT_TARGET_PENDING` with no live evidence attached;
- the blocker is `FRONTEND_DEPLOYMENT_HEADERS`, which now means: deploy the new accepted product SHA and obtain fresh exact-SHA hosted evidence before selecting the replacement RC.

GitHub repository protection remains proven by active branch ruleset `BERS v1 main release protection` (id `24246282`) targeting the default branch with:

- no bypass actors;
- pull requests required with zero mandatory human approvals;
- strict required status checks;
- the seven stable release contexts;
- deletion blocked;
- non-fast-forward/force-push updates blocked.

Masked Levels production promotion is release-affecting product work. It must not inherit hosted evidence from the older RC. After this product change is accepted on `main`, the frontend must be deployed at that exact new SHA and journey 22 evidence rerun before RC selection resumes.

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

Package version remains `0.0.0`; no `v1.0.0` tag, release SHA, or publication evidence is declared while this branch awaits replacement RC evidence.
