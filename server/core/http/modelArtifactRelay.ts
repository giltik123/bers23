const RELEASE_PREFIX = 'https://github.com/giltik123/bers23/releases/download/mobilesam-vit-t-v1.0.2/';
export const MODEL_RELAY_PREFIX = '/api/core/models/mobilesam-vit-t/1.0.2/';
const ALLOWED = new Set(['mobilesam-encoder.onnx', 'mobilesam-encoder.onnx.sig', 'mobilesam-decoder.onnx', 'mobilesam-decoder.onnx.sig']);

export type UpstreamFetch = (input: string, init?: RequestInit) => Promise<Response>;

/** Public, fixed-destination transport for the four immutable signed MobileSAM assets. */
export async function modelArtifactRelay(request: Request, upstreamFetch: UpstreamFetch = fetch): Promise<Response | undefined> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(MODEL_RELAY_PREFIX)) return undefined;
  if (request.method !== 'GET' || url.search || url.hash) return error(404, 'model_artifact_not_found');
  const name = url.pathname.slice(MODEL_RELAY_PREFIX.length);
  if (!ALLOWED.has(name) || name.includes('/')) return error(404, 'model_artifact_not_found');
  try {
    const upstream = await upstreamFetch(`${RELEASE_PREFIX}${name}`, { redirect: 'follow' });
    if (upstream.status !== 200) return error(502, 'model_artifact_upstream_failed');
    return new Response(upstream.body, { status: 200, headers: { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'public, max-age=31536000, immutable' } });
  } catch {
    return error(503, 'model_artifact_upstream_unavailable');
  }
}

function error(status: number, code: string) {
  return Response.json({ code, message: 'Model artifact is unavailable', retryable: status >= 500 }, { status, headers: { 'Cache-Control': 'no-store' } });
}
