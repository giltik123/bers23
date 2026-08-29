import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import { PostgresGarmentCollectionStore, type ManagedGarmentCollection } from '../fashion/postgresGarmentCollectionStore.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/wardrobe/collections';
const COLLECTION_REVISION_HEADER = 'X-Collection-Revision';
const EXPECTED_COLLECTION_REVISION_HEADER = 'X-Expected-Collection-Revision';
const SOURCE_COLLECTION_REVISION_HEADER = 'X-Source-Collection-Revision';
const TARGET_COLLECTION_REVISION_HEADER = 'X-Target-Collection-Revision';
const EXPECTED_SOURCE_COLLECTION_REVISION_HEADER = 'X-Expected-Source-Collection-Revision';
const EXPECTED_TARGET_COLLECTION_REVISION_HEADER = 'X-Expected-Target-Collection-Revision';
const MAX_JSON_BYTES = 32 * 1024;

type CollectionAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type AdapterInput = Readonly<{
  collections: PostgresGarmentCollectionStore;
  auth: CollectionAuth;
  config: CoreServerConfig;
  accepting: () => boolean;
}>;

/** Narrow Collection transport. Membership is server-owned and never generic entity CRUD. */
export function createManagedGarmentCollectionHttpAdapter(input: AdapterInput) {
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
        const collections = await input.collections.list(principal);
        send(response, 200, collections.map(dto));
        return true;
      }

      if (url.pathname === PREFIX && request.method === 'POST') {
        requireJsonMediaType(request);
        const body = requireCreateBody(await readJsonObject(request, MAX_JSON_BYTES));
        const collection = await input.collections.create(principal, body);
        sendCollection(response, 201, collection);
        return true;
      }

      const moveMatch = url.pathname.match(/^\/api\/core\/wardrobe\/collections\/([^/]+)\/move\/([^/]+)\/garments\/([^/]+)$/);
      if (moveMatch && request.method === 'POST') {
        const moved = await input.collections.moveGarment(principal, {
          sourceCollectionId: decodePathSegment(moveMatch[1]),
          targetCollectionId: decodePathSegment(moveMatch[2]),
          garmentId: decodePathSegment(moveMatch[3]),
          expectedSourceRevision: requireRevisionHeader(request, EXPECTED_SOURCE_COLLECTION_REVISION_HEADER),
          expectedTargetRevision: requireRevisionHeader(request, EXPECTED_TARGET_COLLECTION_REVISION_HEADER),
        });
        response.setHeader(SOURCE_COLLECTION_REVISION_HEADER, String(moved.source.revision));
        response.setHeader(TARGET_COLLECTION_REVISION_HEADER, String(moved.target.revision));
        send(response, 200, Object.freeze({
          source: dto(moved.source),
          target: dto(moved.target),
          target_changed: moved.targetChanged,
        }));
        return true;
      }

      const membershipMatch = url.pathname.match(/^\/api\/core\/wardrobe\/collections\/([^/]+)\/garments\/([^/]+)$/);
      if (membershipMatch && (request.method === 'POST' || request.method === 'DELETE')) {
        const collectionId = decodePathSegment(membershipMatch[1]);
        const garmentId = decodePathSegment(membershipMatch[2]);
        const expectedRevision = requireRevisionHeader(request, EXPECTED_COLLECTION_REVISION_HEADER);
        const collection = request.method === 'POST'
          ? await input.collections.addGarment(principal, collectionId, expectedRevision, garmentId)
          : await input.collections.removeGarment(principal, collectionId, expectedRevision, garmentId);
        sendCollection(response, 200, collection);
        return true;
      }

      const collectionMatch = url.pathname.match(/^\/api\/core\/wardrobe\/collections\/([^/]+)$/);
      if (collectionMatch && request.method === 'GET') {
        const collection = await input.collections.get(principal, decodePathSegment(collectionMatch[1]));
        if (!collection) throw httpError(404, 'collection_not_found', 'Collection not found');
        sendCollection(response, 200, collection);
        return true;
      }

      if (collectionMatch && request.method === 'PATCH') {
        const expectedRevision = requireRevisionHeader(request, EXPECTED_COLLECTION_REVISION_HEADER);
        requireJsonMediaType(request);
        const patch = await readJsonObject(request, MAX_JSON_BYTES);
        const collection = await input.collections.updateMetadata(
          principal,
          decodePathSegment(collectionMatch[1]),
          expectedRevision,
          patch,
        );
        sendCollection(response, 200, collection);
        return true;
      }

      if (collectionMatch && request.method === 'DELETE') {
        const expectedRevision = requireRevisionHeader(request, EXPECTED_COLLECTION_REVISION_HEADER);
        const revision = await input.collections.delete(principal, decodePathSegment(collectionMatch[1]), expectedRevision);
        response.setHeader(COLLECTION_REVISION_HEADER, String(revision));
        send(response, 204, undefined);
        return true;
      }

      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'collection_request_error'),
        message: status === 500 ? 'Managed collection request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function sendCollection(response: ServerResponse, status: number, collection: ManagedGarmentCollection): void {
  response.setHeader(COLLECTION_REVISION_HEADER, String(collection.revision));
  send(response, status, dto(collection));
}

function dto(collection: ManagedGarmentCollection) {
  return Object.freeze({
    id: collection.id,
    name: collection.name,
    description: collection.description,
    revision: collection.revision,
    garment_ids: collection.garmentIds,
    created_at: collection.createdAt,
    updated_at: collection.updatedAt,
  });
}

function requireCreateBody(record: Record<string, unknown>): Readonly<{ name: unknown; description?: unknown }> {
  const keys = Object.keys(record);
  if (!Object.hasOwn(record, 'name') || keys.some(key => key !== 'name' && key !== 'description')) {
    throw httpError(400, 'invalid_collection_create', 'Collection create accepts only name and optional description');
  }
  return Object.freeze({ name: record.name, ...(Object.hasOwn(record, 'description') ? { description: record.description } : {}) });
}

function requireRevisionHeader(request: IncomingMessage, name: string): number {
  const raw = header(request, name);
  if (!raw) throw httpError(428, 'collection_revision_precondition_required', `${name} with the current collection revision is required`);
  if (!/^[1-9][0-9]*$/.test(raw.trim())) {
    throw httpError(400, 'invalid_collection_revision_precondition', `${name} must contain one positive integer revision`);
  }
  const revision = Number(raw.trim());
  if (!Number.isSafeInteger(revision)) throw httpError(400, 'invalid_collection_revision_precondition', 'Expected collection revision is outside the supported range');
  return revision;
}

function requireJsonMediaType(request: IncomingMessage): void {
  if (mediaType(request) !== 'application/json') throw httpError(415, 'unsupported_media_type', 'Collection JSON mutations require application/json');
}

async function readJsonObject(request: IncomingMessage, limit: number): Promise<Record<string, unknown>> {
  const bytes = await readBytes(request, limit);
  if (bytes.byteLength === 0) throw httpError(400, 'invalid_json_body', 'JSON request body is required');
  let value: unknown;
  try { value = JSON.parse(Buffer.from(bytes).toString('utf8')); }
  catch { throw httpError(400, 'invalid_json_body', 'Request body is not valid JSON'); }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'invalid_json_body', 'JSON request body must be an object');
  return value as Record<string, unknown>;
}

function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', [
    'Content-Type',
    'X-Correlation-Id',
    BROWSER_CSRF_HEADER,
    EXPECTED_COLLECTION_REVISION_HEADER,
    EXPECTED_SOURCE_COLLECTION_REVISION_HEADER,
    EXPECTED_TARGET_COLLECTION_REVISION_HEADER,
  ].join(', '));
  response.setHeader('Access-Control-Expose-Headers', [
    'X-Correlation-Id',
    BROWSER_CSRF_HEADER,
    COLLECTION_REVISION_HEADER,
    SOURCE_COLLECTION_REVISION_HEADER,
    TARGET_COLLECTION_REVISION_HEADER,
  ].join(', '));
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
