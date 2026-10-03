# BERS v1 RC readiness guard

The release program has a fail-closed machine-readable coordinate at `config/v1-release-readiness.json`.

It deliberately does **not** use the number of open GitHub issues as release truth. RC selection advances only from reviewed mandatory release evidence.

## Current state

`BERS_V1_RC` is **not selectable**.

The previously selected product coordinate `6a5c63ed32e8ae82e500e5a1c4fe22409705b174` remains useful historical hosted evidence, but it is no longer an active RC because the canonical release plan and #365 require HSME to reach `R&D_VALIDATED` before RC.

Current blocker:

- `HSME_REAL_MOBILE_EVIDENCE` / #352 (related #862/#867/#871): HSME remains `SOFTWARE_READY_EVIDENCE_PENDING`. At least one functioning real mobile backend must provide trusted same-session latency, memory, storage/bytes-moved, battery/energy, thermal/throttling and quality evidence; the integrated dense-vs-HSME comparison and final `ADVANCE / REDESIGN / REJECT` architecture decision must also be complete.

HSME remains non-production. Satisfying the R&D gate does not grant provider, Billing, Project, Artifact, model-promotion or cloud-fallback authority.

GitHub repository protection remains proven by active ruleset `BERS v1 main release protection` (id `24246282`) with seven strict required checks, PR-only updates, no bypass actors, and deletion/non-fast-forward updates blocked.

The existing journey-22 hosted frontend evidence remains valid evidence for its exact historical SHA. If product code changes before the eventual RC, journey 22 must be rerun on the new exact accepted SHA.

## State transitions

- While HSME is not `R&D_VALIDATED`, `HSME_REAL_MOBILE_EVIDENCE` must remain in the blocker array, `rcSelectable=false`, `rcCoordinate=null`, and status `BERS_V1_RC_NOT_SELECTABLE`.
- `R&D_VALIDATED` requires no HSME blockers, trusted physical-mobile qualification state `REAL_MOBILE_QUALIFICATION_READY_NOT_ADMITTED`, a valid qualification evidence digest, and a final `ADVANCE / REDESIGN / REJECT` architecture decision.
- Frontend hosted evidence and main protection remain independent gates.
- With all blockers cleared, the selected RC must still equal journey 22's reviewed exact deployed SHA.
- Billing redesign (#189) and optional Editor expansion (#192) remain non-blocking unless an enabled release journey makes them mandatory.

Package version remains `0.0.0`; no `v1.0.0` tag, release SHA, or publication evidence may be declared while this gate is blocked.
