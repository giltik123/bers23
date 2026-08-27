import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type { LocalCompositeContinuationService } from '../workflow/LocalCompositeContinuationService.ts';
import type { LocalCompositeOutputUploadService } from '../workflow/LocalCompositeOutputUploadService.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/composite-continuations/';

type CompositeAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

/** Authenticated browser transport for the first narrow durable LOCAL_ONLY composite. */
export function createLocalCompositeContinuationHttpAdapter(input: Readonly<{
  continuation: LocalCompositeContinuationService;
  outputs: LocalCompositeOutputUploadService;
  auth: CompositeAuth;
  config: CoreServerConfig;
}>) {
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

      if (url.pathname === `${PREFIX}start` && request.method === 'POST') {
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        const projectId = string(body.projectId);
        if (!projectId) throw httpError(400, 'invalid_project_id', 'projectId is required');
        rejectAuthorityFields(body);
        const view = await input.continuation.start({
          clientRequestId: string(body.clientRequestId),
          inputArtifactId: string(body.inputArtifactId),
          analysis: requiredRecord(body.analysis, 'analysis'),
          points: requiredRecordArray(body.points, 'points'),
        }, scope(principal, projectId));
        send(response, 202, publicView(view)); return true;
      }

      const executionMatch = url.pathname.match(/^\/api\/core\/composite-continuations\/([^/]+)$/);
      if (executionMatch && request.method === 'GET') {
        const projectId = url.searchParams.get('projectId')?.trim() ?? '';
        if (!projectId) throw httpError(400, 'invalid_project_id', 'projectId is required');
        const view = await input.continuation.resume(decodeURIComponent(executionMatch[1]), scope(principal, projectId));
        send(response, 200, publicView(view)); return true;
      }

      const outputMatch = url.pathname.match(/^\/api\/core\/composite-continuations\/([^/]+)\/output$/);
      if (outputMatch && request.method === 'POST') {
        const projectId = url.searchParams.get('projectId')?.trim() ?? '';
        if (!projectId) throw httpError(400, 'invalid_project_id', 'projectId is required');
        const mimeType = mediaType(request);
        if (mimeType !== 'application/octet-stream' && mimeType !== 'image/png') throw httpError(415, 'unsupported_media_type', 'Composite output must use application/octet-stream or image/png');
        const limit = mimeType === 'image/png' ? input.config.imageUploadLimitBytes : input.config.maskUploadLimitBytes;
        const bytes = await readBytes(request, limit);
        const evidence = await input.outputs.upload({ executionId: decodeURIComponent(outputMatch[1]), scope: scope(principal, projectId), bytes, mimeType });
        send(response, 201, evidence); return true;
      }

      const resultMatch = url.pathname.match(/^\/api\/core\/composite-continuations\/([^/]+)\/result$/);
      if (resultMatch && request.method === 'POST') {
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        rejectAuthorityFields(body);
        const projectId = string(body.projectId);
        if (!projectId) throw httpError(400, 'invalid_project_id', 'projectId is required');
        const result = body.result;
        if (!result || typeof result !== 'object' || Array.isArray(result)) throw httpError(400, 'invalid_local_result', 'result is required');
        const view = await input.continuation.submitLocalResult(decodeURIComponent(resultMatch[1]), scope(principal, projectId), result);
        send(response, view.state === 'SUCCESS' ? 200 : 202, publicView(view)); return true;
      }

      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, { error: error.code ?? (status === 500 ? 'internal_error' : 'local_composite_error'), message: status === 500 ? 'Local composite request failed' : error.message, correlationId });
      return true;
    }
  };
}

function publicView(view: Awaited<ReturnType<LocalCompositeContinuationService['resume']>>) {
  return Object.freeze({
    executionId: view.executionId,
    revision: view.revision,
    state: view.state,
    nextAction: view.nextAction,
    terminalArtifactId: view.terminalArtifactId,
    failureCode: view.failureCode,
  });
}

/** Transport must never accept client-selected workflow authority. */
function rejectAuthorityFields(body: Readonly<Record<string, unknown>>): void {
  for (const field of ['stepId', 'operation', 'capability', 'ticketId', 'nextAction', 'target', 'providerId']) {
    if (body[field] !== undefined) throw httpError(400, 'client_workflow_authority_forbidden', `${field} is server-owned workflow authority`);
  }
}
function scope(principal: AuthenticatedPrincipal, projectId: string) { return Object.freeze({ tenantId: principal.tenantId, userId: principal.userId, projectId }); }
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
function requiredRecord(value: unknown, field: string): Readonly<Record<string, unknown>> {
  const parsed = record(value);
  if (!parsed) throw httpError(400, 'invalid_local_selection', `${field} must be an object`);
  return parsed;
}
function requiredRecordArray(value: unknown, field: string): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value) || value.some(candidate => !record(candidate))) throw httpError(400, 'invalid_local_selection', `${field} must be an array of objects`);
  return Object.freeze(value.map(candidate => record(candidate)!));
}
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
