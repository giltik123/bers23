# BERS v1 finalization and tag contract

The repository uses a fail-closed state machine to move toward the final `v1.0.0` release without requiring a Git commit to contain its own SHA.

The current state is always the value committed in `config/v1-release-finalization.json`; `scripts/check-v1-release-finalization.mjs` rejects inconsistent readiness, package, classification, coordinate, publication-evidence, or tag claims.

## Why publication needs a separate authorization state

A commit SHA is a digest of the commit content. Therefore a tracked file inside a commit cannot practically declare that same commit SHA as a release coordinate and then be committed without changing the SHA again.

BERS avoids that self-reference with four states:

`BLOCKED_BEFORE_RC -> RC_SELECTED -> RELEASE_AUTHORIZED -> RELEASED`

The selected RC is an already-existing accepted product SHA. Later release-metadata commits may refer to it. The exact `RELEASE_AUTHORIZED` main SHA is discovered at workflow runtime and becomes the immutable `v1.0.0` tag target. The subsequent `RELEASED` ledger records that already-existing published SHA.

## Allowed states

### BLOCKED_BEFORE_RC

Used while the release-readiness ledger contains mandatory blockers.

- readiness is `BERS_V1_RC_NOT_SELECTABLE`;
- `package.json` remains `0.0.0`;
- no RC coordinate is declared;
- no release SHA or tag is declared;
- `publicationEvidence=null`;
- no release artifact is claimed.

### RC_SELECTED

Allowed only after the readiness blocker array is empty and `rcSelectable=true`.

- readiness owns one exact accepted historical/current `main` SHA as `rcCoordinate`;
- finalization records the same SHA as `rcCoordinate`;
- journey 22 live frontend evidence is bound to that exact RC SHA;
- `releaseSha`, `releaseTag`, and `publicationEvidence` remain `null`;
- `releaseGenerated=false`;
- `package.json` and `packageVersionExpected` remain `0.0.0`.

### RELEASE_AUTHORIZED

This is the only pre-publication state accepted by the `BERS v1.0 fail-closed publish` workflow.

- readiness remains selected on the accepted RC SHA;
- only the finite release-metadata allowlist may differ between the selected RC SHA and the authorization SHA;
- `package.json.version === 1.0.0` and `packageVersionExpected === 1.0.0`;
- `releaseTag === v1.0.0`;
- `releaseSha === null`: the commit must not attempt to predeclare its own SHA;
- `publicationEvidence === null`;
- `releaseGenerated=false`;
- release notes/classification/operations must already describe the final package truthfully.

The publisher checks the exact current `main` SHA, all immutable required contexts on that SHA, the RC-to-publication metadata-only delta, and the unused tag/release namespace before the first write.

### RELEASED

This is a post-publication ledger state.

- `package.json.version === 1.0.0`;
- `releaseTag === v1.0.0`;
- `releaseSha` is the exact SHA to which the already-created `v1.0.0` tag resolves;
- `releaseGenerated=true`;
- `publicationEvidence` records the successful publication workflow URL, release URL, selected RC, published SHA, tag, publication timestamp, and SHA-256 identities of the release manifest, required-check evidence, and RC-to-publication delta evidence;
- the published tag is never moved by this ledger commit.

A product/release-affecting code fix after RC invalidates the old RC coordinate and requires selecting a new accepted product SHA and rerunning affected evidence. A post-publication ledger-only commit does not move the already-published tag.

## RC-to-publication delta

`scripts/verify-v1-release-delta.mjs` requires the selected RC SHA to be an ancestor of the exact publication SHA and rejects every changed path outside the finite release-metadata allowlist.

Product code, server code, workflows, build/runtime code, model code, and other non-release metadata cannot drift between RC selection and publication authorization. If any such path changes, the RC must move instead.

## CI transition guard

The `BERS v1 release finalization guard` workflow validates the disposition declared by `config/v1-release-finalization.json`.

- `BLOCKED_BEFORE_RC` emits only `BERS_V1_RELEASE_FINALIZATION_BLOCKED`;
- `RC_SELECTED` emits only `BERS_V1_RC_SELECTED`;
- `RELEASE_AUTHORIZED` emits only `BERS_V1_RELEASE_AUTHORIZED`;
- `RELEASED` emits only `BERS_V1_0_RELEASED`;
- unknown states fail closed;
- manual `workflow_dispatch` runs validate the exact dispatched SHA, while committed-diff hygiene remains PR-only.

## Cross-manifest release-state convergence

The finalization validator binds `config/v1-capability-classification.json` to the same transition state.

- `BLOCKED_BEFORE_RC` requires classification `releaseState=PRE_RC_EXTERNAL_BLOCKERS_REMAIN`;
- `RC_SELECTED` requires classification `releaseState=RC_SELECTED`;
- `RELEASE_AUTHORIZED` requires classification `releaseState=RELEASE_AUTHORIZED`;
- `RELEASED` requires classification `releaseState=RELEASED`;
- the machine-readable `releaseStateByFinalizationStatus` mapping must retain those exact four values.

The guard also requires canonical program identities for readiness, finalization, and capability classification, and requires readiness status `BERS_V1_RC_NOT_SELECTABLE` while blocked or `BERS_V1_RC_SELECTED` once blockers are empty.


## Cross-manifest release-state convergence

The finalization validator also binds `config/v1-capability-classification.json` to the same transition state.

- `BLOCKED_BEFORE_RC` requires classification `releaseState=PRE_RC_EXTERNAL_BLOCKERS_REMAIN`;
- `RC_SELECTED` requires classification `releaseState=RC_SELECTED`;
- `RELEASED` requires classification `releaseState=RELEASED`;
- the machine-readable `releaseStateByFinalizationStatus` mapping must retain those exact three values.

This prevents a final release from being published while capability classification still describes a pre-RC or RC-only state.
