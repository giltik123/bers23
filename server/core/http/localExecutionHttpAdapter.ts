import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type { LocalSegmentationExecutionService } from '../localExecution/LocalSegmentationExecutionService.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/local-execution/';

type LocalExecutionAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

/** Narrow production transport for Core-authorized on-device execution. */
export function createLocalExecutionHttpAdapter(input: Readonly<{ service: LocalSegmentationExecutionService; auth: LocalExecutionAuth; config: CoreServerConfig }>) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (!url.pathname.startsWith(PREFIX)) return false;
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (request.method !== 'GET' && request.method !== 'HEAD') assertBrowserMutationAllowed(request, input.config);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));

      if (url.pathname === `${PREFIX}segment/prepare` && request.method === 'POST') {
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        const prepared = await input.service.prepare({
          projectId: string(body.projectId),
          inputArtifactId: string(body.inputArtifactId),
          clientRequestId: string(body.clientRequestId),
          analysis: record(body.analysis),
        }, principal);
        send(response, 202, prepared); return true;
      }

      const uploadMatch = url.pathname.match(/^\/api\/core\/local-execution\/([^/]+)\/mask-upload$/);
      if (uploadMatch && request.method === 'POST') {
        if (mediaType(request) !== 'application/octet-stream') throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/octet-stream');
        const projectId = url.searchParams.get('projectId')?.trim() ?? '';
        const width = Number(url.searchParams.get('width')); const height = Number(url.searchParams.get('height'));
        if (!projectId || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > input.config.maskMaxDimension || height > input.config.maskMaxDimension || width * height > input.config.maskUploadLimitBytes) throw httpError(400, 'invalid_mask_dimensions', 'Local MASK dimensions are invalid or unsafe');
        const bytes = await readBytes(request, input.config.maskUploadLimitBytes);
        const evidence = await input.service.uploadMask({ ticketId: decodeURIComponent(uploadMatch[1]), projectId, width, height, bytes }, principal);
        send(response, 201, evidence); return true;
      }

      const resultMatch = url.pathname.match(/^\/api\/core\/local-execution\/([^/]+)\/result$/);
      if (resultMatch && request.method === 'POST') {
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        const projectId = string(body.projectId);
        const finalized = await input.service.submit({ ticketId: decodeURIComponent(resultMatch[1]), projectId, result: body.result }, principal);
        send(response, finalized.status === 'SUCCESS' ? 200 : 422, finalized); return true;
      }

      const statusMatch = url.pathname.match(/^\/api\/core\/local-execution\/executions\/([^/]+)\/status$/);
      if (statusMatch && request.method === 'GET') {
        send(response, 200, input.service.status(decodeURIComponent(statusMatch[1]), principal)); return true;
      }

      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, { error: error.code ?? (status === 500 ? 'internal_error' : 'local_execution_error'), message: status === 500 ? 'Local execution request failed' : error.message, correlationId });
      return true;
    }
  };
}

function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Expose-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}
function requireJson(request: IncomingMessage): void { if (!mediaType(request).startsWith('application/json')) throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/json'); }
function mediaType(request: IncomingMessage): string { return String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase(); }
function header(request: IncomingMessage, name: string): string | undefined { const value = request.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value; }
async function readJson(request: IncomingMessage, limit: number): Promise<unknown> { const bytes = await readBytes(request, limit); try { return JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { throw httpError(400, 'invalid_json', 'Invalid JSON body'); } }
async function readBytes(request: IncomingMessage, limit: number): Promise<Uint8Array> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.byteLength; if (size > limit) throw httpError(413, 'body_too_large', 'Request body exceeds the configured limit'); chunks.push(value); } return new Uint8Array(Buffer.concat(chunks)); }
function send(response: ServerResponse, status: number, body: unknown): void { response.statusCode = status; if (body === undefined) { response.end(); return; } const bytes = Buffer.from(JSON.stringify(body)); response.setHeader('Content-Type', 'application/json'); response.setHeader('Content-Length', bytes.byteLength); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(bytes); }
function string(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function record(value: unknown): Readonly<Record<string, unknown>> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
