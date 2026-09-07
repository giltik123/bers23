import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type { ExecutionRun, ExecutionRunRegistry, ExecutionRunScope } from '../execution/executionRunRegistry.ts';
import type { LocalExecutionAuthorityObservation } from '../localExecution/LocalExecutionLedger.ts';
import { BROWSER_CSRF_HEADER, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/execution-runs';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DEFAULT_ROOT_LIMIT = 50;
const DEFAULT_CHILD_LIMIT = 100;
const MAX_LIMIT = 100;
const RESULT_PATH = /^\/api\/core\/artifacts\/results\/[^/?#\s]+$/;
const LOCAL_AUTHORITY_STATES = new Set(['ACTIVE', 'EXPIRED', 'FINALIZED_SUCCESS', 'FINALIZED_FAILED', 'FINALIZED_UNKNOWN']);

type ExecutionRunRecoveryReader = Pick<ExecutionRunRegistry, 'get' | 'listRoots' | 'listChildren'>;
export type ExecutionRunFinalResultDescriptor = Readonly<{
  kind: 'FINAL_IMAGE';
  artifactId: string;
  imageUrl: string;
  width: number;
  height: number;
}>;
export type ExecutionRunResultReader = Readonly<{
  resolveCreativeFinal(scope: ExecutionRunScope, executionId: string): Promise<ExecutionRunFinalResultDescriptor | undefined>;
}>;
export type ExecutionRunLocalAuthorityReader = Readonly<{
  observeLocalExecution(scope: ExecutionRunScope, ticketId: string): Promise<LocalExecutionAuthorityObservation | undefined>;
}>;
type RecoveryAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

/**
 * Authenticated observation-only transport for durable canonical ExecutionRuns.
 * Registry, Artifact-result and Local-ticket dependencies are intentionally narrowed
 * so HTTP recovery cannot mutate or dispatch execution state. FINAL descriptors and
 * Local authority observations project existing owner truth; neither rewrites the
 * canonical ExecutionRun lifecycle.
 */
export function createExecutionRunRecoveryHttpAdapter(input: Readonly<{
  runs: ExecutionRunRecoveryReader;
  results: ExecutionRunResultReader;
  localExecution: ExecutionRunLocalAuthorityReader;
  auth: RecoveryAuth;
  config: CoreServerConfig;
}>) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;

    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    response.setHeader('Cache-Control', 'no-store');

    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (request.method !== 'GET') throw httpError(405, 'method_not_allowed', 'Execution run recovery is read-only');

      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      const projectId = requiredProjectId(url);
      const scope = recoveryScope(principal, projectId);

      if (url.pathname === PREFIX) {
        rejectUnexpectedQuery(url, new Set(['projectId', 'limit']));
        const limit = readLimit(url, DEFAULT_ROOT_LIMIT);
        const runs = await input.runs.listRoots(scope, limit);
        send(response, 200, Object.freeze({ runs: Object.freeze(await Promise.all(runs.map(run => publicRun(run, scope, input.results, input.localExecution)))) }));
        return true;
      }

      const childrenMatch = url.pathname.match(/^\/api\/core\/execution-runs\/([^/]+)\/children$/);
      if (childrenMatch) {
        rejectUnexpectedQuery(url, new Set(['projectId', 'limit']));
        const runId = runIdFromPath(childrenMatch[1]);
        const parent = await input.runs.get(scope, runId);
        if (!parent) throw httpError(404, 'execution_run_not_found', 'Execution run is unavailable in this scope');
        const limit = readLimit(url, DEFAULT_CHILD_LIMIT);
        const children = await input.runs.listChildren(scope, runId, limit);
        send(response, 200, Object.freeze({
          parent: await publicRun(parent, scope, input.results, input.localExecution),
          runs: Object.freeze(await Promise.all(children.map(run => publicRun(run, scope, input.results, input.localExecution)))),
        }));
        return true;
      }

      const runMatch = url.pathname.match(/^\/api\/core\/execution-runs\/([^/]+)$/);
      if (runMatch) {
        rejectUnexpectedQuery(url, new Set(['projectId']));
        const runId = runIdFromPath(runMatch[1]);
        const run = await input.runs.get(scope, runId);
        if (!run) throw httpError(404, 'execution_run_not_found', 'Execution run is unavailable in this scope');
        send(response, 200, await publicRun(run, scope, input.results, input.localExecution));
        return true;
      }

      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'execution_run_recovery_error'),
        message: status === 500 ? 'Execution run recovery request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

async function publicRun(
  run: ExecutionRun,
  scope: ExecutionRunScope,
  results: ExecutionRunResultReader,
  localExecution: ExecutionRunLocalAuthorityReader,
) {
  const result = run.status === 'SUCCEEDED'
    && run.capability === 'CREATIVE_EXECUTION'
    && run.authorityKind === 'CREATIVE_EXECUTION'
    ? await results.resolveCreativeFinal(scope, run.authorityRef)
    : undefined;
  const localAuthority = run.capability === 'LOCAL_EXECUTION'
    && run.authorityKind === 'LOCAL_EXECUTION_TICKET'
    ? await localExecution.observeLocalExecution(scope, run.authorityRef)
    : undefined;
  return Object.freeze({
    runId: run.runId,
    capability: run.capability,
    authorityKind: run.authorityKind,
    authorityRef: run.authorityRef,
    ...(run.parentRunId ? { parentRunId: run.parentRunId } : {}),
    status: run.status,
    revision: run.revision,
    ...(run.statusReasonCode ? { statusReasonCode: run.statusReasonCode } : {}),
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    ...(run.startedAt ? { startedAt: run.startedAt } : {}),
    ...(run.finishedAt ? { finishedAt: run.finishedAt } : {}),
    ...(result ? { result: publicResult(result) } : {}),
    ...(localAuthority ? { localExecution: publicLocalAuthority(localAuthority) } : {}),
  });
}

function publicResult(value: ExecutionRunFinalResultDescriptor): ExecutionRunFinalResultDescriptor {
  if (!value || value.kind !== 'FINAL_IMAGE') throw new Error('Execution run result reader returned an unsupported result kind');
  const artifactId = boundedPublicText(value.artifactId, 'artifactId', 8192);
  const imageUrl = boundedPublicText(value.imageUrl, 'imageUrl', 8192);
  if (!RESULT_PATH.test(imageUrl)) throw new Error('Execution run result reader returned an invalid result delivery URL');
  const width = positiveSafeInteger(value.width, 'width');
  const height = positiveSafeInteger(value.height, 'height');
  return Object.freeze({ kind: 'FINAL_IMAGE', artifactId, imageUrl, width, height });
}

function publicLocalAuthority(value: LocalExecutionAuthorityObservation): LocalExecutionAuthorityObservation {
  if (!value || value.kind !== 'LOCAL_EXECUTION_TICKET') throw new Error('Execution run Local authority reader returned an unsupported kind');
  if (!LOCAL_AUTHORITY_STATES.has(value.state)) throw new Error('Execution run Local authority reader returned an unsupported state');
  if (value.cancellation !== 'UNSUPPORTED') throw new Error('Execution run Local authority reader attempted to grant cancellation authority');
  const expiresAt = canonicalPublicTimestamp(value.expiresAt, 'localExecution.expiresAt');
  return Object.freeze({ kind: 'LOCAL_EXECUTION_TICKET', state: value.state, expiresAt, cancellation: 'UNSUPPORTED' });
}

function requiredProjectId(url: URL): string {
  const values = url.searchParams.getAll('projectId');
  if (values.length !== 1) throw httpError(400, 'invalid_project_id', 'Exactly one projectId is required');
  return canonicalUuid(values[0], 'invalid_project_id', 'projectId');
}

function runIdFromPath(value: string): string {
  let decoded: string;
  try { decoded = decodeURIComponent(value); }
  catch { throw httpError(400, 'invalid_run_id', 'runId must be a UUID'); }
  return canonicalUuid(decoded, 'invalid_run_id', 'runId');
}

function readLimit(url: URL, fallback: number): number {
  const values = url.searchParams.getAll('limit');
  if (values.length === 0) return fallback;
  if (values.length !== 1 || !/^[1-9][0-9]{0,2}$/.test(values[0])) throw httpError(400, 'invalid_limit', `limit must be an integer from 1 to ${MAX_LIMIT}`);
  const limit = Number(values[0]);
  if (!Number.isSafeInteger(limit) || limit > MAX_LIMIT) throw httpError(400, 'invalid_limit', `limit must be an integer from 1 to ${MAX_LIMIT}`);
  return limit;
}

function rejectUnexpectedQuery(url: URL, allowed: ReadonlySet<string>): void {
  for (const key of url.searchParams.keys()) {
    if (!allowed.has(key)) throw httpError(400, 'unexpected_query_parameter', `Query parameter ${key} is not accepted by execution run recovery`);
  }
}

function recoveryScope(principal: AuthenticatedPrincipal, projectId: string): ExecutionRunScope {
  return Object.freeze({ tenantId: principal.tenantId, userId: principal.userId, projectId });
}

function canonicalUuid(value: unknown, code: string, label: string): string {
  if (typeof value !== 'string') throw httpError(400, code, `${label} must be a UUID`);
  const normalized = value.normalize('NFKC').trim().toLowerCase();
  if (!UUID.test(normalized)) throw httpError(400, code, `${label} must be a UUID`);
  return normalized;
}

function boundedPublicText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new Error(`Execution run result ${label} must be text`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new Error(`Execution run result ${label} is invalid`);
  return normalized;
}

function canonicalPublicTimestamp(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`Execution run ${label} must be a timestamp`);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`Execution run ${label} must be a timestamp`);
  const canonical = date.toISOString();
  if (canonical !== value) throw new Error(`Execution run ${label} must be canonical ISO time`);
  return canonical;
}

function positiveSafeInteger(value: unknown, label: string): number {
  const numeric = Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 1) throw new Error(`Execution run result ${label} must be a positive integer`);
  return numeric;
}

function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Expose-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
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

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
