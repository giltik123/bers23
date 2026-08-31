import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type {
  FashionTryOnReadiness,
  FashionTryOnReadinessService,
} from '../fashion/FashionTryOnReadinessService.ts';
import {
  BROWSER_CSRF_HEADER,
  assertBrowserMutationAllowed,
  requestAuthorization,
} from './browserSessionCookie.ts';

const PATH = '/api/core/fashion/try-on/readiness';
const BODY_KEYS = Object.freeze(['garmentId', 'projectId', 'sourceArtifactId'] as const);

type FashionTryOnReadinessAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type AdapterInput = Readonly<{
  readiness: Pick<FashionTryOnReadinessService, 'check'>;
  auth: FashionTryOnReadinessAuth;
  config: CoreServerConfig;
}>;

type RequestBody = Readonly<Record<(typeof BODY_KEYS)[number], string>>;

/**
 * Read-only F4b.6 readiness transport.
 *
 * POST is deliberate: sourceArtifactId can be a signed Core identifier and must
 * not be placed in query strings, browser history or routine URL logs. The
 * adapter calls only the public `check()` projection, then applies a second
 * explicit public DTO projection so future internal evidence fields cannot leak.
 *
 * This endpoint issues no local-execution ticket, persists no FINAL, mutates no
 * Project and owns no provider/Billing/cloud authority.
 */
export function createFashionTryOnReadinessHttpAdapter(input: AdapterInput) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (url.pathname !== PATH) return false;
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') {
        send(response, 204, undefined);
        return true;
      }
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST, OPTIONS');
        throw httpError(405, 'method_not_allowed', 'Fashion Try-On readiness requires POST');
      }
      assertBrowserMutationAllowed(request, input.config);
      requireJson(request);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      const body = exactBody(await readJson(request, input.config.bodyLimitBytes));
      const readiness = await input.readiness.check(body, principal);
      send(response, 200, publicReadiness(readiness));
      return true;
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'fashion_tryon_readiness_error'),
        message: status === 500 ? 'Fashion Try-On readiness request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function publicReadiness(value: FashionTryOnReadiness) {
  return Object.freeze({
    status: value.status,
    projectId: value.projectId,
    sourceArtifactId: value.sourceArtifactId,
    garmentId: value.garmentId,
    ...(value.categoryGroup ? { categoryGroup: value.categoryGroup } : {}),
  });
}

function exactBody(value: unknown): RequestBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, 'invalid_fashion_tryon_readiness_request', 'Fashion Try-On readiness request must be a JSON object');
  }
  const record = value as Record<string, unknown>;
  assertExactKeys(record, BODY_KEYS);
  const projectId = string(record.projectId);
  const sourceArtifactId = string(record.sourceArtifactId);
  const garmentId = string(record.garmentId);
  if (!projectId || !sourceArtifactId || !garmentId) {
    throw httpError(400, 'invalid_fashion_tryon_readiness_request', 'Fashion Try-On readiness request is incomplete');
  }
  return Object.freeze({ projectId, sourceArtifactId, garmentId });
}

function assertExactKeys(record: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || wanted.some((key, index) => actual[index] !== key)) {
    throw httpError(400, 'forbidden_client_authority', 'Fashion Try-On readiness accepts intent fields only');
  }
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
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}

function requireJson(request: IncomingMessage): void {
  if (mediaType(request) !== 'application/json') throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
}

function mediaType(request: IncomingMessage): string {
  return String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
}

function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

async function readJson(request: IncomingMessage, limit: number): Promise<unknown> {
  const bytes = await readBytes(request, limit);
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'));
  } catch {
    throw httpError(400, 'invalid_json', 'Invalid JSON body');
  }
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
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (body === undefined) {
    response.end();
    return;
  }
  const bytes = Buffer.from(JSON.stringify(body));
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Content-Length', bytes.byteLength);
  response.end(bytes);
}

function string(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
