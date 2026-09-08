import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type { BoundedAgentDeterministicWorkflowService, BoundedAgentWorkflowView } from '../workflow/BoundedAgentDeterministicWorkflowService.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/agent/bounded-deterministic/';
const START_FIELDS = new Set(['clientRequestId', 'projectId', 'sourceArtifactId', 'mode', 'width', 'height']);
const RESULT_FIELDS = new Set(['projectId', 'result']);
const PROJECT_ONLY_FIELDS = new Set(['projectId']);
const RESUME_QUERY_FIELDS = new Set(['projectId']);

type AgentPort = Pick<BoundedAgentDeterministicWorkflowService, 'start' | 'resume' | 'submitLocalResult' | 'retry' | 'cancel'>;
type AgentAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

/**
 * Narrow authenticated transport for the fixed deterministic Agent v1.
 *
 * The route does not expose step/capability/provider/model selection. The only
 * ticket identity accepted from the browser is nested inside the result for the
 * exact outstanding Core-issued nextAction.
 */
export function createBoundedAgentHttpAdapter(input: Readonly<{
  workflow: AgentPort;
  auth: AgentAuth;
  config: CoreServerConfig;
}>) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (!url.pathname.startsWith(PREFIX)) return false;
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    response.setHeader('Cache-Control', 'no-store');
    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (request.method !== 'GET' && request.method !== 'HEAD') assertBrowserMutationAllowed(request, input.config);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      const auth = authenticatedScope(principal);

      if (url.pathname === `${PREFIX}start` && request.method === 'POST') {
        requireJson(request);
        const body = await readObject(request, input.config.bodyLimitBytes);
        assertOnlyFields(body, START_FIELDS);
        const view = await input.workflow.start(Object.freeze({
          clientRequestId: string(body.clientRequestId),
          projectId: string(body.projectId),
          sourceArtifactId: string(body.sourceArtifactId),
          mode: string(body.mode) as never,
          width: body.width as number,
          height: body.height as number,
        }), auth);
        send(response, view.state === 'SUCCESS' ? 200 : 202, publicView(view)); return true;
      }

      const executionMatch = url.pathname.match(/^\/api\/core\/agent\/bounded-deterministic\/([^/]+)$/);
      if (executionMatch && request.method === 'GET') {
        assertOnlyQueryFields(url, RESUME_QUERY_FIELDS);
        const projectId = requireProjectId(url);
        const view = await input.workflow.resume(decodeURIComponent(executionMatch[1]), projectId, auth);
        send(response, 200, publicView(view)); return true;
      }

      const resultMatch = url.pathname.match(/^\/api\/core\/agent\/bounded-deterministic\/([^/]+)\/result$/);
      if (resultMatch && request.method === 'POST') {
        requireJson(request);
        const body = await readObject(request, input.config.bodyLimitBytes);
        assertOnlyFields(body, RESULT_FIELDS);
        const projectId = requiredString(body.projectId, 'projectId');
        if (!body.result || typeof body.result !== 'object' || Array.isArray(body.result)) throw httpError(400, 'invalid_agent_result', 'result must be an object');
        const view = await input.workflow.submitLocalResult(decodeURIComponent(resultMatch[1]), projectId, auth, body.result);
        send(response, view.state === 'SUCCESS' ? 200 : 202, publicView(view)); return true;
      }

      const retryMatch = url.pathname.match(/^\/api\/core\/agent\/bounded-deterministic\/([^/]+)\/retry$/);
      if (retryMatch && request.method === 'POST') {
        requireJson(request);
        const body = await readObject(request, input.config.bodyLimitBytes);
        assertOnlyFields(body, PROJECT_ONLY_FIELDS);
        const view = await input.workflow.retry(decodeURIComponent(retryMatch[1]), requiredString(body.projectId, 'projectId'), auth);
        send(response, view.state === 'SUCCESS' ? 200 : 202, publicView(view)); return true;
      }

      const cancelMatch = url.pathname.match(/^\/api\/core\/agent\/bounded-deterministic\/([^/]+)\/cancel$/);
      if (cancelMatch && request.method === 'POST') {
        requireJson(request);
        const body = await readObject(request, input.config.bodyLimitBytes);
        assertOnlyFields(body, PROJECT_ONLY_FIELDS);
        const view = await input.workflow.cancel(decodeURIComponent(cancelMatch[1]), requiredString(body.projectId, 'projectId'), auth);
        send(response, 200, publicView(view)); return true;
      }

      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'bounded_agent_error'),
        message: status === 500 ? 'Bounded Agent request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function publicView(view: BoundedAgentWorkflowView) {
  return Object.freeze({
    executionId: view.executionId,
    revision: view.revision,
    state: view.state,
    nextAction: view.nextAction,
    retryAvailable: view.retryAvailable,
    attemptStatus: view.attemptStatus,
    terminalArtifactId: view.terminalArtifactId,
    failureCode: view.failureCode,
  });
}

function authenticatedScope(principal: AuthenticatedPrincipal): Readonly<{ tenantId: string; userId: string }> {
  return Object.freeze({ tenantId: principal.tenantId, userId: principal.userId });
}
function assertOnlyFields(body: Readonly<Record<string, unknown>>, accepted: ReadonlySet<string>): void {
  for (const field of Object.keys(body)) if (!accepted.has(field)) throw httpError(400, 'client_agent_authority_forbidden', `${field} is not admitted by bounded Agent v1`);
}
function assertOnlyQueryFields(url: URL, accepted: ReadonlySet<string>): void {
  for (const field of url.searchParams.keys()) if (!accepted.has(field)) throw httpError(400, 'client_agent_authority_forbidden', `${field} is not admitted by bounded Agent v1`);
}
function requireProjectId(url: URL): string { return requiredString(url.searchParams.get('projectId'), 'projectId'); }
function requiredString(value: unknown, field: string): string {
  const normalized = string(value);
  if (!normalized) throw httpError(400, `invalid_${field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`, `${field} is required`);
  return normalized;
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
async function readObject(request: IncomingMessage, limit: number): Promise<Readonly<Record<string, unknown>>> {
  const value = await readJson(request, limit);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'invalid_json_shape', 'JSON body must be an object');
  return value as Readonly<Record<string, unknown>>;
}
async function readJson(request: IncomingMessage, limit: number): Promise<unknown> { const bytes = await readBytes(request, limit); try { return JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { throw httpError(400, 'invalid_json', 'Invalid JSON body'); } }
async function readBytes(request: IncomingMessage, limit: number): Promise<Uint8Array> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.byteLength; if (size > limit) throw httpError(413, 'body_too_large', 'Request body exceeds the configured limit'); chunks.push(value); } return new Uint8Array(Buffer.concat(chunks)); }
function send(response: ServerResponse, status: number, body: unknown): void { response.statusCode = status; if (body === undefined) { response.end(); return; } const bytes = Buffer.from(JSON.stringify(body)); response.setHeader('Content-Type', 'application/json'); response.setHeader('Content-Length', bytes.byteLength); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(bytes); }
function string(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
