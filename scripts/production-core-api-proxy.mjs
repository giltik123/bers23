import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';

const CANONICAL_API_PATH = '/api/core';
const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization',
  'te', 'trailer', 'transfer-encoding', 'upgrade',
]);

/** An upstream target is operator-owned, never supplied by a browser request. */
export function coreApiUpstreamOrigin(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string' || value !== value.trim()) throw new Error('CORE_API_URL must be an exact upstream URL');
  let url;
  try { url = new URL(value); }
  catch { throw new Error('CORE_API_URL must be an absolute upstream URL'); }
  const local = url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
  if (url.protocol !== 'https:' && !local) throw new Error('CORE_API_URL must use HTTPS outside localhost');
  if (url.username || url.password || url.search || url.hash || url.pathname !== CANONICAL_API_PATH) {
    throw new Error('CORE_API_URL must target exactly /api/core without credentials, query or fragment');
  }
  return url.origin;
}

function filteredHeaders(headers, requestSide = false) {
  const connectionTokens = new Set(String(headers.connection ?? '').toLowerCase().split(',').map(x => x.trim()).filter(Boolean));
  return Object.fromEntries(Object.entries(headers).filter(([name]) => {
    const lower = name.toLowerCase();
    if (HOP_BY_HOP.has(lower) || connectionTokens.has(lower)) return false;
    // A public visitor must not control Core's trusted proxy or host headers.
    if (requestSide && (lower === 'host' || lower === 'forwarded' || lower.startsWith('x-forwarded-'))) return false;
    return true;
  }));
}

/** Stream all canonical API requests through the frontend's origin. */
export function createCoreApiProxy(upstreamUrl) {
  const upstreamOrigin = coreApiUpstreamOrigin(upstreamUrl);
  return (request, response) => {
    if (!upstreamOrigin) {
      response.writeHead(503, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Core API upstream not configured');
      return;
    }
    if (typeof request.url !== 'string' || !request.url.startsWith('/') || request.url.startsWith('//')) {
      response.writeHead(400); response.end('Bad Request'); return;
    }
    const target = new URL(request.url, upstreamOrigin);
    if (target.origin !== upstreamOrigin || (target.pathname !== CANONICAL_API_PATH && !target.pathname.startsWith(CANONICAL_API_PATH + '/'))) {
      response.writeHead(400); response.end('Bad Request'); return;
    }

    const send = target.protocol === 'https:' ? httpsRequest : httpRequest;
    const upstream = send(target, {
      method: request.method,
      headers: filteredHeaders(request.headers, true),
    }, incoming => {
      response.writeHead(incoming.statusCode ?? 502, filteredHeaders(incoming.headers));
      incoming.on('error', () => response.destroy());
      incoming.pipe(response);
    });
    upstream.on('error', () => {
      if (!response.headersSent) {
        response.writeHead(502, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Core API upstream unavailable');
      } else {
        response.destroy();
      }
    });
    request.on('aborted', () => upstream.destroy());
    response.on('close', () => { if (!response.writableEnded) upstream.destroy(); });
    request.pipe(upstream);
  };
}
