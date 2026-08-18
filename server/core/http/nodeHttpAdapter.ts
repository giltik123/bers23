import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HmacJwtVerifier } from '../auth/hmacJwtVerifier.ts';
import type { CreativeApplicationCore } from '../composition/createCreativeCore.ts';
import type { CoreServerConfig } from '../config.ts';

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
export function createNodeHttpAdapter(input: Readonly<{ core: CreativeApplicationCore; auth: HmacJwtVerifier; config: CoreServerConfig; ready: () => Promise<boolean>; accepting: () => boolean }>) {
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
      const principal = input.auth.verify(header(request, 'authorization'));
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
async function readBody(request: IncomingMessage): Promise<Uint8Array> { const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); return Buffer.concat(chunks); }
async function readJson(request: IncomingMessage, limit: number): Promise<unknown> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > limit) throw Object.assign(new Error('Request body is too large'), { code: 'body_too_large', status: 413 }); chunks.push(buffer); } try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Request body must contain valid JSON'), { code: 'invalid_json', status: 400 }); } }
function sendError(response: ServerResponse, status: number, code: string, message: string, correlationId: string, retryable: boolean) { return send(response, status, { code, message, correlationId, retryable }); }
function send(response: ServerResponse, status: number, body: unknown): void { if (response.headersSent) return; response.statusCode = status; if (body === undefined) { response.end(); return; } response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(body)); }
