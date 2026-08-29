import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import { assessManagedGarmentCapture } from '../fashion/garmentCaptureAssessment.ts';
import { GarmentDeliveryAuthority } from '../fashion/garmentDeliveryAuthority.ts';
import { GARMENT_VIEW_KINDS, PostgresGarmentStore, type GarmentViewKind, type ManagedGarment } from '../fashion/postgresGarmentStore.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/garments';

type GarmentAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type AdapterInput = Readonly<{
  garments: PostgresGarmentStore;
  delivery: GarmentDeliveryAuthority;
  auth: GarmentAuth;
  config: CoreServerConfig;
  accepting: () => boolean;
  now?: () => number;
}>;

/** Narrow Fashion transport. It cannot dispatch generic entities, Projects, providers or Billing. */
export function createManagedGarmentHttpAdapter(input: AdapterInput) {
  const now = input.now ?? Date.now;
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
        const garments = await input.garments.list(principal);
        send(response, 200, garments.map((garment) => dto(garment, input.delivery, principal, now()))); return true;
      }

      if (url.pathname === PREFIX && request.method === 'POST') {
        const contentType = requireImageMediaType(request);
        const name = (url.searchParams.get('name') ?? '').trim();
        const viewKind = requireViewKind(url.searchParams.get('view'));
        const bytes = await readBytes(request, input.config.imageUploadLimitBytes);
        const garment = await input.garments.createWithInitialView(principal, {
          name,
          viewKind,
          sourceContentType: contentType,
          bytes,
        }, imageLimits(input.config));
        sendGarment(response, 201, garment, input.delivery, principal, now()); return true;
      }

      const viewCollectionMatch = url.pathname.match(/^\/api\/core\/garments\/([^/]+)\/views$/);
      if (viewCollectionMatch && request.method === 'POST') {
        const expectedRevision = requireExpectedRevision(request);
        const contentType = requireImageMediaType(request);
        const viewKind = requireViewKind(url.searchParams.get('view'));
        const bytes = await readBytes(request, input.config.imageUploadLimitBytes);
        const garment = await input.garments.appendView(
          principal,
          decodePathSegment(viewCollectionMatch[1]),
          expectedRevision,
          { viewKind, sourceContentType: contentType, bytes },
          imageLimits(input.config),
        );
        sendGarment(response, 201, garment, input.delivery, principal, now()); return true;
      }

      const deliveryMatch = url.pathname.match(/^\/api\/core\/garments\/delivery\/([^/]+)$/);
      if (deliveryMatch && (request.method === 'GET' || request.method === 'HEAD')) {
        const claim = input.delivery.resolve(decodePathSegment(deliveryMatch[1]), principal);
        const view = await input.garments.loadView(principal, claim.garmentId, claim.viewId);
        if (!view) throw httpError(404, 'garment_view_not_found', 'Garment view is unavailable');
        response.statusCode = 200;
        response.setHeader('Content-Type', view.contentType);
        response.setHeader('Content-Length', view.bytes.byteLength);
        response.setHeader('Cache-Control', 'no-store');
        response.setHeader('ETag', `"sha256-${view.contentSha256}"`);
        response.setHeader('X-Content-Type-Options', 'nosniff');
        if (request.method === 'HEAD') response.end(); else response.end(Buffer.from(view.bytes));
        return true;
      }

      const garmentMatch = url.pathname.match(/^\/api\/core\/garments\/([^/]+)$/);
      if (garmentMatch && request.method === 'GET') {
        const garment = await input.garments.get(principal, decodePathSegment(garmentMatch[1]));
        if (!garment) throw httpError(404, 'garment_not_found', 'Garment not found');
        sendGarment(response, 200, garment, input.delivery, principal, now()); return true;
      }

      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'garment_request_error'),
        message: status === 500 ? 'Managed garment request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

function sendGarment(
  response: ServerResponse,
  status: number,
  garment: ManagedGarment,
  delivery: GarmentDeliveryAuthority,
  principal: AuthenticatedPrincipal,
  now: number,
): void {
  response.setHeader('ETag', garmentEtag(garment.revision));
  send(response, status, dto(garment, delivery, principal, now));
}

function dto(garment: ManagedGarment, delivery: GarmentDeliveryAuthority, principal: AuthenticatedPrincipal, now: number) {
  const expiresAt = now + 5 * 60_000;
  const assessment = assessManagedGarmentCapture(garment);
  return Object.freeze({
    id: garment.id,
    name: garment.name,
    representation_tier: garment.representationTier,
    status: garment.status,
    revision: garment.revision,
    primary_view_id: garment.primaryViewId,
    capture_assessment: Object.freeze({
      cardinal_complete: assessment.cardinalComplete,
      cardinal_coverage_score: assessment.cardinalCoverageScore,
      present_cardinal_view_kinds: assessment.presentCardinalViewKinds,
      missing_cardinal_view_kinds: assessment.missingCardinalViewKinds,
      detail_view_count: assessment.detailViewCount,
      unspecified_view_count: assessment.unspecifiedViewCount,
      technical_resolution: Object.freeze({
        status: assessment.technicalResolution.status,
        minimum_best_cardinal_short_edge_px: assessment.technicalResolution.minimumBestCardinalShortEdgePx,
        threshold_short_edge_px: assessment.technicalResolution.thresholdShortEdgePx,
        low_resolution_cardinal_view_kinds: assessment.technicalResolution.lowResolutionCardinalViewKinds,
        low_resolution_view_ids: assessment.technicalResolution.lowResolutionViewIds,
      }),
      semantic_quality: assessment.semanticQuality,
      next_capture_requests: assessment.nextCaptureRequests.map((request) => Object.freeze({
        view_kind: request.viewKind,
        reason: request.reason,
      })),
    }),
    views: garment.views.map((view) => Object.freeze({
      id: view.id,
      ordinal: view.ordinal,
      kind: view.kind,
      width: view.width,
      height: view.height,
      encoding: view.encoding,
      content_type: view.contentType,
      content_sha256: view.contentSha256,
      storage_provenance: view.storageBackend,
      delivery_url: `${PREFIX}/delivery/${encodeURIComponent(delivery.issue(principal, garment.id, view.id, expiresAt))}`,
      delivery_expires_at: new Date(expiresAt).toISOString(),
      created_at: view.createdAt,
    })),
    created_at: garment.createdAt,
    updated_at: garment.updatedAt,
  });
}

function imageLimits(config: CoreServerConfig) {
  return {
    maxUploadBytes: config.imageUploadLimitBytes,
    maxDimension: config.imageMaxDimension,
    maxPixels: config.imageMaxPixels,
  };
}

function requireViewKind(raw: string | null): GarmentViewKind {
  const value = (raw ?? 'UNSPECIFIED').trim().toUpperCase();
  if (!(GARMENT_VIEW_KINDS as readonly string[]).includes(value)) {
    throw httpError(400, 'invalid_garment_view_kind', 'Garment view kind is unsupported');
  }
  return value as GarmentViewKind;
}

function requireImageMediaType(request: IncomingMessage): 'image/png' | 'image/jpeg' | 'image/webp' {
  const contentType = mediaType(request);
  if (contentType !== 'image/png' && contentType !== 'image/jpeg' && contentType !== 'image/webp') {
    throw httpError(415, 'unsupported_media_type', 'Supported garment images are PNG, JPEG and WebP');
  }
  return contentType;
}

function requireExpectedRevision(request: IncomingMessage): number {
  const raw = header(request, 'if-match');
  if (!raw) {
    throw httpError(428, 'garment_revision_precondition_required', 'If-Match with the current garment revision is required');
  }
  const match = /^"garment-revision-([1-9][0-9]*)"$/.exec(raw.trim());
  if (!match) {
    throw httpError(400, 'invalid_garment_revision_precondition', 'If-Match must be a single managed garment revision ETag');
  }
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision)) {
    throw httpError(400, 'invalid_garment_revision_precondition', 'If-Match garment revision is outside the supported range');
  }
  return revision;
}

function garmentEtag(revision: number): string { return `"garment-revision-${revision}"`; }

function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true');
  response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, X-Correlation-Id, ${BROWSER_CSRF_HEADER}, If-Match`);
  response.setHeader('Access-Control-Expose-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}, ETag`);
  response.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
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
