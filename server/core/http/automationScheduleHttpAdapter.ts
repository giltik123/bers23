import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type { AutomationSchedule, PostgresAutomationScheduleStore } from '../automation/PostgresAutomationScheduleStore.ts';
import { authenticatedOwnerScope } from './authenticatedPrincipalScope.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

export const AUTOMATION_SCHEDULE_PATH = '/api/core/automation-schedules';
const SCHEDULE_REVISION_HEADER = 'X-Automation-Schedule-Revision';
const EXPECTED_SCHEDULE_REVISION_HEADER = 'X-Expected-Automation-Schedule-Revision';
const MAX_JSON_BYTES = 16 * 1024;

type SchedulePort = Pick<PostgresAutomationScheduleStore, 'create' | 'list' | 'get' | 'update' | 'pause' | 'resume' | 'archive'>;
type AdapterInput = Readonly<{
  schedules: SchedulePort;
  auth: Readonly<{ verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal> }>;
  config: CoreServerConfig;
  accepting: () => boolean;
}>;

/** Browser transport owns schedule configuration only. Lease, occurrence, invocation and execution fields are never accepted. */
export function createAutomationScheduleHttpAdapter(input: AdapterInput) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (url.pathname !== AUTOMATION_SCHEDULE_PATH && !url.pathname.startsWith(`${AUTOMATION_SCHEDULE_PATH}/`)) return false;
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (!input.accepting()) throw httpError(503, 'shutting_down', 'Server is shutting down');
      if (request.method !== 'GET' && request.method !== 'HEAD') assertBrowserMutationAllowed(request, input.config);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      const scope = authenticatedOwnerScope(principal);

      if (url.pathname === AUTOMATION_SCHEDULE_PATH && request.method === 'GET') {
        send(response, 200, (await input.schedules.list(scope)).map(dto)); return true;
      }
      if (url.pathname === AUTOMATION_SCHEDULE_PATH && request.method === 'POST') {
        requireJson(request);
        sendSchedule(response, 201, await input.schedules.create(scope, transportCreate(await readJsonObject(request, MAX_JSON_BYTES))));
        return true;
      }

      const lifecycle = url.pathname.match(/^\/api\/core\/automation-schedules\/([^/]+)\/(pause|resume|archive)$/);
      if (lifecycle && request.method === 'POST') {
        const id = decodePathSegment(lifecycle[1]);
        const revision = requireRevisionHeader(request);
        const schedule = lifecycle[2] === 'pause'
          ? await input.schedules.pause(scope, id, revision)
          : lifecycle[2] === 'resume'
            ? await input.schedules.resume(scope, id, revision)
            : await input.schedules.archive(scope, id, revision);
        sendSchedule(response, 200, schedule); return true;
      }

      const match = url.pathname.match(/^\/api\/core\/automation-schedules\/([^/]+)$/);
      if (match && request.method === 'GET') {
        const schedule = await input.schedules.get(scope, decodePathSegment(match[1]));
        if (!schedule) throw httpError(404, 'automation_schedule_not_found', 'Automation schedule not found');
        sendSchedule(response, 200, schedule); return true;
      }
      if (match && request.method === 'PATCH') {
        requireJson(request);
        sendSchedule(response, 200, await input.schedules.update(
          scope,
          decodePathSegment(match[1]),
          requireRevisionHeader(request),
          transportUpdate(await readJsonObject(request, MAX_JSON_BYTES)),
        ));
        return true;
      }
      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'automation_schedule_request_error'),
        message: status === 500 ? 'Automation schedule request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function transportCreate(record: Record<string, unknown>) {
  exactKeys(record, ['automation_id','definition_revision','project_id','interval_seconds'], ['automation_id','definition_revision','project_id','interval_seconds'], 'invalid_automation_schedule_create');
  return Object.freeze({
    automationId: record.automation_id,
    definitionRevision: record.definition_revision,
    projectId: record.project_id,
    intervalSeconds: record.interval_seconds,
  });
}
function transportUpdate(record: Record<string, unknown>) {
  exactKeys(record, ['interval_seconds'], ['interval_seconds'], 'invalid_automation_schedule_update');
  return Object.freeze({ intervalSeconds: record.interval_seconds });
}
function exactKeys(record: Record<string, unknown>, allowed: readonly string[], required: readonly string[], code: string): void {
  const keys = Object.keys(record);
  if (keys.some(key => !allowed.includes(key)) || required.some(key => !Object.hasOwn(record, key))) throw httpError(400, code, `Request accepts only: ${allowed.join(', ')}`);
}
function dto(schedule: AutomationSchedule) {
  return Object.freeze({
    id: schedule.scheduleId,
    automation_id: schedule.automationId,
    definition_revision: schedule.definitionRevision,
    project_id: schedule.projectId,
    interval_seconds: schedule.intervalSeconds,
    next_fire_at: schedule.nextFireAt,
    status: schedule.status,
    revision: schedule.revision,
    overlap_policy: schedule.overlapPolicy,
    missed_run_policy: schedule.missedRunPolicy,
    created_at: schedule.createdAt,
    updated_at: schedule.updatedAt,
  });
}
function sendSchedule(response: ServerResponse, status: number, schedule: AutomationSchedule): void {
  response.setHeader(SCHEDULE_REVISION_HEADER, String(schedule.revision));
  send(response, status, dto(schedule));
}
function requireRevisionHeader(request: IncomingMessage): number {
  const raw = header(request, EXPECTED_SCHEDULE_REVISION_HEADER);
  if (!raw) throw httpError(428, 'automation_schedule_revision_precondition_required', `${EXPECTED_SCHEDULE_REVISION_HEADER} is required`);
  if (!/^[1-9][0-9]*$/.test(raw.trim())) throw httpError(400, 'invalid_automation_schedule_revision_precondition', 'Expected schedule revision must be a positive integer');
  const revision = Number(raw.trim());
  if (!Number.isSafeInteger(revision)) throw httpError(400, 'invalid_automation_schedule_revision_precondition', 'Expected schedule revision is outside the supported range');
  return revision;
}
function requireJson(request: IncomingMessage): void {
  if (mediaType(request) !== 'application/json') throw httpError(415, 'unsupported_media_type', 'Automation schedule mutations require application/json');
}
async function readJsonObject(request: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of request) {
    const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += value.byteLength;
    if (size > limit) throw httpError(413, 'body_too_large', 'Request body exceeds the configured limit');
    chunks.push(value);
  }
  if (size === 0) throw httpError(400, 'invalid_json_body', 'JSON request body is required');
  let value: unknown;
  try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw httpError(400, 'invalid_json_body', 'Request body is not valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'invalid_json_body', 'JSON request body must be an object');
  return value as Record<string, unknown>;
}
function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin'); if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', ['Content-Type','X-Correlation-Id',BROWSER_CSRF_HEADER,EXPECTED_SCHEDULE_REVISION_HEADER].join(', '));
  response.setHeader('Access-Control-Expose-Headers', ['X-Correlation-Id',BROWSER_CSRF_HEADER,SCHEDULE_REVISION_HEADER].join(', '));
  response.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, OPTIONS');
}
function decodePathSegment(value: string): string { try { return decodeURIComponent(value); } catch { throw httpError(400, 'invalid_path_encoding', 'Path segment is malformed'); } }
function mediaType(request: IncomingMessage): string { return String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase(); }
function header(request: IncomingMessage, name: string): string | undefined { const value = request.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value; }
function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Cache-Control', 'no-store');
  if (body === undefined) { response.end(); return; }
  const bytes = Buffer.from(JSON.stringify(body));
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Content-Length', bytes.byteLength);
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(bytes);
}
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
