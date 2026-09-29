# BERS v1.0 deployment, rollback and final release checklist

This checklist packages the existing Core deployment/security contracts into the final v1 release sequence. It does not replace `docs/core-server-deployment.md` or `SECURITY_CONFIGURATION.md`.

## Before selecting BERS_V1_RC

- `config/v1-release-readiness.json` has an empty blocker array and `rcSelectable=true`.
- #233 journey 22 is PROVEN against the **final canonical frontend URL** using `scripts/verify-frontend-security-headers.mjs`.
- GitHub-level `main` protection/ruleset evidence satisfies #355.
- The mandatory HSME real-mobile evidence gate recorded by #352/#862/#871/#867 is complete.
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

Only after all mandatory evidence is terminal green on the final accepted SHA:

- set the release coordinate in the readiness manifest;
- bump `package.json` from the pre-release placeholder to `1.0.0`;
- generate the final release manifest from that exact SHA;
- create tag/release `v1.0.0` from that SHA only;
- update #365 with the exact SHA/tag/evidence;
- declare **BERS v1.0 RELEASED**.

Any release-affecting fix after RC moves the coordinate to the new accepted `main` SHA and reruns affected evidence.
