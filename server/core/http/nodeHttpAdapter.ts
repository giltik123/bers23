import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HmacJwtVerifier } from '../auth/hmacJwtVerifier.ts';
import type { CreativeApplicationCore } from '../composition/createCreativeCore.ts';
import type { CoreServerConfig } from '../config.ts';
import { modelArtifactRelay } from './modelArtifactRelay.ts';
import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';

/** Minimal Node transport for a framework-neutral Fetch handler. */
export function nodeHttpAdapter(handler: (request: Request) => Promise<Response>) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const origin = `http://${request.headers.host ?? 'localhost'}`;
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request);
    const result = await handler(new Request(new URL(request.url ?? '/', origin), { method: request.method, headers: request.headers as HeadersInit, body }));
    response.statusCode = result.status;
    result.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(Buffer.from(await result.arrayBuffer()));
  };
}

/** Production Node transport with health, CORS, authentication and request limits. */
export function createNodeHttpAdapter(input: Readonly<{ core: CreativeApplicationCore; artifacts: ArtifactAuthority; auth: HmacJwtVerifier; config: CoreServerConfig; ready: () => Promise<boolean>; accepting: () => boolean }>) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || randomUUID(); response.setHeader('X-Correlation-Id', correlationId);
    try {
      const origin = header(request, 'origin');
      if (origin) { if (!input.config.allowedWebOrigins.includes(origin)) return sendError(response, 403, 'origin_denied', 'Origin is not allowed', correlationId, false); response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Correlation-Id'); response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS'); }
      if (request.method === 'OPTIONS') return send(response, 204, undefined);
      const path = new URL(request.url ?? '/', 'http://core.invalid').pathname;
      if (path === '/health/live' && request.method === 'GET') return send(response, 200, { status: 'live' });
      if (path === '/health/ready' && request.method === 'GET') { const ready = input.accepting() && await input.ready(); return send(response, ready ? 200 : 503, { status: ready ? 'ready' : 'not_ready' }); }
      if (!input.accepting()) return sendError(response, 503, 'shutting_down', 'Server is shutting down', correlationId, true);
      const relay = await modelArtifactRelay(new Request(new URL(request.url ?? '/', 'http://core.invalid'), { method: request.method }));
      if (relay) return sendFetchResponse(response, relay);
      const resultMatch = path.match(/^\/api\/core\/artifacts\/results\/([^/]+)$/);
      if (resultMatch && request.method === 'GET') {
        const claim = input.artifacts.external.resolveStoredFinal(decodeURIComponent(resultMatch[1]));
        const stored = await input.artifacts.images.load(claim.storageId, claim);
        if (!stored) return sendError(response, 404, 'result_not_found', 'Final image artifact is unavailable', correlationId, false);
        response.statusCode = 200; response.setHeader('Content-Type', stored.contentType); response.setHeader('Content-Length', stored.bytes.byteLength); response.setHeader('Cache-Control', 'private, max-age=300'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(stored.bytes); return;
      }
      const principal = input.auth.verify(header(request, 'authorization'));
      if (path === '/api/core/artifacts/masks' && request.method === 'POST') {
        if (mediaType(request) !== 'application/octet-stream') return sendError(response, 415, 'unsupported_media_type', 'Content-Type must be application/octet-stream', correlationId, false);
        const url = new URL(request.url ?? '/', 'http://core.invalid'); const projectId = url.searchParams.get('projectId')?.trim();
        const width = Number(url.searchParams.get('width')); const height = Number(url.searchParams.get('height'));
        if (!projectId || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > input.config.maskMaxDimension || height > input.config.maskMaxDimension || width * height > input.config.maskUploadLimitBytes) return sendError(response, 400, 'invalid_mask_dimensions', 'Canonical MASK dimensions are invalid or unsafe', correlationId, false);
        const alpha = await readBytes(request, input.config.maskUploadLimitBytes);
        if (alpha.byteLength !== width * height) return sendError(response, 400, 'invalid_mask_size', 'Canonical MASK byte length must equal width * height', correlationId, false);
        const scope = { ...principal, projectId }; const stored = await input.artifacts.masks.persist(scope, width, height, alpha); const artifactId = input.artifacts.external.issueStoredMask(stored.storageId, scope);
        return send(response, 201, { artifactId, role: 'MASK', state: 'AVAILABLE', width, height, coordinateSpace: 'ORIGINAL', encoding: 'ALPHA_8_LOSSLESS' });
      }
      if (path === '/api/core/creative/execute' && request.method === 'POST') {
        if (!mediaType(request).startsWith('application/json')) return sendError(response, 415, 'unsupported_media_type', 'Content-Type must be application/json', correlationId, false);
        const body = await readJson(request, input.config.bodyLimitBytes); const result = await input.core.execute({ body, auth: principal, correlationId }); return send(response, result.status, result.body);
      }
      const match = path.match(/^\/api\/core\/creative\/([^/]+)\/(status|result|cancel)$/);
      if (match) { const [, executionId, action] = match; const coreRequest = { auth: principal, correlationId }; const result = action === 'status' && request.method === 'GET' ? input.core.lifecycle.status(coreRequest, executionId) : action === 'result' && request.method === 'GET' ? input.core.lifecycle.result(coreRequest, executionId) : action === 'cancel' && request.method === 'POST' ? input.core.lifecycle.cancel(coreRequest, executionId) : undefined; if (result) return send(response, result.status, result.body); }
      return sendError(response, 404, 'not_found', 'Route not found', correlationId, false);
    } catch (cause) {
      const error = cause as Error & { code?: string; status?: number; retryable?: boolean };
      return sendError(response, error.status ?? 500, error.code ?? 'internal_error', error.status ? error.message : 'Internal server error', correlationId, error.retryable ?? false);
    }
  };
}

function header(request: IncomingMessage, name: string): string | undefined { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value; }
function mediaType(request: IncomingMessage): string { return (header(request, 'content-type') ?? '').split(';')[0].trim().toLowerCase(); }
async function readBody(request: IncomingMessage): Promise<ArrayBuffer> { const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks); return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer; }
async function readJson(request: IncomingMessage, limit: number): Promise<unknown> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > limit) throw Object.assign(new Error('Request body is too large'), { code: 'body_too_large', status: 413 }); chunks.push(buffer); } try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Request body must contain valid JSON'), { code: 'invalid_json', status: 400 }); } }
async function readBytes(request: IncomingMessage, limit: number): Promise<Uint8Array> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > limit) throw Object.assign(new Error('Canonical MASK is too large'), { code: 'body_too_large', status: 413 }); chunks.push(buffer); } return new Uint8Array(Buffer.concat(chunks)); }
function sendError(response: ServerResponse, status: number, code: string, message: string, correlationId: string, retryable: boolean) { return send(response, status, { code, message, correlationId, retryable }); }
function send(response: ServerResponse, status: number, body: unknown): void { if (response.headersSent) return; response.statusCode = status; if (body === undefined) { response.end(); return; } response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(body)); }
async function sendFetchResponse(response: ServerResponse, result: Response): Promise<void> { response.statusCode = result.status; result.headers.forEach((value, key) => response.setHeader(key, value)); response.end(Buffer.from(await result.arrayBuffer())); }
