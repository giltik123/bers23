import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type {
  ManualParametricGarmentAdmissionResult,
  ManualParametricGarmentAdmissionService,
} from '../fashion/ManualParametricGarmentAdmissionService.ts';
import {
  BROWSER_CSRF_HEADER,
  assertBrowserMutationAllowed,
  requestAuthorization,
} from './browserSessionCookie.ts';

const PATH_PATTERN = /^\/api\/core\/fashion\/garments\/([^/]+)\/parametric-representation$/;
const BODY_KEYS = Object.freeze(['contour', 'expectedRevision'] as const);

type AdmissionAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type AdapterInput = Readonly<{
  admission: Pick<ManualParametricGarmentAdmissionService, 'admit'>;
  auth: AdmissionAuth;
  config: CoreServerConfig;
  accepting: () => boolean;
}>;

type AdmissionRequestBody = Readonly<{
  expectedRevision: number;
  contour: unknown;
}>;

/**
 * Capability-specific browser transport for manual PARAMETRIC Garment admission.
 *
 * Browser authority is intentionally limited to stable Garment intent, an
 * optimistic Garment revision and an explicit contour document. Source views,
 * hashes, representation identity and generator/validator provenance are all
 * resolved or minted by Core behind ManualParametricGarmentAdmissionService.
 *
 * This adapter owns no provider/Billing/cloud/Try-On execution authority and
 * cannot persist representations except through the existing admission service.
 */
export function createManualParametricGarmentAdmissionHttpAdapter(input: AdapterInput) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    const match = PATH_PATTERN.exec(url.pathname);
    if (!match) return false;
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') {
        send(response, 204, undefined);
        return true;
      }
      if (!input.accepting()) throw httpError(503, 'shutting_down', 'Server is shutting down');
      if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST, OPTIONS');
        throw httpError(405, 'method_not_allowed', 'Manual PARAMETRIC admission requires POST');
      }
      assertBrowserMutationAllowed(request, input.config);
      requireJson(request);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      const garmentId = decodePathSegment(match[1]);
      const body = exactBody(await readJson(request, input.config.bodyLimitBytes));
      const result = await input.admission.admit(principal, Object.freeze({
        garmentId,
        expectedRevision: body.expectedRevision,
        contour: body.contour,
      }));
      send(response, result.replayed ? 200 : 201, publicAdmission(result, garmentId));
      return true;
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'manual_parametric_admission_error'),
        message: status === 500 ? 'Manual PARAMETRIC admission request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function publicAdmission(value: ManualParametricGarmentAdmissionResult, requestedGarmentId: string) {
  const representation = value.representation;
  if (
    representation.garmentId !== requestedGarmentId.toLowerCase()
    || representation.tier !== 'PARAMETRIC'
    || representation.format !== 'BERS_PARAMETRIC_V1'
    || representation.admissionState !== 'ADMITTED'
  ) throw new Error('Manual PARAMETRIC admission returned evidence outside the public transport contract');
  return Object.freeze({
    garmentId: representation.garmentId,
    garmentRevision: value.garmentRevision,
    representationTier: value.representationTier,
    representation: Object.freeze({
      id: representation.id,
      tier: representation.tier,
      format: representation.format,
      admissionState: representation.admissionState,
    }),
    replayed: value.replayed,
  });
}

function exactBody(value: unknown): AdmissionRequestBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, 'invalid_manual_parametric_admission_request', 'Manual PARAMETRIC admission request must be a JSON object');
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...BODY_KEYS].sort();
  if (actual.length !== expected.length || expected.some((key, index) => actual[index] !== key)) {
    throw httpError(400, 'forbidden_client_authority', 'Manual PARAMETRIC admission accepts revision and contour intent only');
  }
  if (!Number.isSafeInteger(record.expectedRevision) || Number(record.expectedRevision) < 1) {
    throw httpError(400, 'invalid_garment_revision', 'Expected Garment revision must be a positive safe integer');
  }
  return Object.freeze({ expectedRevision: Number(record.expectedRevision), contour: record.contour });
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

function decodePathSegment(value: string): string {
  try { return decodeURIComponent(value); }
  catch { throw httpError(400, 'invalid_path_encoding', 'Garment path segment is malformed'); }
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

function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
