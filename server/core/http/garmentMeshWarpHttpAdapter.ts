import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type { LocalGarmentMeshWarpExecutionService } from '../localExecution/LocalGarmentMeshWarpExecutionService.ts';
import type { GarmentMeshWarpInputDeliveryService } from '../localExecution/GarmentMeshWarpInputDeliveryService.ts';
import { encodeGarmentMeshWarpInputEnvelope } from '../../../src/platform/creative/canonical/garmentMeshWarpInputEnvelope.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/local-execution/garment-mesh-warp/';
const PREPARE_KEYS = Object.freeze(['anchorSetId','clientRequestId','garmentId','projectId','representationId','sourceArtifactId'] as const);

type GarmentMeshWarpAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type AdapterInput = Readonly<{
  service: LocalGarmentMeshWarpExecutionService;
  inputDelivery: GarmentMeshWarpInputDeliveryService;
  auth: GarmentMeshWarpAuth;
  config: CoreServerConfig;
}>;

/**
 * Capability-specific F4b.4 transport.
 *
 * Browser prepare input is an exact intent-only allowlist. Managed Garment hashes,
 * basis view identity, destination mesh and every geometry/evidence SHA remain Core
 * authority and can enter the browser only through the purpose-bound input envelope.
 */
export function createGarmentMeshWarpHttpAdapter(input: AdapterInput) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (!url.pathname.startsWith(PREFIX)) return false;
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (request.method !== 'GET' && request.method !== 'HEAD') assertBrowserMutationAllowed(request, input.config);
      const principal = await input.auth.verify(requestAuthorization(request, input.config));

      if (url.pathname === `${PREFIX}prepare` && request.method === 'POST') {
        requireJson(request);
        const body = exactPrepare(await readJson(request, input.config.bodyLimitBytes));
        const prepared = await input.service.prepare({
          projectId: body.projectId,
          sourceArtifactId: body.sourceArtifactId,
          garmentId: body.garmentId,
          representationId: body.representationId,
          anchorSetId: body.anchorSetId,
          clientRequestId: body.clientRequestId,
        }, principal);
        send(response, 202, prepared); return true;
      }

      const inputMatch = url.pathname.match(/^\/api\/core\/local-execution\/garment-mesh-warp\/([^/]+)\/inputs$/);
      if (inputMatch && request.method === 'GET') {
        const delivered = await input.inputDelivery.deliver(decodeURIComponent(inputMatch[1]), requireProjectId(url), principal);
        const envelope = encodeGarmentMeshWarpInputEnvelope({
          metadata: {
            ticketId: delivered.ticketId,
            projectId: delivered.projectId,
            sourceArtifactId: delivered.sourceArtifactId,
            projectImageStorageId: delivered.projectImageStorageId,
            projectImageSha256: delivered.projectImageSha256,
            outputWidth: delivered.outputWidth,
            outputHeight: delivered.outputHeight,
            garmentId: delivered.garmentId,
            viewId: delivered.viewId,
            viewSha256: delivered.viewSha256,
            representationId: delivered.representationId,
            representationSha256: delivered.representationSha256,
            anchorSetId: delivered.anchorSetId,
            anchorPayloadSha256: delivered.anchorPayloadSha256,
            basisViewWidth: delivered.basisViewWidth,
            basisViewHeight: delivered.basisViewHeight,
            destinationMeshSha256: delivered.destinationMeshSha256,
            sourcePointsQ16: delivered.sourcePointsQ16,
            destinationPointsQ16: delivered.destinationPointsQ16,
            triangles: delivered.triangles,
          },
          basisViewRgba: delivered.basisViewRgba,
        });
        sendBytes(response, 200, envelope, 'application/octet-stream'); return true;
      }

      const uploadMatch = url.pathname.match(/^\/api\/core\/local-execution\/garment-mesh-warp\/([^/]+)\/image-upload$/);
      if (uploadMatch && request.method === 'POST') {
        if (mediaType(request) !== 'image/png') throw httpError(415, 'unsupported_media_type', 'Content-Type must be image/png');
        const bytes = await readBytes(request, input.config.imageUploadLimitBytes);
        const evidence = await input.service.uploadImage({ ticketId: decodeURIComponent(uploadMatch[1]), projectId: requireProjectId(url), bytes }, principal);
        if (!evidence.width || !evidence.height || evidence.width > input.config.imageMaxDimension || evidence.height > input.config.imageMaxDimension || evidence.width * evidence.height > input.config.imageMaxPixels) {
          throw httpError(400, 'invalid_image_dimensions', 'Garment mesh-warp image dimensions are invalid or unsafe');
        }
        send(response, 201, evidence); return true;
      }

      const resultMatch = url.pathname.match(/^\/api\/core\/local-execution\/garment-mesh-warp\/([^/]+)\/result$/);
      if (resultMatch && request.method === 'POST') {
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        assertExactKeys(body, ['projectId','result'], 'Garment mesh-warp result request schema is invalid');
        const projectId = string(body.projectId);
        if (!projectId) throw httpError(400, 'invalid_project_id', 'projectId is required');
        const finalized = await input.service.submit({ ticketId: decodeURIComponent(resultMatch[1]), projectId, result: body.result }, principal);
        const publicResult = finalized.status === 'SUCCESS'
          ? Object.freeze({ executionId: finalized.executionId, status: finalized.status, layerId: finalized.layerId, contentSha256: finalized.contentSha256, verification: Object.freeze({ valid: finalized.verification.valid }) })
          : Object.freeze({ executionId: finalized.executionId, status: finalized.status, verification: Object.freeze({ valid: finalized.verification.valid }) });
        send(response, finalized.status === 'SUCCESS' ? 200 : 422, publicResult); return true;
      }

      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, {
        error: error.code ?? (status === 500 ? 'internal_error' : 'local_execution_error'),
        message: status === 500 ? 'Local execution request failed' : error.message,
        correlationId,
      });
      return true;
    }
  };
}

type PrepareBody = Readonly<Record<(typeof PREPARE_KEYS)[number], string>>;
function exactPrepare(value: unknown): PrepareBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'invalid_garment_mesh_warp_request', 'Garment mesh-warp prepare request must be an object');
  const body = value as Record<string, unknown>;
  assertExactKeys(body, PREPARE_KEYS, 'Garment mesh-warp prepare accepts intent fields only');
  const result = Object.fromEntries(PREPARE_KEYS.map(key => [key, string(body[key])])) as Record<(typeof PREPARE_KEYS)[number], string>;
  if (PREPARE_KEYS.some(key => !result[key])) throw httpError(400, 'invalid_garment_mesh_warp_request', 'Garment mesh-warp prepare request is incomplete');
  return Object.freeze(result) as PrepareBody;
}
function assertExactKeys(record: Record<string, unknown>, expected: readonly string[], message: string): void {
  const actual = Object.keys(record).sort(); const wanted = [...expected].sort();
  if (actual.length !== wanted.length || wanted.some((key, index) => actual[index] !== key)) throw httpError(400, 'forbidden_client_authority', message);
}
function requireProjectId(url: URL): string { const projectId = url.searchParams.get('projectId')?.trim() ?? ''; if (!projectId) throw httpError(400, 'invalid_project_id', 'projectId is required'); return projectId; }
function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true'); response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Expose-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}
function requireJson(request: IncomingMessage): void { if (mediaType(request) !== 'application/json') throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/json'); }
function mediaType(request: IncomingMessage): string { return String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase(); }
function header(request: IncomingMessage, name: string): string | undefined { const value = request.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value; }
async function readJson(request: IncomingMessage, limit: number): Promise<unknown> { const bytes = await readBytes(request, limit); try { return JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { throw httpError(400, 'invalid_json', 'Invalid JSON body'); } }
async function readBytes(request: IncomingMessage, limit: number): Promise<Uint8Array> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.byteLength; if (size > limit) throw httpError(413, 'body_too_large', 'Request body exceeds the configured limit'); chunks.push(value); } return new Uint8Array(Buffer.concat(chunks)); }
function send(response: ServerResponse, status: number, body: unknown): void { response.statusCode = status; response.setHeader('Cache-Control', 'no-store'); if (body === undefined) { response.end(); return; } const bytes = Buffer.from(JSON.stringify(body)); response.setHeader('Content-Type', 'application/json'); response.setHeader('Content-Length', bytes.byteLength); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(bytes); }
function sendBytes(response: ServerResponse, status: number, bytes: Uint8Array, contentType: string): void { response.statusCode = status; response.setHeader('Content-Type', contentType); response.setHeader('Content-Length', bytes.byteLength); response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(Buffer.from(bytes)); }
function string(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
