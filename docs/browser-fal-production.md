# Browser production: fal.ai image editing; automatic SAM3 remains disabled

The image-edit path executes on the Core server, not inside the browser. Automatic SAM3 segmentation stays disabled until explicitly requested in a future release:
- Full-frame prompt-driven image editing uses `fal-ai/flux-pro/kontext` via the existing canonical Creative endpoint. The trusted output PNG is decoded, validated, and persisted as a source-linked `GLOBAL_EDIT` FINAL that the user can review and accept.
- SAM3 calls `fal-ai/sam-3/image` for one explicitly chosen semantic target, stores verified original-space MASK pixels as `CLOUD_SEGMENTATION`, and publishes source-bound candidate objects only after canonical validation.

## Deployment order

1. Deploy the backend database migrations `050_cloud_scene_mask_provenance.sql` and `051_global_edit_final_lineage.sql` **before** enabling the new server build. The existing production migration runner applies the contiguous migration inventory (001–051).
2. Keep `CREATIVE_PROVIDER=FAL` and the real `FAL_KEY` on the server (never in `VITE_*`, browser JS, HTML, or logging).
3. Configure the normal Core auth, PostgreSQL and billing services; the SAM3 route requires the canonical `BillableOperationService`. Account credits and the configured `CREDITS_PER_EDIT` policy are applied to each SAM3 call. No free provider dispatch is possible.
4. Keep **server-only** `BERS_AUTO_SCENE_SAM3_ENABLED=false`. The original editor panel continues to show **SAM3 · недоступно**, and free classical segmentation is unchanged. **Do not enable SAM3 as part of this release**. A separate future approval is required, because cloud segmentation transfers image content and incurs a provider charge.
5. Build and deploy **both** Core and Vite frontend. The frontend reads `/api/core/scene/capability`; it never reads the FAL key. Use the canonical same-origin Core API/reverse proxy and configured `ALLOWED_WEB_ORIGINS`.
6. Verify a signed-in Project: run a global prompt edit, review the new image and accept it; verify **Маски сцены** retains its original classical behavior and the SAM3 action remains unavailable. Check balances, image history and project revision after refresh.

## Failure behavior

- With the SAM3 flag disabled, missing FAL credentials, missing billing, or mismatched schema, the server denies cloud segmentation; the browser button is unavailable. Free classical segmentation remains available.
- Each SAM3 request has a `clientRequestId`. Canonical billing reserves before provider dispatch; a replay does **not** repeat the paid call. Ambiguous outcomes remain pending financial reconciliation.
- Cloud masks are never mislabeled as local masks, and browser-supplied URLs cannot become trusted canonical artifacts.
- Provider output for full-frame editing is decoded on the Core server. Provider URLs are never accepted as project FINALs, and source lineage is checked in PostgreSQL.

## Regression checks

```sh
npm ci
node --experimental-strip-types --test tests/auto-scene-server-admission.test.mjs tests/fal-sam3-scene-real-pixel-contract.test.mjs
npx esbuild tests/production-fullframe-fal.test.ts --bundle --platform=node --format=esm --target=node24 --outfile=.test-cache/production-fullframe-fal.test.mjs --external:node:* --external:sharp --external:pg
node --test .test-cache/production-fullframe-fal.test.mjs
npm run typecheck
npm run server:typecheck
npm run build
npm run server:build
```

These are source-level checks; real fal.ai requests and production database/schema readiness require valid credentials and deployment access.
