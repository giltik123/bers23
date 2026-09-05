import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import {
  BODY_ANCHOR_COORDINATE_SPACE,
  BODY_ANCHOR_SCHEMA_ID,
} from '../fashion/bodyAnchorGeometry.ts';
import type {
  ManualProjectBodyAnchorAcquisitionResult,
  ManualProjectBodyAnchorAcquisitionService,
} from '../fashion/ManualProjectBodyAnchorAcquisitionService.ts';
import {
  BROWSER_CSRF_HEADER,
  assertBrowserMutationAllowed,
  requestAuthorization,
} from './browserSessionCookie.ts';

const PATH_PATTERN = /^\/api\/core\/fashion\/projects\/([^/]+)\/body-anchors$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BODY_KEYS = Object.freeze(['idempotencyKey', 'payload', 'sourceArtifactId'] as const);
const MAX_SOURCE_ARTIFACT_ID_LENGTH = 4096;

type BodyAnchorAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type AdapterInput = Readonly<{
  acquisition: Pick<ManualProjectBodyAnchorAcquisitionService, 'acquire'>;
  auth: BodyAnchorAuth;
  config: CoreServerConfig;
  accepting: () => boolean;
}>;

type RequestBody = Readonly<{
  sourceArtifactId: string;
  payload: unknown;
  idempotencyKey: string;
}>;

/** Capability-specific manual body-anchor acquisition transport. */
export function createManualProjectBodyAnchorHttpAdapter(input: AdapterInput) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    let url: URL;
    try {
      url = new URL(request.url ?? '/', 'http://core.invalid');
    } catch {
      return false;
    }
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
        throw httpError(405, 'method_not_allowed', 'Manual body-anchor acquisition requires POST');
      }
      assertBrowserMutationAllowed(request, input.config);
      requireJson(request);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      const projectId = decodePathSegment(match[1]);
      const body = exactBody(await readJson(request, input.config.bodyLimitBytes));
      const result = await input.acquisition.acquire(principal, Object.freeze({
        projectId,
        sourceArtifactId: body.sourceArtifactId,
        payload: body.payload,
        idempotencyKey: body.idempotencyKey,
      }));
      send(response, 201, publicResult(result, projectId, body.sourceArtifactId));
      return true;
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'manual_body_anchor_acquisition_error'),
        message: status === 500 ? 'Manual body-anchor acquisition request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function publicResult(
  value: ManualProjectBodyAnchorAcquisitionResult,
  requestedProjectId: string,
  requestedSourceArtifactId: string,
) {
  const anchorSet = value.anchorSet;
  const normalizedProjectId = requestedProjectId.toLowerCase();
  if (
    value.projectId !== normalizedProjectId
    || value.sourceArtifactId !== requestedSourceArtifactId
    || anchorSet.projectId !== normalizedProjectId
    || anchorSet.schemaId !== BODY_ANCHOR_SCHEMA_ID
    || anchorSet.coordinateSpace !== BODY_ANCHOR_COORDINATE_SPACE
  ) {
    throw new Error('Manual body-anchor acquisition returned evidence outside the public transport contract');
  }
  return Object.freeze({
    projectId: value.projectId,
    sourceArtifactId: value.sourceArtifactId,
    anchorSet: Object.freeze({
      schemaId: anchorSet.schemaId,
      coordinateSpace: anchorSet.coordinateSpace,
    }),
  });
}

function exactBody(value: unknown): RequestBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, 'invalid_manual_body_anchor_request', 'Manual body-anchor acquisition request must be a JSON object');
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...BODY_KEYS].sort();
  if (actual.length !== expected.length || expected.some((key, index) => actual[index] !== key)) {
    throw httpError(400, 'forbidden_client_authority', 'Manual body-anchor acquisition accepts source, explicit anchor payload and one opaque idempotency key only');
  }
  if (typeof record.sourceArtifactId !== 'string') {
    throw httpError(400, 'invalid_manual_body_anchor_request', 'sourceArtifactId is required');
  }
  const sourceArtifactId = record.sourceArtifactId.trim();
  if (
    !sourceArtifactId
    || sourceArtifactId.length > MAX_SOURCE_ARTIFACT_ID_LENGTH
    || /[\u0000-\u001f\u007f]/u.test(sourceArtifactId)
  ) {
    throw httpError(400, 'invalid_manual_body_anchor_request', 'sourceArtifactId is outside the accepted identifier contract');
  }
  if (typeof record.idempotencyKey !== 'string' || !UUID_PATTERN.test(record.idempotencyKey)) {
    throw httpError(400, 'invalid_manual_body_anchor_request', 'idempotencyKey must be a UUID');
  }
  return Object.freeze({
    sourceArtifactId,
    payload: record.payload,
    idempotencyKey: record.idempotencyKey.toLowerCase(),
  });
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
  catch { throw httpError(400, 'invalid_path_encoding', 'Project path segment is malformed'); }
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
  if (body === undefined) { response.end(); return; }
  const bytes = Buffer.from(JSON.stringify(body));
  response.setHeader('Content-Type', 'application/json');
  response.setHeader('Content-Length', bytes.byteLength);
  response.end(bytes);
}
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } {
  return Object.assign(new Error(message), { status, code });
}
