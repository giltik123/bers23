import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import { PostgresGarmentWardrobeStore, type ManagedGarmentWardrobe } from '../fashion/postgresGarmentWardrobeStore.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/wardrobe/garments';
const GARMENT_REVISION_HEADER = 'X-Garment-Revision';
const EXPECTED_GARMENT_REVISION_HEADER = 'X-Expected-Garment-Revision';
const MAX_JSON_BYTES = 32 * 1024;

type WardrobeAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type AdapterInput = Readonly<{
  wardrobe: PostgresGarmentWardrobeStore;
  auth: WardrobeAuth;
  config: CoreServerConfig;
  accepting: () => boolean;
}>;

/** Typed Wardrobe transport over the canonical managed Garment identity. No generic CRUD dispatch. */
export function createManagedWardrobeHttpAdapter(input: AdapterInput) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (url.pathname !== PREFIX && !url.pathname.startsWith(`${PREFIX}/`)) return false;
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (!input.accepting()) throw httpError(503, 'shutting_down', 'Server is shutting down');
      if (request.method !== 'GET' && request.method !== 'HEAD') assertBrowserMutationAllowed(request, input.config);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));

      if (url.pathname === PREFIX && request.method === 'GET') {
        const garments = await input.wardrobe.list(principal);
        send(response, 200, garments.map(dto));
        return true;
      }

      const archiveMatch = url.pathname.match(/^\/api\/core\/wardrobe\/garments\/([^/]+)\/archive$/);
      if (archiveMatch && request.method === 'POST') {
        const expectedRevision = requireExpectedRevision(request);
        const garment = await input.wardrobe.archive(principal, decodePathSegment(archiveMatch[1]), expectedRevision);
        sendGarment(response, 200, garment);
        return true;
      }

      const restoreMatch = url.pathname.match(/^\/api\/core\/wardrobe\/garments\/([^/]+)\/restore$/);
      if (restoreMatch && request.method === 'POST') {
        const expectedRevision = requireExpectedRevision(request);
        const garment = await input.wardrobe.restore(principal, decodePathSegment(restoreMatch[1]), expectedRevision);
        sendGarment(response, 200, garment);
        return true;
      }

      const garmentMatch = url.pathname.match(/^\/api\/core\/wardrobe\/garments\/([^/]+)$/);
      if (garmentMatch && request.method === 'GET') {
        const garment = await input.wardrobe.get(principal, decodePathSegment(garmentMatch[1]));
        if (!garment) throw httpError(404, 'garment_not_found', 'Garment not found');
        sendGarment(response, 200, garment);
        return true;
      }

      if (garmentMatch && request.method === 'PATCH') {
        const expectedRevision = requireExpectedRevision(request);
        requireJsonMediaType(request);
        const patch = await readJsonObject(request, MAX_JSON_BYTES);
        const garment = await input.wardrobe.updateMetadata(
          principal,
          decodePathSegment(garmentMatch[1]),
          expectedRevision,
          patch,
        );
        sendGarment(response, 200, garment);
        return true;
      }

      if (garmentMatch && request.method === 'DELETE') {
        const expectedRevision = requireExpectedRevision(request);
        const revision = await input.wardrobe.delete(principal, decodePathSegment(garmentMatch[1]), expectedRevision);
        response.setHeader(GARMENT_REVISION_HEADER, String(revision));
        send(response, 204, undefined);
        return true;
      }

      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'wardrobe_request_error'),
        message: status === 500 ? 'Managed wardrobe request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function sendGarment(response: ServerResponse, status: number, garment: ManagedGarmentWardrobe): void {
  response.setHeader(GARMENT_REVISION_HEADER, String(garment.revision));
  send(response, status, dto(garment));
}

function dto(garment: ManagedGarmentWardrobe) {
  return Object.freeze({
    garment_id: garment.garmentId,
    name: garment.name,
    category: garment.category,
    category_group: garment.categoryGroup,
    season: garment.season,
    material: garment.material,
    tags: garment.tags,
    favorite: garment.favorite,
    status: garment.status,
    revision: garment.revision,
    updated_at: garment.updatedAt,
  });
}

function requireExpectedRevision(request: IncomingMessage): number {
  const raw = header(request, EXPECTED_GARMENT_REVISION_HEADER);
  if (!raw) {
    throw httpError(428, 'garment_revision_precondition_required', `${EXPECTED_GARMENT_REVISION_HEADER} with the current garment revision is required`);
  }
  if (!/^[1-9][0-9]*$/.test(raw.trim())) {
    throw httpError(400, 'invalid_garment_revision_precondition', `${EXPECTED_GARMENT_REVISION_HEADER} must contain one positive integer revision`);
  }
  const revision = Number(raw.trim());
  if (!Number.isSafeInteger(revision)) {
    throw httpError(400, 'invalid_garment_revision_precondition', 'Expected garment revision is outside the supported range');
  }
  return revision;
}

function requireJsonMediaType(request: IncomingMessage): void {
  if (mediaType(request) !== 'application/json') {
    throw httpError(415, 'unsupported_media_type', 'Wardrobe metadata mutations require application/json');
  }
}

async function readJsonObject(request: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const bytes = await readBytes(request, limit);
  if (bytes.byteLength === 0) throw httpError(400, 'invalid_json_body', 'JSON request body is required');
  let value: unknown;
  try { value = JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch { throw httpError(400, 'invalid_json_body', 'Request body is not valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw httpError(400, 'invalid_json_body', 'JSON request body must be an object');
  }
  return value as Record<string, unknown>;
}

function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, X-Correlation-Id, ${BROWSER_CSRF_HEADER}, ${EXPECTED_GARMENT_REVISION_HEADER}`);
  response.setHeader('Access-Control-Expose-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}, ${GARMENT_REVISION_HEADER}`);
  response.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, DELETE, OPTIONS');
}

function decodePathSegment(value: string): string {
  try { return decodeURIComponent(value); }
  catch { throw httpError(400, 'invalid_path_encoding', 'Path segment is malformed'); }
}
function mediaType(request: IncomingMessage): string {
  return String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase();
}
function header(request: IncomingMessage, name: string): string | undefined {
  const value = request.headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
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
