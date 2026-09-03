import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type { FashionTryOnProductService } from '../fashion/FashionTryOnProductService.ts';
import {
  BROWSER_CSRF_HEADER,
  assertBrowserMutationAllowed,
  requestAuthorization,
} from './browserSessionCookie.ts';

const ROOT = '/api/core/fashion/try-on';
const INTENT_KEYS = Object.freeze(['clientRequestId', 'garmentId', 'projectId', 'sourceArtifactId'] as const);
const LATENCY_HEADER = 'x-bers-local-latency-ms';
const WARP_INPUT = /^\/api\/core\/fashion\/try-on\/warp\/([^/]+)\/input$/;
const WARP_CANDIDATE = /^\/api\/core\/fashion\/try-on\/warp\/([^/]+)\/candidate$/;
const TEXTURE_INPUT = /^\/api\/core\/fashion\/try-on\/texture\/([^/]+)\/input$/;
const TEXTURE_CANDIDATE = /^\/api\/core\/fashion\/try-on\/texture\/([^/]+)\/candidate$/;

type ProductSurface = Pick<FashionTryOnProductService,
  | 'prepare'
  | 'continue'
  | 'loadGarmentWarpInput'
  | 'submitGarmentWarpCandidate'
  | 'loadTextureCompositeInput'
  | 'submitTextureCompositeCandidate'
  | 'result'
>;

type FashionTryOnProductAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

export type FashionTryOnProductHttpAdapterInput = Readonly<{
  product: ProductSurface;
  auth: FashionTryOnProductAuth;
  config: CoreServerConfig;
}>;

type IntentBody = Readonly<Record<(typeof INTENT_KEYS)[number], string>>;

/**
 * Closed browser transport for the deterministic Try-On product facade.
 *
 * Stable intent is accepted only by prepare/continue/result. Execution routes
 * accept one opaque ticket handle plus authenticated projectId and never accept
 * representation/anchor/layer/storage/SHA or LocalExecutionResult metadata.
 *
 * The ticket handle is not authorization: every delegated Core service reloads
 * durable ticket scope and purpose. Phase-specific URLs add a transport-level
 * substitution guard on top of the concrete ticket contract checks.
 *
 * This adapter is intentionally independent of server registration. Adding this
 * file alone does not activate product Try-On or disable legacy low-level routes.
 */
export function createFashionTryOnProductHttpAdapter(input: FashionTryOnProductHttpAdapterInput) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (url.pathname === `${ROOT}/readiness`) return false;
    if (!url.pathname.startsWith(`${ROOT}/`)) return false;
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);

    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') {
        send(response, 204, undefined);
        return true;
      }
      if (request.method !== 'GET' && request.method !== 'HEAD') assertBrowserMutationAllowed(request, input.config);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));

      if (url.pathname === `${ROOT}/prepare` && request.method === 'POST') {
        requireJson(request);
        const result = await input.product.prepare(exactIntent(await readJson(request, input.config.bodyLimitBytes)), principal);
        send(response, 200, result);
        return true;
      }

      if (url.pathname === `${ROOT}/continue` && request.method === 'POST') {
        requireJson(request);
        const result = await input.product.continue(exactIntent(await readJson(request, input.config.bodyLimitBytes)), principal);
        send(response, 200, result);
        return true;
      }

      if (url.pathname === `${ROOT}/result` && request.method === 'POST') {
        requireJson(request);
        const result = await input.product.result(exactIntent(await readJson(request, input.config.bodyLimitBytes)), principal);
        send(response, 200, result);
        return true;
      }

      const warpInput = url.pathname.match(WARP_INPUT);
      if (warpInput && request.method === 'GET') {
        const bytes = await input.product.loadGarmentWarpInput(Object.freeze({
          ticketId: decodeHandle(warpInput[1]),
          projectId: requireProjectId(url),
        }), principal);
        sendBytes(response, 200, bytes);
        return true;
      }

      const textureInput = url.pathname.match(TEXTURE_INPUT);
      if (textureInput && request.method === 'GET') {
        const bytes = await input.product.loadTextureCompositeInput(Object.freeze({
          ticketId: decodeHandle(textureInput[1]),
          projectId: requireProjectId(url),
        }), principal);
        sendBytes(response, 200, bytes);
        return true;
      }

      const warpCandidate = url.pathname.match(WARP_CANDIDATE);
      if (warpCandidate && request.method === 'POST') {
        requirePng(request);
        const result = await input.product.submitGarmentWarpCandidate(Object.freeze({
          ticketId: decodeHandle(warpCandidate[1]),
          projectId: requireProjectId(url),
          bytes: await readBytes(request, input.config.imageUploadLimitBytes),
          latencyMs: requireLatencyMs(request),
        }), principal);
        send(response, 200, result);
        return true;
      }

      const textureCandidate = url.pathname.match(TEXTURE_CANDIDATE);
      if (textureCandidate && request.method === 'POST') {
        requirePng(request);
        const result = await input.product.submitTextureCompositeCandidate(Object.freeze({
          ticketId: decodeHandle(textureCandidate[1]),
          projectId: requireProjectId(url),
          bytes: await readBytes(request, input.config.imageUploadLimitBytes),
          latencyMs: requireLatencyMs(request),
        }), principal);
        send(response, 200, result);
        return true;
      }

      throw httpError(404, 'not_found', 'Fashion Try-On product route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'fashion_tryon_product_error'),
        message: status === 500 ? 'Fashion Try-On product request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function exactIntent(value: unknown): IntentBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, 'invalid_fashion_tryon_intent', 'Fashion Try-On intent must be a JSON object');
  }
  const record = value as Record<string, unknown>;
  assertExactKeys(record, INTENT_KEYS);
  const result = Object.fromEntries(INTENT_KEYS.map(key => [key, normalizedString(record[key])])) as Record<(typeof INTENT_KEYS)[number], string>;
  if (INTENT_KEYS.some(key => !result[key])) throw httpError(400, 'invalid_fashion_tryon_intent', 'Fashion Try-On intent is incomplete');
  return Object.freeze(result) as IntentBody;
}

function assertExactKeys(record: Record<string, unknown>, expected: readonly string[]): void {
  const actual = Object.keys(record).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || wanted.some((key, index) => actual[index] !== key)) {
    throw httpError(400, 'forbidden_client_authority', 'Fashion Try-On product accepts only stable intent fields');
  }
}

function requireProjectId(url: URL): string {
  const values = url.searchParams.getAll('projectId');
  if (values.length !== 1 || !values[0]?.trim()) throw httpError(400, 'invalid_project_id', 'Exactly one projectId is required');
  for (const key of url.searchParams.keys()) if (key !== 'projectId') throw httpError(400, 'forbidden_client_authority', 'Fashion Try-On execution lookup accepts projectId only');
  return values[0].trim();
}

function requireLatencyMs(request: IncomingMessage): number {
  const raw = header(request, LATENCY_HEADER)?.trim() ?? '';
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(raw)) throw httpError(400, 'invalid_fashion_tryon_latency', 'X-Bers-Local-Latency-Ms must be a finite non-negative number');
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 86_400_000) throw httpError(400, 'invalid_fashion_tryon_latency', 'X-Bers-Local-Latency-Ms is outside the accepted range');
  return value;
}

function decodeHandle(value: string): string {
  try { return decodeURIComponent(value); }
  catch { throw httpError(400, 'invalid_fashion_tryon_handle', 'Fashion Try-On execution handle is malformed'); }
}

function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, X-Correlation-Id, ${BROWSER_CSRF_HEADER}, X-Bers-Local-Latency-Ms`);
  response.setHeader('Access-Control-Expose-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function requireJson(request: IncomingMessage): void {
  if (mediaType(request) !== 'application/json') throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/json');
}
function requirePng(request: IncomingMessage): void {
  if (mediaType(request) !== 'image/png') throw httpError(415, 'unsupported_media_type', 'Content-Type must be image/png');
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
  return Uint8Array.from(Buffer.concat(chunks));
}
function send(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status;
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (body === undefined) { response.end(); return; }
  const bytes = Buffer.from(JSON.stringify(body));
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Content-Length', bytes.byteLength);
  response.end(bytes);
}
function sendBytes(response: ServerResponse, status: number, bytes: Uint8Array): void {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/octet-stream');
  response.setHeader('Content-Length', bytes.byteLength);
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.end(Buffer.from(bytes));
}
function normalizedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
