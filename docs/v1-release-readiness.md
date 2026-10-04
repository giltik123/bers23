# BERS v1 RC readiness guard

The release program has a fail-closed machine-readable coordinate at `config/v1-release-readiness.json`.

It deliberately does **not** use the number of open GitHub issues as release truth. RC selection advances only from reviewed mandatory release evidence.

## Owner release-policy override — 2026-10-04

The product owner explicitly accepts the risk of releasing v1 without physical-mobile HSME validation. As a result, HSME physical-device evidence / #352 / #871 is no longer a pre-RC or v1 release blocker.

This override is narrow:

- HSME remains experimental/non-production while its validation classification is pending;
- virtual Android/WASM evidence may establish preflight and physical-device trial readiness, but is not relabeled as physical evidence;
- no provider, Billing, Project, Artifact, model-promotion or mobile-backend production authority is granted by the override;
- Core/PostgreSQL, security, deployment, backup/rollback, tenant isolation, browser/E2E and exact-SHA requirements remain release gates.

## Current state

`BERS_V1_RC` remains **not selectable** because two non-HSME release gates remain:

- `FASHION_REAL_IMAGE_QUALITY` / #230: deterministic Try-On software E2E is accepted, but representative real-image quality/resource evidence is still pending.
- `FRONTEND_DEPLOYMENT_HEADERS` / #233: the final accepted product SHA must be deployed exactly and journey 22 hosted evidence rerun before RC selection.

HSME is tracked under `nonBlockingDeferred` as `HSME_PHYSICAL_MOBILE_VALIDATION` with state `OWNER_DEFERRED_POST_V1_FIELD_VALIDATION`. Its current R&D validation state may remain pending without blocking RC.

GitHub repository protection remains an independent release gate/evidence requirement.

## State transitions

- Pending HSME physical validation does not block RC after the owner override.
- Pending deterministic Try-On real-image quality/resource validation does block RC until accepted evidence is recorded.
- After a release-affecting product change, journey 22 remains pending until fresh exact-SHA hosted evidence exists.
- Main protection remains an independent gate.
- Only with all release blockers cleared may `rcSelectable=true`; the selected RC must equal journey 22's reviewed exact deployed SHA.
- HSME can graduate later to `R&D_VALIDATED` / production admission only through separate real-device evidence and reviewed promotion.
