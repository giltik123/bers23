import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HmacJwtVerifier } from '../auth/hmacJwtVerifier.ts';
import type { CreativeApplicationCore } from '../composition/createCreativeCore.ts';
import type { CoreServerConfig } from '../config.ts';
import { modelArtifactRelay } from './modelArtifactRelay.ts';
import type { ArtifactAuthority } from '../artifacts/artifactAuthority.ts';
import type { PostgresProjectStore } from '../projects/postgresProjectStore.ts';

/** Minimal Node transport for a framework-neutral Fetch handler. */
export function nodeHttpAdapter(handler: (request: Request) => Promise<Response>) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    const origin = `http://${request.headers.host ?? 'localhost'}`;
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : await readBody(request);
    const result = await handler(new Request(new URL(request.url ?? '/', origin), { method: request.method, headers: request.headers as HeadersInit, body }));
    response.statusCode = result.status;
    result.headers.forEach((value, key) => response.setHeader(key, value));
    response.end(Buffer.from(await result.arrayBuffer()));
  };
}

/** Production Node transport with health, CORS, authentication and request limits. */
export function createNodeHttpAdapter(input: Readonly<{ core: CreativeApplicationCore; artifacts: ArtifactAuthority; projects: PostgresProjectStore; auth: HmacJwtVerifier; config: CoreServerConfig; ready: () => Promise<boolean>; accepting: () => boolean }>) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const correlationId = header(request, 'x-correlation-id')?.slice(0, 128) || randomUUID(); response.setHeader('X-Correlation-Id', correlationId);
    try {
      const origin = header(request, 'origin');
      if (origin) { if (!input.config.allowedWebOrigins.includes(origin)) return sendError(response, 403, 'origin_denied', 'Origin is not allowed', correlationId, false); response.setHeader('Access-Control-Allow-Origin', origin); response.setHeader('Vary', 'Origin'); response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Correlation-Id'); response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS'); }
      if (request.method === 'OPTIONS') return send(response, 204, undefined);
      const path = new URL(request.url ?? '/', 'http://core.invalid').pathname;
      if (path === '/health/live' && request.method === 'GET') return send(response, 200, { status: 'live' });
      if (path === '/health/ready' && request.method === 'GET') { const ready = input.accepting() && await input.ready(); return send(response, ready ? 200 : 503, { status: ready ? 'ready' : 'not_ready' }); }
      if (!input.accepting()) return sendError(response, 503, 'shutting_down', 'Server is shutting down', correlationId, true);
      const relay = await modelArtifactRelay(new Request(new URL(request.url ?? '/', 'http://core.invalid'), { method: request.method }));
      if (relay) return sendFetchResponse(response, relay);
      const resultMatch = path.match(/^\/api\/core\/artifacts\/results\/([^/]+)$/);
      if (resultMatch && request.method === 'GET') {
        const token=decodeURIComponent(resultMatch[1]); let claim; try { claim=input.artifacts.external.resolveStoredOriginalDelivery(token); } catch { claim=input.artifacts.external.resolveStoredFinalDelivery(token); }
        const stored = await input.artifacts.images.loadSource(claim.storageId, claim);
        if (!stored) return sendError(response, 404, 'result_not_found', 'Final image artifact is unavailable', correlationId, false);
        response.statusCode = 200; response.setHeader('Content-Type', stored.contentType); response.setHeader('Content-Length', stored.bytes.byteLength); response.setHeader('Cache-Control', 'private, max-age=300'); response.setHeader('X-Content-Type-Options', 'nosniff'); response.end(stored.bytes); return;
      }
      const principal = input.auth.verify(header(request, 'authorization'));
      const projectMatch=path.match(/^\/api\/core\/projects\/([^/]+)$/); const actionMatch=path.match(/^\/api\/core\/projects\/([^/]+)\/(accept-final|undo|redo|restore-original|versions)$/); const versionMatch=path.match(/^\/api\/core\/projects\/([^/]+)\/versions\/([^/]+)\/restore$/);
      const dto=(row: any) => { const scope={...principal,projectId:row.project_id}; const artifactId=(storageId:string)=>storageId===row.original_image_storage_id?input.artifacts.external.issueStoredOriginal(storageId,scope):input.artifacts.external.issueStoredFinal(storageId,scope); const url=(storageId:string)=>{const token=storageId===row.original_image_storage_id?input.artifacts.external.issueStoredOriginalDelivery(storageId,scope,Date.now()+300_000):input.artifacts.external.issueStoredFinalDelivery(storageId,scope,Date.now()+300_000);return `/api/core/artifacts/results/${encodeURIComponent(token)}`}; const originalId=artifactId(row.original_image_storage_id),currentId=artifactId(row.current_image_storage_id),delivery=url(row.current_image_storage_id),history=(row.history??[]).map((h:any)=>({id:h.history_id,artifact_id:artifactId(h.image_storage_id),image_url:url(h.image_storage_id),instruction:h.instruction,operation:h.kind,created_at:h.created_at})); const cursor=history.findIndex((h:any)=>h.id===row.history_cursor_id); const versions=(row.versions??[]).map((v:any)=>({id:v.version_id,name:v.name,artifact_id:artifactId(v.image_storage_id),preview_url:url(v.image_storage_id),created_at:v.created_at})); return {id:row.project_id,name:row.name,original_image_artifact_id:originalId,current_image_artifact_id:currentId,original_image_url:url(row.original_image_storage_id),current_image_url:delivery,thumbnail_url:delivery,width:row.width,height:row.height,status:row.status,favorite:row.favorite,archived:row.archived,objects:row.objects,history,history_index:cursor,versions,created_date:row.created_at,updated_date:row.updated_at}; };
      if(path==='/api/core/projects'&&request.method==='POST'){ const type=mediaType(request); if(!['image/png','image/jpeg','image/webp'].includes(type))return sendError(response,415,'unsupported_media_type','Supported images are PNG, JPEG and WebP',correlationId,false); const bytes=await readBytes(request,input.config.imageUploadLimitBytes); if(!bytes.byteLength)return sendError(response,400,'empty_image','Image body is required',correlationId,false); const name=(new URL(request.url??'/','http://core.invalid').searchParams.get('name')??'Untitled').trim(); if(!name||name.length>200)return sendError(response,400,'invalid_project_name','Project name is invalid',correlationId,false); const created=await input.projects.create(principal,name,bytes,{maxDimension:input.config.imageMaxDimension,maxPixels:input.config.imageMaxPixels}); return send(response,201,dto(await input.projects.state(principal,created.project_id))); }
      if(path==='/api/core/projects'&&request.method==='GET') return send(response,200,await Promise.all((await input.projects.list(principal)).map(row=>input.projects.state(principal,row.project_id).then(value=>dto(value)))));
      if(projectMatch&&request.method==='GET'){const row=await input.projects.state(principal,decodeURIComponent(projectMatch[1]));return row?send(response,200,dto(row)):sendError(response,404,'project_not_found','Project not found',correlationId,false);}
      if(actionMatch&&request.method==='POST'){const id=decodeURIComponent(actionMatch[1]),action=actionMatch[2];let row;if(action==='accept-final'){const body=await readJson(request,input.config.bodyLimitBytes) as any;if(!body?.finalArtifactId||typeof body.finalArtifactId!=='string')return sendError(response,400,'invalid_final_artifact','finalArtifactId is required',correlationId,false);let claim;try{claim=input.artifacts.external.resolveStoredFinalId(body.finalArtifactId,{...principal,projectId:id});}catch{return sendError(response,400,'invalid_final_artifact','FINAL artifact identity is invalid',correlationId,false);}row=await input.projects.acceptFinal(principal,id,claim.storageId,typeof body.instruction==='string'?body.instruction:undefined);}else if(action==='undo'||action==='redo'||action==='restore-original')row=await input.projects.navigate(principal,id,action==='restore-original'?'original':action);else{const body=await readJson(request,input.config.bodyLimitBytes) as any;row=await input.projects.createVersion(principal,id,body?.name??'');}return send(response,200,dto(row));}
      if(versionMatch&&request.method==='POST'){const row=await input.projects.restoreVersion(principal,decodeURIComponent(versionMatch[1]),decodeURIComponent(versionMatch[2]));return send(response,200,dto(row));}
      if(projectMatch&&request.method==='PATCH'){const patch=await readJson(request,input.config.bodyLimitBytes); if(!patch||typeof patch!=='object'||Array.isArray(patch))return sendError(response,400,'invalid_project_patch','Project patch must be an object',correlationId,false); const id=decodeURIComponent(projectMatch[1]); const row=await input.projects.update(principal,id,patch as Record<string,unknown>);return row?send(response,200,dto(await input.projects.state(principal,id))):sendError(response,404,'project_not_found','Project not found',correlationId,false);}
      if(projectMatch&&request.method==='DELETE')return await input.projects.delete(principal,decodeURIComponent(projectMatch[1]))?send(response,204,undefined):sendError(response,404,'project_not_found','Project not found',correlationId,false);
      if (path === '/api/core/artifacts/masks' && request.method === 'POST') {
        if (mediaType(request) !== 'application/octet-stream') return sendError(response, 415, 'unsupported_media_type', 'Content-Type must be application/octet-stream', correlationId, false);
        const url = new URL(request.url ?? '/', 'http://core.invalid'); const projectId = url.searchParams.get('projectId')?.trim();
        const width = Number(url.searchParams.get('width')); const height = Number(url.searchParams.get('height'));
        if (!projectId || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > input.config.maskMaxDimension || height > input.config.maskMaxDimension || width * height > input.config.maskUploadLimitBytes) return sendError(response, 400, 'invalid_mask_dimensions', 'Canonical MASK dimensions are invalid or unsafe', correlationId, false);
        const alpha = await readBytes(request, input.config.maskUploadLimitBytes);
        if (alpha.byteLength !== width * height) return sendError(response, 400, 'invalid_mask_size', 'Canonical MASK byte length must equal width * height', correlationId, false);
        const scope = { ...principal, projectId }; const stored = await input.artifacts.masks.persist(scope, width, height, alpha); const artifactId = input.artifacts.external.issueStoredMask(stored.storageId, scope);
        return send(response, 201, { artifactId, role: 'MASK', state: 'AVAILABLE', width, height, coordinateSpace: 'ORIGINAL', encoding: 'ALPHA_8_LOSSLESS' });
      }
      if (path === '/api/core/creative/execute' && request.method === 'POST') {
        if (!mediaType(request).startsWith('application/json')) return sendError(response, 415, 'unsupported_media_type', 'Content-Type must be application/json', correlationId, false);
        const body = await readJson(request, input.config.bodyLimitBytes); const result = await input.core.execute({ body, auth: principal, correlationId }); return send(response, result.status, result.body);
      }
      const match = path.match(/^\/api\/core\/creative\/([^/]+)\/(status|result|cancel)$/);
      if (match) { const [, executionId, action] = match; const coreRequest = { auth: principal, correlationId }; const result = action === 'status' && request.method === 'GET' ? input.core.lifecycle.status(coreRequest, executionId) : action === 'result' && request.method === 'GET' ? input.core.lifecycle.result(coreRequest, executionId) : action === 'cancel' && request.method === 'POST' ? input.core.lifecycle.cancel(coreRequest, executionId) : undefined; if (result) return send(response, result.status, result.body); }
      return sendError(response, 404, 'not_found', 'Route not found', correlationId, false);
    } catch (cause) {
      const error = cause as Error & { code?: string; status?: number; retryable?: boolean };
      return sendError(response, error.status ?? 500, error.code ?? 'internal_error', error.status ? error.message : 'Internal server error', correlationId, error.retryable ?? false);
    }
  };
}

function header(request: IncomingMessage, name: string): string | undefined { const value = request.headers[name]; return Array.isArray(value) ? value[0] : value; }
function mediaType(request: IncomingMessage): string { return (header(request, 'content-type') ?? '').split(';')[0].trim().toLowerCase(); }
async function readBody(request: IncomingMessage): Promise<ArrayBuffer> { const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks); return body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) as ArrayBuffer; }
async function readJson(request: IncomingMessage, limit: number): Promise<unknown> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > limit) throw Object.assign(new Error('Request body is too large'), { code: 'body_too_large', status: 413 }); chunks.push(buffer); } try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw Object.assign(new Error('Request body must contain valid JSON'), { code: 'invalid_json', status: 400 }); } }
async function readBytes(request: IncomingMessage, limit: number): Promise<Uint8Array> { const chunks: Buffer[] = []; let size = 0; for await (const chunk of request) { const buffer = Buffer.from(chunk); size += buffer.length; if (size > limit) throw Object.assign(new Error('Upload is too large'), { code: 'body_too_large', status: 413 }); chunks.push(buffer); } return new Uint8Array(Buffer.concat(chunks)); }
function sendError(response: ServerResponse, status: number, code: string, message: string, correlationId: string, retryable: boolean) { return send(response, status, { code, message, correlationId, retryable }); }
function send(response: ServerResponse, status: number, body: unknown): void { if (response.headersSent) return; response.statusCode = status; if (body === undefined) { response.end(); return; } response.setHeader('Content-Type', 'application/json; charset=utf-8'); response.setHeader('Cache-Control', 'no-store'); response.end(JSON.stringify(body)); }
async function sendFetchResponse(response: ServerResponse, result: Response): Promise<void> { response.statusCode = result.status; result.headers.forEach((value, key) => response.setHeader(key, value)); response.end(Buffer.from(await result.arrayBuffer())); }
