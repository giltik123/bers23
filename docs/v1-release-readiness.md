# BERS v1 RC readiness guard

The release program has a fail-closed machine-readable coordinate at `config/v1-release-readiness.json`.

It deliberately does **not** use the number of open GitHub issues as release truth. RC selection advances only from reviewed mandatory release evidence.

## Current state

`BERS_V1_RC` is **not selectable** on this Masked Levels feature branch.

The previous coordinate `6a5c63ed32e8ae82e500e5a1c4fe22409705b174` is historical evidence only. Two independent blockers remain:

- `HSME_REAL_MOBILE_EVIDENCE` / #352: the mandatory HSME program must reach `R&D_VALIDATED` with trusted dense-baseline, Adapter-MoE/runtime/sparsity, real physical-mobile qualification and final architecture disposition evidence.
- `FRONTEND_DEPLOYMENT_HEADERS` / #233: Masked Levels changes the admitted product surface, so the eventual accepted product SHA must be deployed exactly and journey 22 hosted evidence rerun before RC selection.

HSME remains non-production. Satisfying its R&D gate grants no provider, Billing, Project, Artifact, model-promotion or cloud-fallback authority.

GitHub repository protection remains proven by active ruleset `BERS v1 main release protection` (id `24246282`) with seven strict required checks, PR-only updates, no bypass actors, and deletion/non-fast-forward updates blocked.

## State transitions

- While HSME is not `R&D_VALIDATED`, `HSME_REAL_MOBILE_EVIDENCE` remains a blocker.
- After a release-affecting product change, journey 22 remains pending until fresh exact-SHA hosted evidence exists.
- Main protection remains an independent gate.
- Only with all blockers cleared may `rcSelectable=true`; the selected RC must equal journey 22's reviewed exact deployed SHA.
- Package version remains `0.0.0`; no `v1.0.0` publication coordinate exists while either blocker remains.
