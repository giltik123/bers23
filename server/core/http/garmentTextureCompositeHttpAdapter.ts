import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type { LocalGarmentTextureCompositeExecutionService } from '../localExecution/LocalGarmentTextureCompositeExecutionService.ts';
import type { GarmentTextureCompositeInputDeliveryService } from '../localExecution/GarmentTextureCompositeInputDeliveryService.ts';
import { encodeGarmentTextureCompositeInputEnvelope } from '../../../src/platform/creative/canonical/garmentTextureCompositeInputEnvelope.ts';
import type { GarmentTextureTransformQ16 } from '../../../src/platform/creative/deterministic/GarmentTextureCompositeParameters.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/local-execution/garment-texture-composite/';
const PREPARE_KEYS = Object.freeze(['clientRequestId','featherRadius','garmentWarpLayerId','garmentWarpLayerSha256','projectId','sourceArtifactId','textureTransform'] as const);
const TRANSFORM_KEYS = Object.freeze(['alphaPolicy','offsetXQ16','offsetYQ16','scaleXQ16','scaleYQ16','wrapMode'] as const);

type GarmentTextureCompositeAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type AdapterInput = Readonly<{
  service: LocalGarmentTextureCompositeExecutionService;
  inputDelivery: GarmentTextureCompositeInputDeliveryService;
  auth: GarmentTextureCompositeAuth;
  config: CoreServerConfig;
}>;

type PrepareBody = Readonly<{
  projectId: string;
  sourceArtifactId: string;
  garmentWarpLayerId: string;
  garmentWarpLayerSha256: string;
  textureTransform: GarmentTextureTransformQ16;
  featherRadius: number;
  clientRequestId: string;
}>;

/**
 * Capability-specific F4b.5b browser transport.
 *
 * Prepare accepts only user intent plus immutable F4b.4 layer identity. Garment,
 * view, representation, anchor, mesh and Project storage hashes are never accepted
 * from the browser; they can leave Core only inside the purpose-bound BERSGTC1
 * envelope after current authority has been revalidated.
 *
 * This module grants no reachability by itself. Production server registration is
 * a separate admission decision and remains absent while F4b.5b is NOT_ADMITTED.
 */
export function createGarmentTextureCompositeHttpAdapter(input: AdapterInput) {
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
        const prepared = await input.service.prepare(body, principal);
        send(response, 202, prepared); return true;
      }

      const inputMatch = url.pathname.match(/^\/api\/core\/local-execution\/garment-texture-composite\/([^/]+)\/inputs$/);
      if (inputMatch && request.method === 'GET') {
        const delivered = await input.inputDelivery.deliver(decodeURIComponent(inputMatch[1]), requireProjectId(url), principal);
        const envelope = encodeGarmentTextureCompositeInputEnvelope({
          metadata: {
            ticketId: delivered.ticketId,
            projectId: delivered.projectId,
            sourceArtifactId: delivered.sourceArtifactId,
            projectImageStorageId: delivered.projectImageStorageId,
            projectImageSha256: delivered.projectImageSha256,
            garmentWarpLayerId: delivered.garmentWarpLayerId,
            garmentWarpLayerSha256: delivered.garmentWarpLayerSha256,
            garmentId: delivered.garmentId,
            viewId: delivered.viewId,
            viewSha256: delivered.viewSha256,
            representationId: delivered.representationId,
            representationSha256: delivered.representationSha256,
            anchorSetId: delivered.anchorSetId,
            anchorPayloadSha256: delivered.anchorPayloadSha256,
            destinationMeshSha256: delivered.destinationMeshSha256,
            outputWidth: delivered.outputWidth,
            outputHeight: delivered.outputHeight,
            garmentSourceWidth: delivered.garmentSourceWidth,
            garmentSourceHeight: delivered.garmentSourceHeight,
            sourcePointsQ16: delivered.sourcePointsQ16,
            destinationPointsQ16: delivered.destinationPointsQ16,
            triangles: delivered.triangles,
            producerParameters: delivered.producerParameters,
            producerParametersSha256: delivered.producerParametersSha256,
          },
          projectRgba: delivered.projectRgba,
          garmentSourceRgba: delivered.garmentSourceRgba,
        });
        sendBytes(response, 200, envelope, 'application/octet-stream'); return true;
      }

      const uploadMatch = url.pathname.match(/^\/api\/core\/local-execution\/garment-texture-composite\/([^/]+)\/image-upload$/);
      if (uploadMatch && request.method === 'POST') {
        if (mediaType(request) !== 'image/png') throw httpError(415, 'unsupported_media_type', 'Content-Type must be image/png');
        const bytes = await readBytes(request, input.config.imageUploadLimitBytes);
        const evidence = await input.service.uploadImage({ ticketId: decodeURIComponent(uploadMatch[1]), projectId: requireProjectId(url), bytes }, principal);
        if (!evidence.width || !evidence.height || evidence.width > input.config.imageMaxDimension || evidence.height > input.config.imageMaxDimension || evidence.width * evidence.height > input.config.imageMaxPixels) {
          throw httpError(400, 'invalid_image_dimensions', 'Garment texture-composite image dimensions are invalid or unsafe');
        }
        send(response, 201, evidence); return true;
      }

      const resultMatch = url.pathname.match(/^\/api\/core\/local-execution\/garment-texture-composite\/([^/]+)\/result$/);
      if (resultMatch && request.method === 'POST') {
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        assertExactKeys(body, ['projectId','result'], 'Garment texture-composite result request schema is invalid');
        const projectId = string(body.projectId);
        if (!projectId) throw httpError(400, 'invalid_project_id', 'projectId is required');
        const finalized = await input.service.submit({ ticketId: decodeURIComponent(resultMatch[1]), projectId, result: body.result }, principal);
        const publicResult = Object.freeze({
          executionId: finalized.executionId,
          status: finalized.status,
          ...(finalized.artifactId ? { artifactId: finalized.artifactId } : {}),
          verification: Object.freeze({ valid: finalized.verification.valid }),
        });
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

function exactPrepare(value: unknown): PrepareBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'invalid_garment_texture_composite_request', 'Garment texture-composite prepare request must be an object');
  const body = value as Record<string, unknown>;
  assertExactKeys(body, PREPARE_KEYS, 'Garment texture-composite prepare accepts intent and immutable layer identity only');
  const transform = exactTextureTransform(body.textureTransform);
  const projectId = string(body.projectId);
  const sourceArtifactId = string(body.sourceArtifactId);
  const garmentWarpLayerId = string(body.garmentWarpLayerId);
  const garmentWarpLayerSha256 = string(body.garmentWarpLayerSha256);
  const clientRequestId = string(body.clientRequestId);
  const featherRadius = number(body.featherRadius);
  if (!projectId || !sourceArtifactId || !garmentWarpLayerId || !garmentWarpLayerSha256 || !clientRequestId || featherRadius === undefined) {
    throw httpError(400, 'invalid_garment_texture_composite_request', 'Garment texture-composite prepare request is incomplete');
  }
  return Object.freeze({ projectId, sourceArtifactId, garmentWarpLayerId, garmentWarpLayerSha256, textureTransform: transform, featherRadius, clientRequestId });
}

function exactTextureTransform(value: unknown): GarmentTextureTransformQ16 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw httpError(400, 'invalid_garment_texture_composite_request', 'textureTransform must be a closed object');
  const transform = value as Record<string, unknown>;
  assertExactKeys(transform, TRANSFORM_KEYS, 'Garment texture-composite textureTransform schema is invalid');
  const scaleXQ16 = number(transform.scaleXQ16);
  const scaleYQ16 = number(transform.scaleYQ16);
  const offsetXQ16 = number(transform.offsetXQ16);
  const offsetYQ16 = number(transform.offsetYQ16);
  if (scaleXQ16 === undefined || scaleYQ16 === undefined || offsetXQ16 === undefined || offsetYQ16 === undefined || typeof transform.wrapMode !== 'string' || typeof transform.alphaPolicy !== 'string') {
    throw httpError(400, 'invalid_garment_texture_composite_request', 'textureTransform values are invalid');
  }
  return Object.freeze({
    scaleXQ16,
    scaleYQ16,
    offsetXQ16,
    offsetYQ16,
    wrapMode: transform.wrapMode,
    alphaPolicy: transform.alphaPolicy,
  }) as GarmentTextureTransformQ16;
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
function number(value: unknown): number | undefined { return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined; }
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
