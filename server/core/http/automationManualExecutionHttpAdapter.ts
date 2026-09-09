import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AutomationManualExecutionService, AutomationManualExecutionView } from '../automation/AutomationManualExecutionService.ts';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import { authenticatedOwnerScope } from './authenticatedPrincipalScope.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

export const AUTOMATION_INVOCATION_PATH = '/api/core/automation-invocations';
const EXPECTED_AUTOMATION_REVISION_HEADER = 'x-expected-automation-revision';
const MANUAL_START_PATTERN = /^\/api\/core\/automations\/([^/]+)\/manual-runs$/;
const INVOCATION_PATTERN = /^\/api\/core\/automation-invocations\/([^/]+)$/;
const INVOCATION_ACTION_PATTERN = /^\/api\/core\/automation-invocations\/([^/]+)\/(result|retry|cancel)$/;
const START_FIELDS = new Set(['projectId', 'clientRequestId']);
const RESULT_FIELDS = new Set(['result']);
const EMPTY_FIELDS = new Set<string>();

type ManualExecutionPort = Pick<AutomationManualExecutionService, 'start' | 'resume' | 'submitLocalResult' | 'retry' | 'cancel'>;
type ManualExecutionAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;
type ManualExecutionScope = Readonly<{ tenantId: string; userId: string; projectId: string }>;
type ManualExecutionTerminalPreview = Readonly<{
  mint: (scope: ManualExecutionScope, artifactId: string) => string | Promise<string>;
}>;

export function isAutomationManualExecutionPath(pathname: string): boolean {
  return MANUAL_START_PATTERN.test(pathname)
    || pathname === AUTOMATION_INVOCATION_PATH
    || pathname.startsWith(`${AUTOMATION_INVOCATION_PATH}/`);
}

/**
 * C3b browser transport for one exact immutable Automation invocation.
 *
 * The browser may choose only the Automation resource, exact definition revision,
 * Project and idempotency token. Source Artifact, plan parameters, workflow
 * execution identity, step/capability/provider/model/executor and retry identity
 * remain server-owned. Follow-up calls are addressed only by invocationId.
 */
export function createAutomationManualExecutionHttpAdapter(input: Readonly<{
  execution: ManualExecutionPort;
  terminalPreview: ManualExecutionTerminalPreview;
  auth: ManualExecutionAuth;
  config: CoreServerConfig;
  accepting: () => boolean;
}>) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (!isAutomationManualExecutionPath(url.pathname)) return false;
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    response.setHeader('Cache-Control', 'no-store');
    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (!input.accepting()) throw httpError(503, 'shutting_down', 'Server is shutting down');
      if (request.method !== 'GET' && request.method !== 'HEAD') assertBrowserMutationAllowed(request, input.config);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      const auth = authenticatedOwnerScope(principal);

      const start = url.pathname.match(MANUAL_START_PATTERN);
      if (start && request.method === 'POST') {
        assertNoQuery(url);
        requireJson(request);
        const body = await readObject(request, input.config.bodyLimitBytes);
        assertOnlyFields(body, START_FIELDS);
        const automationId = decodePathSegment(start[1], 'automationId');
        const definitionRevision = requireRevisionHeader(request);
        const view = await input.execution.start(Object.freeze({
          automationId,
          definitionRevision,
          projectId: requiredString(body.projectId, 'projectId'),
          clientRequestId: requiredString(body.clientRequestId, 'clientRequestId'),
        }), auth);
        send(response, activeStatus(view), await publicView(view, auth, input.terminalPreview));
        return true;
      }

      const action = url.pathname.match(INVOCATION_ACTION_PATTERN);
      if (action && request.method === 'POST') {
        assertNoQuery(url);
        requireJson(request);
        const body = await readObject(request, input.config.bodyLimitBytes);
        const invocationId = decodePathSegment(action[1], 'invocationId');
        const operation = action[2];
        if (operation === 'result') {
          assertOnlyFields(body, RESULT_FIELDS);
          if (!body.result || typeof body.result !== 'object' || Array.isArray(body.result)) throw httpError(400, 'invalid_automation_result', 'result must be an object');
          const view = await input.execution.submitLocalResult(invocationId, auth, body.result);
          send(response, activeStatus(view), await publicView(view, auth, input.terminalPreview));
          return true;
        }
        assertOnlyFields(body, EMPTY_FIELDS);
        const view = operation === 'retry'
          ? await input.execution.retry(invocationId, auth)
          : await input.execution.cancel(invocationId, auth);
        send(response, operation === 'cancel' ? 200 : activeStatus(view), await publicView(view, auth, input.terminalPreview));
        return true;
      }

      const invocation = url.pathname.match(INVOCATION_PATTERN);
      if (invocation && request.method === 'GET') {
        assertNoQuery(url);
        const view = await input.execution.resume(decodePathSegment(invocation[1], 'invocationId'), auth);
        send(response, 200, await publicView(view, auth, input.terminalPreview));
        return true;
      }

      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'automation_manual_execution_error'),
        message: status === 500 ? 'Automation manual execution request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

async function publicView(
  view: AutomationManualExecutionView,
  auth: Readonly<{ tenantId: string; userId: string }>,
  terminalPreview: ManualExecutionTerminalPreview,
) {
  let terminalImageUrl: string | undefined;
  if (view.state === 'SUCCESS') {
    if (!view.terminalArtifactId) throw new Error('Automation SUCCESS is missing its terminal Artifact');
    terminalImageUrl = await terminalPreview.mint(Object.freeze({ ...auth, projectId: view.projectId }), view.terminalArtifactId);
    if (typeof terminalImageUrl !== 'string' || !terminalImageUrl.startsWith('/api/core/artifacts/results/')) {
      throw new Error('Automation terminal preview delivery contract is invalid');
    }
  }
  return Object.freeze({
    invocationId: view.invocationId,
    automationId: view.automationId,
    definitionRevision: view.definitionRevision,
    projectId: view.projectId,
    revision: view.revision,
    state: view.state,
    nextAction: view.nextAction,
    retryAvailable: view.retryAvailable,
    attemptStatus: view.attemptStatus,
    terminalArtifactId: view.terminalArtifactId,
    terminalImageUrl,
    failureCode: view.failureCode,
  });
}

function activeStatus(view: AutomationManualExecutionView): number {
  return view.state === 'SUCCESS' || view.state === 'CANCELLED' ? 200 : 202;
}
function requireRevisionHeader(request: IncomingMessage): number {
  const raw = header(request, EXPECTED_AUTOMATION_REVISION_HEADER)?.trim() ?? '';
  if (!/^[1-9][0-9]{0,15}$/.test(raw)) throw httpError(400, 'invalid_automation_revision', 'X-Expected-Automation-Revision must be a positive safe integer');
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1) throw httpError(400, 'invalid_automation_revision', 'X-Expected-Automation-Revision must be a positive safe integer');
  return value;
}
function assertOnlyFields(body: Readonly<Record<string, unknown>>, accepted: ReadonlySet<string>): void {
  for (const field of Object.keys(body)) if (!accepted.has(field)) throw httpError(400, 'client_automation_authority_forbidden', `${field} is not admitted by Automation manual execution`);
}
function assertNoQuery(url: URL): void {
  for (const field of url.searchParams.keys()) throw httpError(400, 'client_automation_authority_forbidden', `${field} is not admitted by Automation manual execution`);
}
function requiredString(value: unknown, field: string): string {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized) throw httpError(400, `invalid_automation_${field.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)}`, `${field} is required`);
  return normalized;
}
function decodePathSegment(value: string, field: string): string {
  try {
    const decoded = decodeURIComponent(value).trim();
    if (!decoded || decoded.includes('/')) throw new Error('invalid path segment');
    return decoded;
  } catch {
    throw httpError(400, 'invalid_automation_manual_execution_request', `${field} is invalid`);
  }
}
function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, X-Correlation-Id, X-Expected-Automation-Revision, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Expose-Headers', 'X-Correlation-Id');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}
function requireJson(request: IncomingMessage): void {
  if (!mediaType(request).startsWith('application/json')) throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
}
function mediaType(request: IncomingMessage): string { return String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase(); }
function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}
async function readObject(request: IncomingMessage, limit: number): Promise<Readonly<Record<string, unknown>>> {
  const value = await readJson(request, limit);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'invalid_json_shape', 'JSON body must be an object');
  return value as Readonly<Record<string, unknown>>;
}
async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  const bytes = await readBytes(request, limit);
  try { return JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch { throw httpError(400, 'invalid_json', 'Invalid JSON body'); }
}
async function readBytes(request: IncomingMessage, limit: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.byteLength;
    if (size > limit) throw httpError(413, 'body_too_large', 'Request body exceeds the configured limit');
    chunks.push(value);
  }
  return new Uint8Array(Buffer.concat(chunks));
}
function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  if (body === undefined) { response.end(); return; }
  const bytes = Buffer.from(JSON.stringify(body));
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Content-Length', bytes.byteLength);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(bytes);
}
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
