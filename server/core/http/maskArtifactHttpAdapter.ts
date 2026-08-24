import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AuthenticatedPrincipal } from '../auth/hmacJwtVerifier.ts';
import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import type { CoreServerConfig } from '../config.ts';
import { BROWSER_CSRF_HEADER, assertBrowserMutationAllowed, requestAuthorization } from './browserSessionCookie.ts';

const PATH = '/api/core/artifacts/masks';
type MaskArtifactAuth = Readonly<{ verify: (authorization: string | undefined) => AuthenticatedPrincipal | Promise<AuthenticatedPrincipal> }>;

/** Canonical transport for deterministic/manual MASK persistence with server-verified lineage. */
export function createMaskArtifactHttpAdapter(input: Readonly<{ artifacts: ArtifactAuthority; auth: MaskArtifactAuth; config: CoreServerConfig }>) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<boolean> => {
    const url = new URL(request.url ?? '/', 'http://core.invalid');
    if (url.pathname !== PATH) return false;
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || globalThis.crypto.randomUUID();
    response.setHeader('X-Correlation-Id', correlationId);
    try {
      applyCors(request, response, input.config);
      if (request.method === 'OPTIONS') { send(response, 204, undefined); return true; }
      if (request.method !== 'POST') throw httpError(404, 'not_found', 'Route not found');
      assertBrowserMutationAllowed(request, input.config);
      if (mediaType(request) !== 'application/octet-stream') throw httpError(415, 'unsupported_media_type', 'Content-Type must be application/octet-stream');
      const principal = await input.auth.verify(requestAuthorization(request, input.config));
      const projectId = url.searchParams.get('projectId')?.trim() ?? '';
      const sourceImageArtifactId = url.searchParams.get('sourceImageArtifactId')?.trim() ?? '';
      const parentMaskArtifactId = url.searchParams.get('parentMaskArtifactId')?.trim() || undefined;
      const width = Number(url.searchParams.get('width')); const height = Number(url.searchParams.get('height'));
      if (!projectId || !sourceImageArtifactId || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > input.config.maskMaxDimension || height > input.config.maskMaxDimension || width * height > input.config.maskUploadLimitBytes) {
        throw httpError(400, 'invalid_mask_lineage', 'Canonical MASK dimensions and source lineage are required');
      }
      const scope = { ...principal, projectId };
      const source = await resolveSourceImage(input.artifacts, sourceImageArtifactId, scope);
      if (!source) throw httpError(400, 'invalid_source_image', 'Canonical source image is invalid for this scope');
      if (source.width !== width || source.height !== height) throw httpError(409, 'source_geometry_mismatch', 'MASK geometry must match its canonical source image');

      let parentMaskStorageId: string | undefined;
      if (parentMaskArtifactId) {
        let claim;
        try { claim = input.artifacts.external.resolveStoredMask(parentMaskArtifactId, scope); }
        catch { throw httpError(400, 'invalid_parent_mask', 'Parent MASK is invalid for this scope'); }
        const parent = await input.artifacts.masks.load(claim.storageId, scope);
        if (!parent) throw httpError(400, 'invalid_parent_mask', 'Parent MASK is unavailable');
        if (parent.width !== width || parent.height !== height) throw httpError(409, 'parent_mask_geometry_mismatch', 'Parent MASK geometry does not match the refined MASK');
        parentMaskStorageId = parent.storageId;
      }

      const alpha = await readBytes(request, input.config.maskUploadLimitBytes);
      if (alpha.byteLength !== width * height) throw httpError(400, 'invalid_mask_size', 'Canonical MASK byte length must equal width * height');
      const producerOperation = parentMaskStorageId ? 'MASK_REFINEMENT' as const : 'MANUAL_SELECTION' as const;
      const stored = await input.artifacts.masks.persistManual(scope, width, height, alpha, {
        sourceImageStorageId: source.storageId,
        parentMaskStorageId,
        producerOperation,
      });
      const artifactId = input.artifacts.external.issueStoredMask(stored.storageId, scope);
      send(response, 201, Object.freeze({
        artifactId,
        role: 'MASK',
        state: 'AVAILABLE',
        encoding: 'ALPHA_8_LOSSLESS',
        coordinateSpace: 'ORIGINAL',
        producerOperation,
        sourceImageArtifactId,
        parentMaskArtifactId,
      }));
      return true;
    } catch (cause) {
      const error = cause as Error & { status?: number; code?: string };
      const status = Number(error.status) || 500;
      send(response, status, { error: error.code ?? (status === 500 ? 'internal_error' : 'mask_artifact_error'), message: status === 500 ? 'MASK persistence failed' : error.message, correlationId });
      return true;
    }
  };
}

async function resolveSourceImage(artifacts: ArtifactAuthority, artifactId: string, scope: AuthenticatedPrincipal & { projectId: string }) {
  try {
    const claim = artifacts.external.resolveStoredOriginalId(artifactId, scope);
    return await artifacts.images.loadSource(claim.storageId, scope);
  } catch { /* FINAL source below */ }
  try {
    const claim = artifacts.external.resolveStoredFinalId(artifactId, scope);
    return await artifacts.images.loadSource(claim.storageId, scope);
  } catch { return undefined; }
}
function applyCors(request: IncomingMessage, response: ServerResponse, config: CoreServerConfig): void {
  const origin = header(request, 'origin'); if (!origin) return;
  if (!config.allowedWebOrigins.includes(origin)) throw httpError(403, 'origin_denied', 'Origin is not allowed');
  response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Access-Control-Allow-Credentials', 'true'); response.setHeader('Vary', 'Origin');
  response.setHeader('Access-Control-Allow-Headers', `Content-Type, X-Correlation-Id, ${BROWSER_CSRF_HEADER}`); response.setHeader('Access-Control-Expose-Headers', `X-Correlation-Id, ${BROWSER_CSRF_HEADER}`); response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
}
function mediaType(request: IncomingMessage): string { return String(request.headers['content-type'] ?? '').split(';', 1)[0].trim().toLowerCase(); }
function header(request: IncomingMessage, name: string): string | undefined { const value = request.headers[name.toLowerCase()]; return Array.isArray(value) ? value[0] : value; }
async function readBytes(request: IncomingMessage, limit: number): Promise<Uint8Array> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const value = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); size += value.byteLength; if (size > limit) throw httpError(413, 'body_too_large', 'Request body exceeds the configured limit'); chunks.push(value); } return new Uint8Array(Buffer.concat(chunks)); }
function send(response: ServerResponse, status: number, body: unknown): void { response.statusCode = status; if (body === undefined) { response.end(); return; } const bytes = Buffer.from(JSON.stringify(body)); response.setHeader('Content-Type', 'application/json'); response.setHeader('Content-Length', bytes.byteLength); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(bytes); }
function httpError(status: number, code: string, message: string): Error & { status: number; code: string } { return Object.assign(new Error(message), { status, code }); }
