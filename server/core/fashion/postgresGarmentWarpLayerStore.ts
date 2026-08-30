import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { GarmentOwnerScope } from './postgresGarmentStore.ts';
import { GARMENT_MESH_WARP_MAX_DIMENSION, GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS, GARMENT_MESH_WARP_TOOL_ID, GARMENT_MESH_WARP_TOOL_VERSION } from '../../../src/platform/creative/deterministic/GarmentMeshWarp.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;

export type GarmentWarpLayer = Readonly<{
  id: string;
  projectId: string;
  executionId: string;
  ticketId: string;
  projectImageStorageId: string;
  projectImageSha256: string;
  garmentId: string;
  viewId: string;
  viewContentSha256: string;
  representationId: string;
  representationContentSha256: string;
  anchorSetId: string;
  anchorPayloadSha256: string;
  destinationMeshSha256: string;
  width: number;
  height: number;
  contentSha256: string;
  rgba: Uint8Array;
  createdAt: string;
}>;

export type PersistGarmentWarpLayerInput = Omit<GarmentWarpLayer, 'id'|'contentSha256'|'createdAt'>;

export class PostgresGarmentWarpLayerStore {
  constructor(private readonly pool: Pool, private readonly nextId: () => string = randomUUID) {}

  async persist(scope: GarmentOwnerScope, input: PersistGarmentWarpLayerInput): Promise<GarmentWarpLayer> {
    const normalized = normalizeInput(input);
    const layerId = normalizeUuid(this.nextId(), 'generated layerId');
    const contentSha256 = sha256(normalized.rgba);
    await this.pool.query(`INSERT INTO canonical_fashion_garment_warp_layers
      (layer_id,tenant_id,user_id,project_id,execution_id,ticket_id,project_image_storage_id,project_image_sha256,
       garment_id,view_id,view_content_sha256,representation_id,representation_content_sha256,anchor_set_id,anchor_payload_sha256,
       destination_mesh_sha256,tool_id,tool_version,width,height,encoding,content_sha256,rgba_bytes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'RGBA8_RAW_V1',$21,$22)
      ON CONFLICT (tenant_id,user_id,project_id,execution_id) DO NOTHING`, [
      layerId,scope.tenantId,scope.userId,normalized.projectId,normalized.executionId,normalized.ticketId,
      normalized.projectImageStorageId,normalized.projectImageSha256,normalized.garmentId,normalized.viewId,normalized.viewContentSha256,
      normalized.representationId,normalized.representationContentSha256,normalized.anchorSetId,normalized.anchorPayloadSha256,
      normalized.destinationMeshSha256,GARMENT_MESH_WARP_TOOL_ID,GARMENT_MESH_WARP_TOOL_VERSION,normalized.width,normalized.height,contentSha256,Buffer.from(normalized.rgba),
    ]);
    const stored = await this.loadByExecution(scope, normalized.projectId, normalized.executionId);
    if (!stored) throw new Error('Canonical Fashion garment warp layer persistence failed');
    assertExactReplay(stored, normalized, contentSha256);
    return stored;
  }

  async loadByExecution(scope: GarmentOwnerScope, projectIdValue: string, executionId: string): Promise<GarmentWarpLayer | undefined> {
    const projectId = normalizeUuid(projectIdValue, 'projectId');
    const result = await this.pool.query(`SELECT * FROM canonical_fashion_garment_warp_layers
      WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND execution_id=$4`, [scope.tenantId,scope.userId,projectId,executionId]);
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }

  async load(scope: GarmentOwnerScope, projectIdValue: string, layerIdValue: string): Promise<GarmentWarpLayer | undefined> {
    const projectId = normalizeUuid(projectIdValue, 'projectId');
    const layerId = normalizeUuid(layerIdValue, 'layerId');
    const result = await this.pool.query(`SELECT * FROM canonical_fashion_garment_warp_layers
      WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND layer_id=$4`, [scope.tenantId,scope.userId,projectId,layerId]);
    return result.rows[0] ? fromRow(result.rows[0]) : undefined;
  }
}

function normalizeInput(input: PersistGarmentWarpLayerInput): PersistGarmentWarpLayerInput {
  const projectId = normalizeUuid(input.projectId,'projectId');
  const projectImageStorageId = normalizeUuid(input.projectImageStorageId,'projectImageStorageId');
  const garmentId = normalizeUuid(input.garmentId,'garmentId');
  const viewId = normalizeUuid(input.viewId,'viewId');
  const representationId = normalizeUuid(input.representationId,'representationId');
  const anchorSetId = normalizeUuid(input.anchorSetId,'anchorSetId');
  for (const [name,value] of [['projectImageSha256',input.projectImageSha256],['viewContentSha256',input.viewContentSha256],['representationContentSha256',input.representationContentSha256],['anchorPayloadSha256',input.anchorPayloadSha256],['destinationMeshSha256',input.destinationMeshSha256]] as const) if (!SHA.test(value)) throw new Error(`${name} must be canonical lowercase SHA-256`);
  const executionId = normalizeText(input.executionId,'executionId'); const ticketId = normalizeText(input.ticketId,'ticketId');
  if (!Number.isSafeInteger(input.width) || !Number.isSafeInteger(input.height) || input.width<1 || input.height<1 || input.width>GARMENT_MESH_WARP_MAX_DIMENSION || input.height>GARMENT_MESH_WARP_MAX_DIMENSION) throw new Error('Garment warp layer dimensions are invalid');
  const pixels=input.width*input.height; if(!Number.isSafeInteger(pixels)||pixels>GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS||input.rgba.byteLength!==pixels*4) throw new Error('Garment warp layer RGBA payload is invalid');
  return Object.freeze({ ...input,projectId,projectImageStorageId,garmentId,viewId,representationId,anchorSetId,executionId,ticketId,rgba:Uint8Array.from(input.rgba) });
}
function fromRow(row:any): GarmentWarpLayer {
  const rgba=new Uint8Array(row.rgba_bytes); const contentSha256=sha256(rgba);
  if(!SHA.test(String(row.content_sha256))||contentSha256!==String(row.content_sha256)||row.encoding!=='RGBA8_RAW_V1'||row.tool_id!==GARMENT_MESH_WARP_TOOL_ID||row.tool_version!==GARMENT_MESH_WARP_TOOL_VERSION) throw new Error('Stored Fashion garment warp layer integrity mismatch');
  return Object.freeze({ id:String(row.layer_id).toLowerCase(),projectId:String(row.project_id).toLowerCase(),executionId:String(row.execution_id),ticketId:String(row.ticket_id),projectImageStorageId:String(row.project_image_storage_id).toLowerCase(),projectImageSha256:String(row.project_image_sha256),garmentId:String(row.garment_id).toLowerCase(),viewId:String(row.view_id).toLowerCase(),viewContentSha256:String(row.view_content_sha256),representationId:String(row.representation_id).toLowerCase(),representationContentSha256:String(row.representation_content_sha256),anchorSetId:String(row.anchor_set_id).toLowerCase(),anchorPayloadSha256:String(row.anchor_payload_sha256),destinationMeshSha256:String(row.destination_mesh_sha256),width:Number(row.width),height:Number(row.height),contentSha256,rgba,createdAt:new Date(row.created_at).toISOString() });
}
function assertExactReplay(stored:GarmentWarpLayer,input:PersistGarmentWarpLayerInput,contentSha256:string):void {
  const same=stored.projectId===input.projectId&&stored.executionId===input.executionId&&stored.ticketId===input.ticketId&&stored.projectImageStorageId===input.projectImageStorageId&&stored.projectImageSha256===input.projectImageSha256&&stored.garmentId===input.garmentId&&stored.viewId===input.viewId&&stored.viewContentSha256===input.viewContentSha256&&stored.representationId===input.representationId&&stored.representationContentSha256===input.representationContentSha256&&stored.anchorSetId===input.anchorSetId&&stored.anchorPayloadSha256===input.anchorPayloadSha256&&stored.destinationMeshSha256===input.destinationMeshSha256&&stored.width===input.width&&stored.height===input.height&&stored.contentSha256===contentSha256&&stored.rgba.byteLength===input.rgba.byteLength&&sha256(stored.rgba)===sha256(input.rgba);
  if(!same) throw new Error('Canonical garment warp execution is already bound to a different intermediate layer or lineage');
}
function normalizeUuid(value:unknown,label:string):string { const normalized=typeof value==='string'?value.toLowerCase():''; if(!UUID.test(normalized)) throw new Error(`${label} must be a UUID`); return normalized; }
function normalizeText(value:unknown,label:string):string { const normalized=typeof value==='string'?value.trim():''; if(!normalized||[...normalized].length>200||/[\u0000-\u001f\u007f]/u.test(normalized)) throw new Error(`${label} is invalid`); return normalized; }
function sha256(bytes:Uint8Array):string { return createHash('sha256').update(bytes).digest('hex'); }
