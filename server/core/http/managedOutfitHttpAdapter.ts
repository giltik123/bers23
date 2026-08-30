import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import { PostgresOutfitStore, type ManagedOutfit } from '../fashion/postgresOutfitStore.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/wardrobe/outfits';
const OUTFIT_REVISION_HEADER = 'X-Outfit-Revision';
const EXPECTED_OUTFIT_REVISION_HEADER = 'X-Expected-Outfit-Revision';
const MAX_JSON_BYTES = 32 * 1024;

type OutfitAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type AdapterInput = Readonly<{
  outfits: PostgresOutfitStore;
  auth: OutfitAuth;
  config: CoreServerConfig;
  accepting: () => boolean;
}>;

/** Narrow Outfit transport. Ordered/layered entries are server-owned aggregate state. */
export function createManagedOutfitHttpAdapter(input: AdapterInput) {
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
        send(response, 200, (await input.outfits.list(principal)).map(dto));
        return true;
      }

      if (url.pathname === PREFIX && request.method === 'POST') {
        requireJsonMediaType(request);
        const body = requireCreateBody(await readJsonObject(request, MAX_JSON_BYTES));
        sendOutfit(response, 201, await input.outfits.create(principal, body));
        return true;
      }

      const duplicateMatch = url.pathname.match(/^\/api\/core\/wardrobe\/outfits\/([^/]+)\/duplicate$/);
      if (duplicateMatch && request.method === 'POST') {
        requireJsonMediaType(request);
        const body = requireExactBody(await readJsonObject(request, MAX_JSON_BYTES), ['name'], 'invalid_outfit_duplicate');
        sendOutfit(response, 201, await input.outfits.duplicate(principal, decodePathSegment(duplicateMatch[1]), body.name));
        return true;
      }

      const lifecycleMatch = url.pathname.match(/^\/api\/core\/wardrobe\/outfits\/([^/]+)\/(archive|restore)$/);
      if (lifecycleMatch && request.method === 'POST') {
        const expectedRevision = requireRevisionHeader(request);
        const outfitId = decodePathSegment(lifecycleMatch[1]);
        const outfit = lifecycleMatch[2] === 'archive'
          ? await input.outfits.archive(principal, outfitId, expectedRevision)
          : await input.outfits.restore(principal, outfitId, expectedRevision);
        sendOutfit(response, 200, outfit);
        return true;
      }

      const reorderMatch = url.pathname.match(/^\/api\/core\/wardrobe\/outfits\/([^/]+)\/reorder$/);
      if (reorderMatch && request.method === 'POST') {
        requireJsonMediaType(request);
        const body = requireExactBody(await readJsonObject(request, MAX_JSON_BYTES), ['entry_ids'], 'invalid_outfit_reorder');
        sendOutfit(response, 200, await input.outfits.reorderEntries(
          principal,
          decodePathSegment(reorderMatch[1]),
          requireRevisionHeader(request),
          body.entry_ids,
        ));
        return true;
      }

      const entriesMatch = url.pathname.match(/^\/api\/core\/wardrobe\/outfits\/([^/]+)\/entries$/);
      if (entriesMatch && request.method === 'POST') {
        requireJsonMediaType(request);
        const record = await readJsonObject(request, MAX_JSON_BYTES);
        const keys = Object.keys(record);
        if (!Object.hasOwn(record, 'garment_id') || keys.some(key => key !== 'garment_id' && key !== 'layer_role')) {
          throw httpError(400, 'invalid_outfit_entry_create', 'Outfit entry create accepts garment_id and optional layer_role');
        }
        sendOutfit(response, 200, await input.outfits.addEntry(
          principal,
          decodePathSegment(entriesMatch[1]),
          requireRevisionHeader(request),
          Object.freeze({ garmentId: record.garment_id, ...(Object.hasOwn(record, 'layer_role') ? { layerRole: record.layer_role } : {}) }),
        ));
        return true;
      }

      const entryMatch = url.pathname.match(/^\/api\/core\/wardrobe\/outfits\/([^/]+)\/entries\/([^/]+)$/);
      if (entryMatch && request.method === 'DELETE') {
        sendOutfit(response, 200, await input.outfits.removeEntry(
          principal,
          decodePathSegment(entryMatch[1]),
          requireRevisionHeader(request),
          decodePathSegment(entryMatch[2]),
        ));
        return true;
      }

      if (entryMatch && request.method === 'PUT') {
        requireJsonMediaType(request);
        const record = await readJsonObject(request, MAX_JSON_BYTES);
        const keys = Object.keys(record);
        if (!Object.hasOwn(record, 'garment_id') || keys.some(key => key !== 'garment_id' && key !== 'layer_role')) {
          throw httpError(400, 'invalid_outfit_entry_replace', 'Outfit entry replace accepts garment_id and optional layer_role');
        }
        sendOutfit(response, 200, await input.outfits.replaceEntry(
          principal,
          decodePathSegment(entryMatch[1]),
          requireRevisionHeader(request),
          decodePathSegment(entryMatch[2]),
          Object.freeze({ garmentId: record.garment_id, ...(Object.hasOwn(record, 'layer_role') ? { layerRole: record.layer_role } : {}) }),
        ));
        return true;
      }

      if (entryMatch && request.method === 'PATCH') {
        requireJsonMediaType(request);
        const body = requireExactBody(await readJsonObject(request, MAX_JSON_BYTES), ['layer_role'], 'invalid_outfit_entry_role');
        sendOutfit(response, 200, await input.outfits.setEntryRole(
          principal,
          decodePathSegment(entryMatch[1]),
          requireRevisionHeader(request),
          decodePathSegment(entryMatch[2]),
          body.layer_role,
        ));
        return true;
      }

      const outfitMatch = url.pathname.match(/^\/api\/core\/wardrobe\/outfits\/([^/]+)$/);
      if (outfitMatch && request.method === 'GET') {
        const outfit = await input.outfits.get(principal, decodePathSegment(outfitMatch[1]));
        if (!outfit) throw httpError(404, 'outfit_not_found', 'Outfit not found');
        sendOutfit(response, 200, outfit);
        return true;
      }

      if (outfitMatch && request.method === 'PATCH') {
        requireJsonMediaType(request);
        sendOutfit(response, 200, await input.outfits.updateMetadata(
          principal,
          decodePathSegment(outfitMatch[1]),
          requireRevisionHeader(request),
          await readJsonObject(request, MAX_JSON_BYTES),
        ));
        return true;
      }

      if (outfitMatch && request.method === 'DELETE') {
        const revision = await input.outfits.delete(principal, decodePathSegment(outfitMatch[1]), requireRevisionHeader(request));
        response.setHeader(OUTFIT_REVISION_HEADER, String(revision));
        send(response, 204, undefined);
        return true;
      }

      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'outfit_request_error'),
        message: status === 500 ? 'Managed Outfit request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function sendOutfit(response: ServerResponse, status: number, outfit: ManagedOutfit): void {
  response.setHeader(OUTFIT_REVISION_HEADER, String(outfit.revision));
  send(response, status, dto(outfit));
}

function dto(outfit: ManagedOutfit) {
  return Object.freeze({
    id: outfit.id,
    name: outfit.name,
    style: outfit.style,
    season: outfit.season,
    occasion: outfit.occasion,
    favorite: outfit.favorite,
    status: outfit.status,
    revision: outfit.revision,
    reference_readiness: outfit.referenceReadiness,
    entries: outfit.entries.map(entry => Object.freeze({
      entry_id: entry.entryId,
      garment_id: entry.garmentId,
      position: entry.position,
      layer_role: entry.layerRole,
      ...(entry.garmentCategory ? { garment_category: entry.garmentCategory } : {}),
      reference_readiness: entry.referenceReadiness,
    })),
    created_at: outfit.createdAt,
    updated_at: outfit.updatedAt,
  });
}

function requireCreateBody(record: Record<string, unknown>) {
  const allowed = new Set(['name','style','season','occasion','favorite']);
  const keys = Object.keys(record);
  if (!Object.hasOwn(record, 'name') || keys.some(key => !allowed.has(key))) {
    throw httpError(400, 'invalid_outfit_create', 'Outfit create requires name and accepts only style, season, occasion and favorite metadata');
  }
  return Object.freeze({
    name: record.name,
    ...(Object.hasOwn(record, 'style') ? { style: record.style } : {}),
    ...(Object.hasOwn(record, 'season') ? { season: record.season } : {}),
    ...(Object.hasOwn(record, 'occasion') ? { occasion: record.occasion } : {}),
    ...(Object.hasOwn(record, 'favorite') ? { favorite: record.favorite } : {}),
  });
}

function requireExactBody(record: Record<string, unknown>, keys: readonly string[], code: string): Record<string, unknown> {
  const actual = Object.keys(record);
  if (actual.length !== keys.length || keys.some(key => !Object.hasOwn(record, key)) || actual.some(key => !keys.includes(key))) {
    throw httpError(400, code, `Request body must contain exactly: ${keys.join(', ')}`);
  }
  return record;
}

function requireRevisionHeader(request: IncomingMessage): number {
  const raw = header(request, EXPECTED_OUTFIT_REVISION_HEADER);
  if (!raw) throw httpError(428, 'outfit_revision_precondition_required', `${EXPECTED_OUTFIT_REVISION_HEADER} with the current Outfit revision is required`);
  if (!/^[1-9][0-9]*$/.test(raw.trim())) {
    throw httpError(400, 'invalid_outfit_revision_precondition', `${EXPECTED_OUTFIT_REVISION_HEADER} must contain one positive integer revision`);
  }
  const revision = Number(raw.trim());
  if (!Number.isSafeInteger(revision)) throw httpError(400, 'invalid_outfit_revision_precondition', 'Expected Outfit revision is outside the supported range');
  return revision;
}

function requireJsonMediaType(request: IncomingMessage): void {
  if (mediaType(request) !== 'application/json') throw httpError(415, 'unsupported_media_type', 'Outfit JSON mutations require application/json');
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
    'Content-Type','X-Correlation-Id',BROWSER_CSRF_HEADER,EXPECTED_OUTFIT_REVISION_HEADER,
  ].join(', '));
  response.setHeader('Access-Control-Expose-Headers', [
    'X-Correlation-Id',BROWSER_CSRF_HEADER,OUTFIT_REVISION_HEADER,
  ].join(', '));
  response.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, POST, PUT, DELETE, OPTIONS');
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
