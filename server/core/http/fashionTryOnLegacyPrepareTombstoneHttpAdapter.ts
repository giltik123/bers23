import type { IncomingMessage, ServerResponse } from 'node:http';

const LEGACY_PREPARE_PATHS = new Set([
  '/api/core/local-execution/garment-mesh-warp/prepare',
  '/api/core/local-execution/garment-texture-composite/prepare',
]);

/**
 * Explicit tombstone for the two former browser-authoritative Fashion prepare routes.
 *
 * The adapter has no reference to either concrete execution service, so a legacy
 * request cannot accidentally reach prepare() through dependency injection. All
 * other former low-level Fashion routes are intentionally not handled here and
 * disappear from the public routing table after the atomic product cutover.
 */
export function createFashionTryOnLegacyPrepareTombstoneHttpAdapter() {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const path = safePath(request.url);
    if (path === undefined || !LEGACY_PREPARE_PATHS.has(path)) return false;
    const bytes = Buffer.from(JSON.stringify({
      error: 'fashion_tryon_orchestration_required',
      message: 'Use the Fashion Try-On orchestration API',
    }));
    response.statusCode = 410;
    response.setHeader('Content-Type', 'application/json');
    response.setHeader('Content-Length', bytes.byteLength);
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.end(bytes);
    return true;
  };
}

function safePath(rawTarget: string | undefined): string | undefined {
  try { return new URL(rawTarget ?? '/', 'http://core.invalid').pathname; }
  catch { return undefined; }
}
