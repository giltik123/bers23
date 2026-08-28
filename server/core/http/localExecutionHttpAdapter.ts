import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { CoreServerConfig } from '../config.ts';
import type { LocalCropExecutionService } from '../localExecution/LocalCropExecutionService.ts';
import type { LocalDeterministicImageExecutionService } from '../localExecution/LocalDeterministicImageExecutionService.ts';
import type { LocalExecutionInputDeliveryService } from '../localExecution/LocalExecutionInputDeliveryService.ts';
import type { LocalResizeExecutionService } from '../localExecution/LocalResizeExecutionService.ts';
import type { LocalSegmentationExecutionService } from '../localExecution/LocalSegmentationExecutionService.ts';
import type { LocalSuperResolutionExecutionService } from '../localExecution/LocalSuperResolutionExecutionService.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PREFIX = '/api/core/local-execution/';
const INPUT_WIDTH_HEADER = 'X-Bers-Local-Input-Width';
const INPUT_HEIGHT_HEADER = 'X-Bers-Local-Input-Height';
const SOURCE_SHA_HEADER = 'X-Bers-Local-Source-Sha256';
const MASK_SHA_HEADER = 'X-Bers-Local-Mask-Sha256';

type LocalExecutionAuth = Readonly<{
  verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal>;
}>;

type AdapterInput = Readonly<{
  service: LocalSegmentationExecutionService;
  deterministicImages?: LocalDeterministicImageExecutionService;
  crop?: LocalCropExecutionService;
  resize?: LocalResizeExecutionService;
  superResolution?: LocalSuperResolutionExecutionService;
  inputDelivery?: LocalExecutionInputDeliveryService;
  auth: LocalExecutionAuth;
  config: CoreServerConfig;
}>;

/** One authenticated transport boundary with capability-specific application services. */
export function createLocalExecutionHttpAdapter(input: AdapterInput) {
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

      if (url.pathname === `${PREFIX}segment/prepare` && request.method === 'POST') {
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        const prepared = await input.service.prepare({
          projectId: string(body.projectId),
          inputArtifactId: string(body.inputArtifactId),
          clientRequestId: string(body.clientRequestId),
          analysis: record(body.analysis) as never,
          points: (Array.isArray(body.points) ? body.points : []) as never,
        }, principal);
        send(response, 202, prepared); return true;
      }

      if (url.pathname === `${PREFIX}background-isolation/prepare` && request.method === 'POST') {
        const service = requireDeterministicImages(input.deterministicImages);
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        const prepared = await service.prepareBackgroundIsolation({
          projectId: string(body.projectId),
          sourceArtifactId: string(body.sourceArtifactId),
          maskArtifactId: string(body.maskArtifactId),
          clientRequestId: string(body.clientRequestId),
        }, principal);
        send(response, 202, prepared); return true;
      }

      if (url.pathname === `${PREFIX}crop/prepare` && request.method === 'POST') {
        const service = requireCrop(input.crop);
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        const prepared = await service.prepare({
          projectId: string(body.projectId),
          sourceArtifactId: string(body.sourceArtifactId),
          clientRequestId: string(body.clientRequestId),
          x: number(body.x), y: number(body.y), width: number(body.width), height: number(body.height),
        }, principal);
        send(response, 202, prepared); return true;
      }

      if (url.pathname === `${PREFIX}resize/prepare` && request.method === 'POST') {
        const service = requireResize(input.resize);
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        const prepared = await service.prepare({
          projectId: string(body.projectId),
          sourceArtifactId: string(body.sourceArtifactId),
          clientRequestId: string(body.clientRequestId),
          width: number(body.width), height: number(body.height),
        }, principal);
        send(response, 202, prepared); return true;
      }

      if (url.pathname === `${PREFIX}super-resolution/prepare` && request.method === 'POST') {
        const service = requireSuperResolution(input.superResolution);
        requireJson(request);
        const body = await readJson(request, input.config.bodyLimitBytes) as Record<string, unknown>;
        const prepared = await service.prepare({ projectId: string(body.projectId), sourceArtifactId: string(body.sourceArtifactId), clientRequestId: string(body.clientRequestId) }, principal);
        send(response, 202, prepared); return true;
      }

      const deterministicInputMatch = url.pathname.match(/^\/api\/core\/local-execution\/background-isolation\/([^/]+)\/inputs$/);
      if (deterministicInputMatch && request.method === 'GET') {
        const delivery = requireInputDelivery(input.inputDelivery);
        const projectId = requireProjectId(url);
        const canonical = await delivery.backgroundIsolation({ ticketId: decodeURIComponent(deterministicInputMatch[1]), projectId }, principal);
        const expectedBytes = canonical.width * canonical.height * 5;
        if (canonical.sourceRgba.byteLength + canonical.maskAlpha.byteLength !== expectedBytes) throw httpError(500, 'local_input_delivery_contract', 'Canonical local input delivery length is invalid');
        const bytes = new Uint8Array(expectedBytes);
        bytes.set(canonical.sourceRgba, 0); bytes.set(canonical.maskAlpha, canonical.sourceRgba.byteLength);
        setInputHeaders(response, canonical.width, canonical.height, canonical.sourceSha256, canonical.maskSha256);
        sendBytes(response, 200, bytes, 'application/octet-stream'); return true;
      }

      const cropInputMatch = url.pathname.match(/^\/api\/core\/local-execution\/crop\/([^/]+)\/inputs$/);
      if (cropInputMatch && request.method === 'GET') {
        const delivery = requireInputDelivery(input.inputDelivery);
        const projectId = requireProjectId(url);
        const canonical = await delivery.crop({ ticketId: decodeURIComponent(cropInputMatch[1]), projectId }, principal);
        assertSourceDelivery(canonical, 'Crop');
        setInputHeaders(response, canonical.width, canonical.height, canonical.sourceSha256);
        sendBytes(response, 200, canonical.sourceRgba, 'application/octet-stream'); return true;
      }

      const resizeInputMatch = url.pathname.match(/^\/api\/core\/local-execution\/resize\/([^/]+)\/inputs$/);
      if (resizeInputMatch && request.method === 'GET') {
        const delivery = requireInputDelivery(input.inputDelivery);
        const projectId = requireProjectId(url);
        const canonical = await delivery.resize({ ticketId: decodeURIComponent(resizeInputMatch[1]), projectId }, principal);
        assertSourceDelivery(canonical, 'Resize');
        setInputHeaders(response, canonical.width, canonical.height, canonical.sourceSha256);
        sendBytes(response, 200, canonical.sourceRgba, 'application/octet-stream'); return true;
      }

      const superResolutionInputMatch = url.pathname.match(/^\/api\/core\/local-execution\/super-resolution\/([^/]+)\/inputs$/);
      if (superResolutionInputMatch && request.method === 'GET') {
        const delivery = requireInputDelivery(input.inputDelivery);
        const projectId = requireProjectId(url);
        const canonical = await delivery.superResolution({ ticketId: decodeURIComponent(superResolutionInputMatch[1]), projectId }, principal);
        assertSourceDelivery(canonical, 'super-resolution');
        setInputHeaders(response, canonical.width, canonical.height, canonical.sourceSha256);
        sendBytes(response, 200, canonical.sourceRgba, 'application/octet-stream'); return true;
      }

      const deterministicUploadMatch = url.pathname.match(/^\/api\/core\/local-execution\/background-isolation\/([^/]+)\/image-upload$/);
      if (deterministicUploadMatch && request.method === 'POST') {
        const service = requireDeterministicImages(input.deterministicImages);
        const projectId = requirePngUpload(request, url);
        const bytes = await readBytes(request, input.config.imageUploadLimitBytes);
        const evidence = await service.uploadImage({ ticketId: decodeURIComponent(deterministicUploadMatch[1]), projectId, bytes }, principal);
        assertSafeImageEvidence(evidence, input.config); send(response, 201, evidence); return true;
      }

      const cropUploadMatch = url.pathname.match(/^\/api\/core\/local-execution\/crop\/([^/]+)\/image-upload$/);
      if (cropUploadMatch && request.method === 'POST') {
        const service = requireCrop(input.crop);
        const projectId = requirePngUpload(request, url);
        const bytes = await readBytes(request, input.config.imageUploadLimitBytes);
        const evidence = await service.uploadImage({ ticketId: decodeURIComponent(cropUploadMatch[1]), projectId, bytes }, principal);
        assertSafeImageEvidence(evidence, input.config); send(response, 201, evidence); return true;
      }

      const resizeUploadMatch = url.pathname.match(/^\/api\/core\/local-execution\/resize\/([^/]+)\/image-upload$/);
      if (resizeUploadMatch && request.method === 'POST') {
        const service = requireResize(input.resize);
        const projectId = requirePngUpload(request, url);
        const bytes = await readBytes(request, input.config.imageUploadLimitBytes);
        const evidence = await service.uploadImage({ ticketId: decodeURIComponent(resizeUploadMatch[1]), projectId, bytes }, principal);
        assertSafeImageEvidence(evidence, input.config); send(response, 201, evidence); return true;
      }

      const superResolutionUploadMatch = url.pathname.match(/^\/api\/core\/local-execution\/super-resolution\/([^/]+)\/image-upload$/);
      if (superResolutionUploadMatch && request.method === 'POST') {
        const service = requireSuperResolution(input.superResolution);
        const projectId = requirePngUpload(request, url);
        const bytes = await readBytes(request, input.config.imageUploadLimitBytes);
        const evidence = await service.uploadImage({ ticketId: decodeURIComponent(superResolutionUploadMatch[1]), projectId, bytes }, principal);
        assertSafeImageEvidence(evidence, input.config); send(response, 201, evidence); return true;
      }

      const deterministicResultMatch = url.pathname.match(/^\/api\/core\/local-execution\/background-isolation\/([^/]+)\/result$/);
      if (deterministicResultMatch && request.method === 'POST') {
        const service = requireDeterministicImages(input.deterministicImages);
        const body = await readResultBody(request, input.config.bodyLimitBytes);
        const finalized = await service.submit({ ticketId: decodeURIComponent(deterministicResultMatch[1]), projectId: body.projectId, result: body.result }, principal);
        sendFinalized(response, finalized); return true;
      }

      const cropResultMatch = url.pathname.match(/^\/api\/core\/local-execution\/crop\/([^/]+)\/result$/);
      if (cropResultMatch && request.method === 'POST') {
        const service = requireCrop(input.crop);
        const body = await readResultBody(request, input.config.bodyLimitBytes);
        const finalized = await service.submit({ ticketId: decodeURIComponent(cropResultMatch[1]), projectId: body.projectId, result: body.result }, principal);
        sendFinalized(response, finalized); return true;
      }

      const resizeResultMatch = url.pathname.match(/^\/api\/core\/local-execution\/resize\/([^/]+)\/result$/);
      if (resizeResultMatch && request.method === 'POST') {
        const service = requireResize(input.resize);
        const body = await readResultBody(request, input.config.bodyLimitBytes);
        const finalized = await service.submit({ ticketId: decodeURIComponent(resizeResultMatch[1]), projectId: body.projectId, result: body.result }, principal);
        sendFinalized(response, finalized); return true;
      }

      const superResolutionResultMatch = url.pathname.match(/^\/api\/core\/local-execution\/super-resolution\/([^/]+)\/result$/);
      if (superResolutionResultMatch && request.method === 'POST') {
        const service = requireSuperResolution(input.superResolution);
        const body = await readResultBody(request, input.config.bodyLimitBytes);
        const finalized = await service.submit({ ticketId: decodeURIComponent(superResolutionResultMatch[1]), projectId: body.projectId, result: body.result }, principal);
        sendFinalized(response, finalized); return true;
      }

      const uploadMatch = url.pathname.match(/^\/api\/core\/local-execution\/([^/]+)\/mask-upload$/);
      if (uploadMatch && request.method === 'POST') {
        if (mediaType(request) !== 'application/octet-stream') throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/octet-stream');
        const projectId = url.searchParams.get('projectId')?.trim() ?? '';
        const width = Number(url.searchParams.get('width')); const height = Number(url.searchParams.get('height'));
        if (!projectId || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > input.config.maskMaxDimension || height > input.config.maskMaxDimension || width * height > input.config.maskUploadLimitBytes) throw httpError(400, 'invalid_mask_dimensions', 'Local MASK dimensions are invalid or unsafe');
        const bytes = await readBytes(request, input.config.maskUploadLimitBytes);
        const evidence = await input.service.uploadMask({ ticketId: decodeURIComponent(uploadMatch[1]), projectId, width, height, bytes }, principal);
        send(response, 201, evidence); return true;
      }

      const resultMatch = url.pathname.match(/^\/api\/core\/local-execution\/([^/]+)\/result$/);
      if (resultMatch && request.method === 'POST') {
        const body = await readResultBody(request, input.config.bodyLimitBytes);
        const finalized = await input.service.submit({ ticketId: decodeURIComponent(resultMatch[1]), projectId: body.projectId, result: body.result }, principal);
        sendFinalized(response, finalized); return true;
      }

      throw httpError(404, 'not_found', 'Route not found');
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, { error: error.code ?? (status === 500 ? 'internal_error' : 'local_execution_error'), message: status === 500 ? 'Local execution request failed' : error.message, correlationId });
      return true;
    }
  };
}

function assertSourceDelivery(canonical: Readonly<{ width: number; height: number; sourceRgba: Uint8Array }>, label: string): void {
  const expectedBytes = canonical.width * canonical.height * 4;
  if (!Number.isSafeInteger(expectedBytes) || canonical.sourceRgba.byteLength !== expectedBytes) throw httpError(500, 'local_input_delivery_contract', `Canonical ${label} input delivery length is invalid`);
}
function setInputHeaders(response: ServerResponse, width: number, height: number, sourceSha256: string, maskSha256?: string): void {
  response.setHeader(INPUT_WIDTH_HEADER, String(width)); response.setHeader(INPUT_HEIGHT_HEADER, String(height)); response.setHeader(SOURCE_SHA_HEADER, sourceSha256); if (maskSha256) response.setHeader(MASK_SHA_HEADER, maskSha256);
}
function requireProjectId(url: URL): string { const projectId = url.searchParams.get('projectId')?.trim() ?? ''; if (!projectId) throw httpError(400, 'invalid_project_id', 'projectId is required'); return projectId; }
function requirePngUpload(request: IncomingMessage, url: URL): string { if (mediaType(request) !== 'image/png') throw httpError(415, 'unsupported_media_type', 'Content-Type must be image/png'); return requireProjectId(url); }
async function readResultBody(request: IncomingMessage, limit: number): Promise<Readonly<{ projectId: string; result: unknown }>> { requireJson(request); const body = await readJson(request, limit) as Record<string, unknown>; return Object.freeze({ projectId: string(body.projectId), result: body.result }); }
function sendFinalized(response: ServerResponse, finalized: Readonly<{ executionId: string; status: string; artifactId?: string; outcome: Readonly<{ verification: Readonly<{ valid: boolean }> }> }>): void { const publicResult = Object.freeze({ executionId: finalized.executionId, status: finalized.status, artifactId: finalized.artifactId, verification: Object.freeze({ valid: finalized.outcome.verification.valid }) }); send(response, finalized.status === 'SUCCESS' ? 200 : 422, publicResult); }
function assertSafeImageEvidence(evidence: Readonly<{ width?: number; height?: number }>, config: CoreServerConfig): void {
  if (!evidence.width || !evidence.height || evidence.width > config.imageMaxDimension || evidence.height > config.imageMaxDimension || evidence.width * evidence.height > config.imageMaxPixels) throw httpError(400, 'invalid_image_dimensions', 'Local image dimensions are invalid or unsafe');
}
function requireDeterministicImages(service: LocalDeterministicImageExecutionService | undefined): LocalDeterministicImageExecutionService { if (!service) throw httpError(503, 'deterministic_local_execution_unavailable', 'Deterministic local image execution is unavailable'); return service; }
function requireCrop(service: LocalCropExecutionService | undefined): LocalCropExecutionService { if (!service) throw httpError(503, 'crop_local_execution_unavailable', 'Deterministic Crop execution is unavailable'); return service; }
function requireResize(service: LocalResizeExecutionService | undefined): LocalResizeExecutionService { if (!service) throw httpError(503, 'resize_local_execution_unavailable', 'Deterministic Resize execution is unavailable'); return service; }
function requireSuperResolution(service: LocalSuperResolutionExecutionService | undefined): LocalSuperResolutionExecutionService { if (!service) throw httpError(503, 'super_resolution_local_execution_unavailable', 'Local super-resolution execution is unavailable'); return service; }
function requireInputDelivery(service: LocalExecutionInputDeliveryService | undefined): LocalExecutionInputDeliveryService { if (!service) throw httpError(503, 'local_input_delivery_unavailable', 'Canonical local input delivery is unavailable'); return service; }
function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin');
  if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin);
  response.setHeader('Access-Control-Allow-Credentials', 'true'); response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, X-Correlation-Id, ${BROWSER_CSRF_HEADER}`);
  response.setHeader('Access-Control-Expose-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}, ${INPUT_WIDTH_HEADER}, ${INPUT_HEIGHT_HEADER}, ${SOURCE_SHA_HEADER}, ${MASK_SHA_HEADER}`);
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}
function requireJson(request: IncomingMessage): void { if (!mediaType(request).startsWith('application/json')) throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/json'); }
function mediaType(request: IncomingMessage): string { return String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase(); }
function header(request: IncomingMessage, name: string): string | undefined { const value = request.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value; }
async function readJson(request: IncomingMessage, limit: number): Promise<unknown> { const bytes = await readBytes(request, limit); try { return JSON.parse(Buffer.from(bytes).toString('utf8')); } catch { throw httpError(400, 'invalid_json', 'Invalid JSON body'); } }
async function readBytes(request: IncomingMessage, limit: number): Promise<Uint8Array> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.byteLength; if (size > limit) throw httpError(413, 'body_too_large', 'Request body exceeds the configured limit'); chunks.push(value); } return new Uint8Array(Buffer.concat(chunks)); }
function send(response: ServerResponse, status: number, body: unknown): void { response.statusCode = status; if (body === undefined) { response.end(); return; } const bytes = Buffer.from(JSON.stringify(body)); response.setHeader('Content-Type', 'application/json'); response.setHeader('Content-Length', bytes.byteLength); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(bytes); }
function sendBytes(response: ServerResponse, status: number, bytes: Uint8Array, contentType: string): void { response.statusCode = status; response.setHeader('Content-Type', contentType); response.setHeader('Content-Length', bytes.byteLength); response.setHeader('Cache-Control', 'no-store'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(Buffer.from(bytes)); }
function string(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function number(value: unknown): number { return typeof value === 'number' ? value : Number.NaN; }
function record(value: unknown): Readonly<Record<string, unknown>> | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : undefined; }
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }