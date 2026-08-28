import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type { LocalOrthogonalTransformExecutionService } from '../localExecution/LocalOrthogonalTransformExecutionService.ts';
import type { OrthogonalTransformInputDeliveryService } from '../localExecution/OrthogonalTransformInputDeliveryService.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/local-execution/orthogonal-transform/';
const INPUT_WIDTH_HEADER = 'X-Bers-Local-Input-Width';
const INPUT_HEIGHT_HEADER = 'X-Bers-Local-Input-Height';
const SOURCE_SHA_HEADER = 'X-Bers-Local-Source-Sha256';

type OrthogonalTransformAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type AdapterInput = Readonly<{
  service: LocalOrthogonalTransformExecutionService;
  inputDelivery: OrthogonalTransformInputDeliveryService;
  auth: OrthogonalTransformAuth;
  config: CoreServerConfig;
}>;

/** Capability-specific transport. It cannot dispatch another deterministic tool or read arbitrary artifacts. */
export function createOrthogonalTransformHttpAdapter(input: AdapterInput) {
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

      if (url.pathname === `${PREFIX}prepare` && request.method === 'POST') {
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        const prepared = await input.service.prepare({
          projectId: string(body.projectId),
          sourceArtifactId: string(body.sourceArtifactId),
          clientRequestId: string(body.clientRequestId),
          mode: string(body.mode) as never,
        }, principal);
        send(response, 202, prepared); return true;
      }

      const inputMatch = url.pathname.match(/^\/api\/core\/local-execution\/orthogonal-transform\/([^/]+)\/inputs$/);
      if (inputMatch && request.method === 'GET') {
        const canonical = await input.inputDelivery.deliver({ ticketId: decodeURIComponent(inputMatch[1]), projectId: requireProjectId(url) }, principal);
        const expectedBytes = canonical.width * canonical.height * 4;
        if (!Number.isSafeInteger(expectedBytes) || canonical.sourceRgba.byteLength !== expectedBytes) throw httpError(500, 'local_input_delivery_contract', 'Canonical orthogonal-transform input delivery length is invalid');
        response.setHeader(INPUT_WIDTH_HEADER, String(canonical.width));
        response.setHeader(INPUT_HEIGHT_HEADER, String(canonical.height));
        response.setHeader(SOURCE_SHA_HEADER, canonical.sourceSha256);
        sendBytes(response, 200, canonical.sourceRgba, 'application/octet-stream'); return true;
      }

      const uploadMatch = url.pathname.match(/^\/api\/core\/local-execution\/orthogonal-transform\/([^/]+)\/image-upload$/);
      if (uploadMatch && request.method === 'POST') {
        if (mediaType(request) !== 'image/png') throw httpError(415, 'unsupported_media_type', 'Content-Type must be image/png');
        const bytes = await readBytes(request, input.config.imageUploadLimitBytes);
        const evidence = await input.service.uploadImage({ ticketId: decodeURIComponent(uploadMatch[1]), projectId: requireProjectId(url), bytes }, principal);
        if (!evidence.width || !evidence.height || evidence.width > input.config.imageMaxDimension || evidence.height > input.config.imageMaxDimension || evidence.width * evidence.height > input.config.imageMaxPixels) throw httpError(400, 'invalid_image_dimensions', 'Local image dimensions are invalid or unsafe');
        send(response, 201, evidence); return true;
      }

      const resultMatch = url.pathname.match(/^\/api\/core\/local-execution\/orthogonal-transform\/([^/]+)\/result$/);
      if (resultMatch && request.method === 'POST') {
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        const projectId = string(body.projectId);
        if (!projectId) throw httpError(400, 'invalid_project_id', 'projectId is required');
        const finalized = await input.service.submit({ ticketId: decodeURIComponent(resultMatch[1]), projectId, result: body.result }, principal);
        const publicResult = Object.freeze({ executionId: finalized.executionId, status: finalized.status, artifactId: finalized.artifactId, verification: Object.freeze({ valid: finalized.outcome.verification.valid }) });
        send(response, finalized.status === 'SUCCESS' ? 200 : 422, publicResult); return true;
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

function requireProjectId(url: URL): string { const projectId = url.searchParams.get('projectId')?.trim() ?? ''; if (!projectId) throw httpError(400, 'invalid_project_id', 'projectId is required'); return projectId; }
function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true'); response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Expose-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}, ${INPUT_WIDTH_HEADER}, ${INPUT_HEIGHT_HEADER}, ${SOURCE_SHA_HEADER}`);
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}
function requireJson(request: IncomingMessage): void { if (!mediaType(request).startsWith('application/json')) throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/json'); }
function mediaType(request: IncomingMessage): string { return String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase(); }
function header(request: IncomingMessage, name: string): string | undefined { const value = request.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value; }
async function readJson(request: IncomingMessage, limit: number): Promise<unknown> { const bytes = await readBytes(request, limit); try { return JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { throw httpError(400, 'invalid_json', 'Invalid JSON body'); } }
async function readBytes(request: IncomingMessage, limit: number): Promise<Uint8Array> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.byteLength; if (size > limit) throw httpError(413, 'body_too_large', 'Request body exceeds the configured limit'); chunks.push(value); } return new Uint8Array(Buffer.concat(chunks)); }
function send(response: ServerResponse, status: number, body: unknown): void { response.statusCode = status; if (body === undefined) { response.end(); return; } const bytes = Buffer.from(JSON.stringify(body)); response.setHeader('Content-Type', 'application/json'); response.setHeader('Content-Length', bytes.byteLength); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(bytes); }
function sendBytes(response: ServerResponse, status: number, bytes: Uint8Array, contentType: string): void { response.statusCode = status; response.setHeader('Content-Type', contentType); response.setHeader('Content-Length', bytes.byteLength); response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(Buffer.from(bytes)); }
function string(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
