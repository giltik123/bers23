# Core HTTP runtime

## Current deployment boundary

The repository has no Base44, Vercel, Netlify, Cloudflare, or other hosted
function configuration. The checked-in runnable boundary is the Vite browser
application; consequently there is **no production backend deployment target in
this repository yet**. Pretending otherwise would make the Core route appear
mounted while remaining unreachable after the static build.

The route adapter implemented by Sprint 6.34.1 targets the repository's existing
Node runtime and Fetch API without introducing Express or Fastify. A deployment
bootstrap must pass its already-created canonical Core instance to
`createCreativeHttpHandler`, then mount the returned handler through
`nodeHttpAdapter`. The actual transport proof starts a Node HTTP server and uses
`fetch`; it does not invoke the handler directly.

## Route mounting contract

The mounting location is `server/core/http/nodeHttpAdapter.ts`, delegating all
routing to the framework-neutral `server/core/http/creativeHttpHandler.ts` and
all construction to the single `server/core/composition/createCreativeCore.ts`
composition root. It exposes:

- `POST /api/core/creative/execute`
- `GET /api/core/creative/:executionId/status`
- `GET /api/core/creative/:executionId/result`
- `POST /api/core/creative/:executionId/cancel`

The browser uses the same `/api/core` origin contract through
`src/api/coreClient.js`.

## Deployment requirement

Production deployment remains fail-closed until its owner supplies a real
backend target plus the mandatory transaction store, provider runtime,
authentication verifier, artifact authority, security policy, budget policy,
and trusted asset hosts. `createCreativeCore` validates these at construction.
Provider-specific bootstrap must additionally reject an empty credential with a
provider-name-only error such as `Provider credential missing: FAL`; secrets may
never be added to public errors or telemetry.
