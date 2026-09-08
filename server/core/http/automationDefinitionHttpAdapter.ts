import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import { PostgresAutomationDefinitionStore, type AutomationDefinition } from '../automation/PostgresAutomationDefinitionStore.ts';
import { authenticatedOwnerScope } from './authenticatedPrincipalScope.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

export const AUTOMATION_DEFINITION_PATH = '/api/core/automations';
const AUTOMATION_REVISION_HEADER = 'X-Automation-Revision';
const EXPECTED_AUTOMATION_REVISION_HEADER = 'X-Expected-Automation-Revision';
const MAX_JSON_BYTES = 32 * 1024;

type AdapterInput = Readonly<{
  definitions: PostgresAutomationDefinitionStore;
  auth: Readonly<{ verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal> }>;
  config: CoreServerConfig;
  accepting: () => boolean;
}>;

export function createAutomationDefinitionHttpAdapter(input: AdapterInput) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (url.pathname !== AUTOMATION_DEFINITION_PATH && !url.pathname.startsWith(`${AUTOMATION_DEFINITION_PATH}/`)) return false;
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (!input.accepting()) throw httpError(503, 'shutting_down', 'Server is shutting down');
      if (request.method !== 'GET' && request.method !== 'HEAD') assertBrowserMutationAllowed(request, input.config);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      const scope = authenticatedOwnerScope(principal);

      if (url.pathname === AUTOMATION_DEFINITION_PATH && request.method === 'GET') {
        send(response, 200, (await input.definitions.list(scope)).map(dto)); return true;
      }
      if (url.pathname === AUTOMATION_DEFINITION_PATH && request.method === 'POST') {
        requireJson(request);
        sendDefinition(response, 201, await input.definitions.create(scope, transportCreate(await readJsonObject(request, MAX_JSON_BYTES))));
        return true;
      }

      const lifecycle = url.pathname.match(/^\/api\/core\/automations\/([^/]+)\/(archive|restore)$/);
      if (lifecycle && request.method === 'POST') {
        const id = decodePathSegment(lifecycle[1]);
        const revision = requireRevisionHeader(request);
        const definition = lifecycle[2] === 'archive' ? await input.definitions.archive(scope, id, revision) : await input.definitions.restore(scope, id, revision);
        sendDefinition(response, 200, definition); return true;
      }

      const match = url.pathname.match(/^\/api\/core\/automations\/([^/]+)$/);
      if (match && request.method === 'GET') {
        const definition = await input.definitions.get(scope, decodePathSegment(match[1]));
        if (!definition) throw httpError(404, 'automation_not_found', 'Automation definition not found');
        sendDefinition(response, 200, definition); return true;
      }
      if (match && request.method === 'PATCH') {
        requireJson(request);
        sendDefinition(response, 200, await input.definitions.update(scope, decodePathSegment(match[1]), requireRevisionHeader(request), transportUpdate(await readJsonObject(request, MAX_JSON_BYTES))));
        return true;
      }
      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, { error: error.code ?? (status === 500 ? 'internal_error' : 'automation_request_error'), message: status === 500 ? 'Automation definition request failed' : error.message, correlationId });
      return true;
    }
  };
}

function transportCreate(record: Record<string, unknown>) {
  exactKeys(record, ['name','trigger','plan'], ['name','trigger','plan'], 'invalid_automation_create');
  return Object.freeze({ name: record.name, trigger: record.trigger, plan: transportPlan(record.plan) });
}
function transportUpdate(record: Record<string, unknown>) {
  exactKeys(record, ['name','plan'], [], 'invalid_automation_update');
  if (Object.keys(record).length === 0) throw httpError(400, 'invalid_automation_update', 'Automation update must change name or plan');
  return Object.freeze({ ...(Object.hasOwn(record, 'name') ? { name: record.name } : {}), ...(Object.hasOwn(record, 'plan') ? { plan: transportPlan(record.plan) } : {}) });
}
function transportPlan(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'invalid_automation_plan', 'Automation plan must be an object');
  const record = value as Record<string, unknown>;
  exactKeys(record, ['kind','orthogonal_mode','target_width','target_height'], ['kind','orthogonal_mode','target_width','target_height'], 'invalid_automation_plan');
  return Object.freeze({ kind: record.kind, orthogonalMode: record.orthogonal_mode, targetWidth: record.target_width, targetHeight: record.target_height });
}
function exactKeys(record: Record<string, unknown>, allowed: readonly string[], required: readonly string[], code: string): void {
  const keys = Object.keys(record);
  if (keys.some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(record, key))) throw httpError(400, code, `Request accepts only: ${allowed.join(', ')}`);
}
function dto(definition: AutomationDefinition) {
  return Object.freeze({ id: definition.id, name: definition.name, trigger: definition.trigger, plan: Object.freeze({ kind: definition.plan.kind, orthogonal_mode: definition.plan.orthogonalMode, target_width: definition.plan.targetWidth, target_height: definition.plan.targetHeight }), status: definition.status, revision: definition.revision, created_at: definition.createdAt, updated_at: definition.updatedAt });
}
function sendDefinition(response: ServerResponse, status: number, definition: AutomationDefinition): void { response.setHeader(AUTOMATION_REVISION_HEADER, String(definition.revision)); send(response, status, dto(definition)); }
function requireRevisionHeader(request: IncomingMessage): number {
  const raw = header(request, EXPECTED_AUTOMATION_REVISION_HEADER);
  if (!raw) throw httpError(428, 'automation_revision_precondition_required', `${EXPECTED_AUTOMATION_REVISION_HEADER} is required`);
  if (!/^[1-9][0-9]*$/.test(raw.trim())) throw httpError(400, 'invalid_automation_revision_precondition', 'Expected Automation revision must be a positive integer');
  const revision = Number(raw.trim());
  if (!Number.isSafeInteger(revision)) throw httpError(400, 'invalid_automation_revision_precondition', 'Expected Automation revision is outside the supported range');
  return revision;
}
function requireJson(request: IncomingMessage): void { if (mediaType(request) !== 'application/json') throw httpError(415, 'unsupported_media_type', 'Automation mutations require application/json'); }
async function readJsonObject(request: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.byteLength; if (size > limit) throw httpError(413, 'body_too_large', 'Request body exceeds the configured limit'); chunks.push(value); }
  if (size === 0) throw httpError(400, 'invalid_json_body', 'JSON request body is required');
  let value: unknown; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw httpError(400, 'invalid_json_body', 'Request body is not valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'invalid_json_body', 'JSON request body must be an object');
  return value as Record<string, unknown>;
}
function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin'); if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Access-Control-Allow-Credentials', 'true'); response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', ['Content-Type','X-Correlation-Id',BROWSER_CSRF_HEADER,EXPECTED_AUTOMATION_REVISION_HEADER].join(', '));
  response.setHeader('Access-Control-Expose-Headers', ['X-Correlation-Id',BROWSER_CSRF_HEADER,AUTOMATION_REVISION_HEADER].join(', '));
  response.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS');
}
function decodePathSegment(value: string): string { try { return decodeURIComponent(value); } catch { throw httpError(400, 'invalid_path_encoding', 'Path segment is malformed'); } }
function mediaType(request: IncomingMessage): string { return String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase(); }
function header(request: IncomingMessage, name: string): string | undefined { const value = request.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value; }
function send(response: ServerResponse, status: number, body: unknown): void { response.statusCode = status; response.setHeader('Cache-Control', 'no-store'); if (body === undefined) { response.end(); return; } const bytes = Buffer.from(JSON.stringify(body)); response.setHeader('Content-Type', 'application/json'); response.setHeader('Content-Length', bytes.byteLength); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(bytes); }
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
