# BERS v1 finalization and tag contract

The repository is prepared for a final `v1.0.0` release, but the current state is intentionally **BLOCKED_BEFORE_RC**.

The source of truth is `config/v1-release-finalization.json`; `scripts/check-v1-release-finalization.mjs` enforces the transition.

## Allowed states

### BLOCKED_BEFORE_RC

Used while the release-readiness ledger contains mandatory blockers.

- `package.json` remains `0.0.0`;
- no RC coordinate is declared;
- no release SHA is declared;
- no `v1.0.0` tag is declared;
- no release artifact is claimed.

### RC_SELECTED

Allowed only after the readiness blocker array is empty and `rcSelectable=true`.

- readiness owns one exact accepted `main` SHA;
- finalization records the same SHA as `rcCoordinate`;
- package version remains pre-release until final affected evidence is terminal green.

### RELEASED

Allowed only after final evidence is green on the exact accepted release coordinate.

- `package.json.version === 1.0.0`;
- `releaseTag === v1.0.0`;
- `releaseSha` equals the accepted release coordinate;
- release notes/classifications/operations are still truthful;
- the GitHub tag/release must be created from that exact SHA only.

A release-affecting fix after RC invalidates the old coordinate for finalization and requires moving to the new accepted `main` SHA.


## CI transition guard

The `BERS v1 release finalization guard` workflow validates the disposition declared by `config/v1-release-finalization.json` rather than assuming the repository is permanently blocked.

- `BLOCKED_BEFORE_RC` must emit only the blocked disposition;
- `RC_SELECTED` must emit `BERS_V1_RC_SELECTED`;
- `RELEASED` must emit `BERS_V1_0_RELEASED`;
- unknown states fail closed;
- manual `workflow_dispatch` runs validate the exact dispatched SHA, while committed-diff hygiene remains PR-only.

This allows the same immutable guard to remain valid when the two external RC blockers are eventually removed.
