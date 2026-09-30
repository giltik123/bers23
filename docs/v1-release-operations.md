# BERS v1.0 deployment, rollback and final release checklist

This checklist packages the existing Core deployment/security contracts into the final v1 release sequence. It does not replace `docs/core-server-deployment.md` or `SECURITY_CONFIGURATION.md`.

## Before selecting BERS_V1_RC

- `config/v1-release-readiness.json` has an empty blocker array and `rcSelectable=true`.
- #233 journey 22 is PROVEN against the **final canonical frontend URL** using `scripts/verify-frontend-security-headers.mjs`.
- GitHub-level `main` protection/ruleset evidence satisfies #355.
- HSME remains non-production and its physical-mobile qualification stays deferred post-v1; no HSME production admission is implied by release.
- Stage D decisions and capability classifications still match the production policies.
- Billing remains disabled/deferred unless a separately accepted financial redesign changes the release scope.

## Immutable Core rollout

1. Select one exact accepted `main` SHA as `BERS_V1_RC`.
2. Build one immutable Core image from that SHA.
3. Back up/verify the target PostgreSQL environment under the deployment platform's database procedure.
4. From the exact image, run `node dist-server/migrate.mjs migrate`.
5. From the same image, run `node dist-server/migrate.mjs check`.
6. Start Core without changing the image command.
7. Require `GET /health/live` and `GET /health/ready` before traffic.
8. Deploy the Vite frontend separately with `VITE_CORE_API_URL` bound exactly to the canonical `/api/core` boundary.
9. Verify final frontend headers, origin/CORS/auth configuration, trusted-proxy policy and browser secret absence.
10. Run the mandatory final release CI/E2E on the exact final SHA.

## Rollback

Application rollback means routing traffic back to the previous immutable Core image **only when it is compatible with the already-forward-migrated schema**.

- Do not infer database rollback from application rollback.
- Do not run rollback SQL while either application version is serving traffic.
- If the new image is unhealthy before traffic admission, keep/restore the previous healthy image and investigate without granting the failed image authority.
- If an issue appears after traffic admission, stop new admission to the affected version, route back to the compatible prior image, and preserve durable Project/Artifact/Execution facts for reconciliation.
- Ambiguous provider/local execution is reconciled from canonical transaction/execution facts; rollback must not manufacture success or repeat paid/provider work.
- Frontend rollback must continue to target the same compatible canonical Core boundary and must still satisfy the security-header contract.

## Final release declaration

Only after all mandatory external evidence is accepted:

1. choose one exact already-existing accepted `main` product SHA as `BERS_V1_RC`;
2. commit the RC ledger transition: empty blockers, `rcSelectable=true`, readiness `status=BERS_V1_RC_SELECTED`, readiness/finalization `rcCoordinate=<RC SHA>`, journey 22 `PROVEN` with reviewed live evidence, finalization `RC_SELECTED`, and capability classification `RC_SELECTED`;
3. require the RC-selection metadata PR and resulting `main` state to stay product-code clean;
4. prepare the publication-authorization metadata change: bump `package.json` and `package-lock.json` to `1.0.0`, make release notes final, set `releaseTag=v1.0.0`, finalization `RELEASE_AUTHORIZED`, classification `RELEASE_AUTHORIZED`, while keeping `releaseSha=null`, `publicationEvidence=null`, and `releaseGenerated=false`;
5. merge that authorization change to `main` and require all mandatory exact-main checks green on the resulting authorization SHA;
6. manually dispatch **BERS v1.0 fail-closed publish** from `main`, supplying that exact authorization SHA and typing `v1.0.0` as the confirmation value;
7. allow the workflow to re-prove `RELEASE_AUTHORIZED`, require the selected RC to be an ancestor, reject every RC-to-publication changed path outside the release-metadata allowlist, verify the mandatory checks on the exact authorization SHA, generate the deterministic release manifest, require the tag/release namespace to be unused, and only then create `v1.0.0`;
8. require the workflow to upload and re-download byte-identically the release manifest, required-check evidence, release-delta evidence, and post-publication evidence;
9. verify `v1.0.0` resolves to the exact authorization SHA;
10. commit the post-publication ledger transition: finalization `RELEASED`, classification `RELEASED`, `releaseSha=<published tag SHA>`, `releaseGenerated=true`, and the exact `publicationEvidence` emitted by the successful publication run;
11. update #365 with the RC SHA, published SHA, tag, workflow run, release URL and evidence identities, then declare **BERS v1.0 RELEASED** externally.

The exact published SHA is discovered at publication time; a tracked file is never required to contain the SHA of the commit that contains that file. This avoids a cryptographic self-reference that cannot be satisfied by ordinary Git commits.

The selected RC SHA and the published SHA may therefore differ, but only because reviewed release metadata was committed between them. `scripts/verify-v1-release-delta.mjs` rejects product/runtime/code drift. Any product-affecting fix after RC moves the RC coordinate and reruns affected evidence.

The post-publication `RELEASED` ledger commit never moves or recreates `v1.0.0`. It records an already-existing immutable publication fact.

The publish workflow writes only after every preflight passes. If a later publication step fails, cleanup is allowed only when that run created the release itself; pre-existing release/tag state is never overwritten or deleted.
