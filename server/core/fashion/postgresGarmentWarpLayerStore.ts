import { createHash, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { GarmentOwnerScope } from './postgresGarmentStore.ts';
import { GARMENT_MESH_WARP_MAX_DIMENSION, GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS, GARMENT_MESH_WARP_TOOL_ID, GARMENT_MESH_WARP_TOOL_VERSION } from '../../../src/platform/creative/deterministic/GarmentMeshWarp.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA = /^[0-9a-f]{64}$/;

export type GarmentWarpLayer = Readonly<{
  id: string; projectId: string; executionId: string; ticketId: string;
  projectImageStorageId: string; projectImageSha256: string;
  garmentId: string; viewId: string; viewContentSha256: string;
  representationId: string; representationContentSha256: string;
  anchorSetId: string; anchorPayloadSha256: string; destinationMeshSha256: string;
  width: number; height: number; contentSha256: string; rgba: Uint8Array; createdAt: string;
}>;
export type PersistGarmentWarpLayerInput = Omit<GarmentWarpLayer,'id'|'contentSha256'|'createdAt'>;

export class PostgresGarmentWarpLayerStore {
  constructor(private readonly pool: Pool, private readonly nextId: () => string = randomUUID) {}

  async persist(scope: GarmentOwnerScope,input: PersistGarmentWarpLayerInput): Promise<GarmentWarpLayer> {
    const n=normalizeInput(input); const layerId=normalizeUuid(this.nextId(),'generated layerId'); const contentSha256=sha256(n.rgba);
    await this.pool.query(`INSERT INTO canonical_fashion_garment_warp_layers
      (layer_id,tenant_id,user_id,project_id,execution_id,ticket_id,project_image_storage_id,project_image_sha256,garment_id,view_id,view_content_sha256,
       representation_id,representation_content_sha256,anchor_set_id,anchor_payload_sha256,destination_mesh_sha256,tool_id,tool_version,width,height,encoding,content_sha256,rgba_bytes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,'RGBA8_RAW_V1',$21,$22)
      ON CONFLICT (tenant_id,user_id,project_id,execution_id) DO NOTHING`,[
      layerId,scope.tenantId,scope.userId,n.projectId,n.executionId,n.ticketId,n.projectImageStorageId,n.projectImageSha256,n.garmentId,n.viewId,n.viewContentSha256,
      n.representationId,n.representationContentSha256,n.anchorSetId,n.anchorPayloadSha256,n.destinationMeshSha256,GARMENT_MESH_WARP_TOOL_ID,GARMENT_MESH_WARP_TOOL_VERSION,n.width,n.height,contentSha256,Buffer.from(n.rgba)]);
    const stored=await this.loadByExecution(scope,n.projectId,n.executionId); if(!stored)throw new Error('Canonical Fashion garment warp layer persistence failed');
    assertExactReplay(stored,n,contentSha256); return stored;
  }
  async loadByExecution(scope:GarmentOwnerScope,projectIdValue:string,executionId:string):Promise<GarmentWarpLayer|undefined>{
    const projectId=normalizeUuid(projectIdValue,'projectId'); const normalizedExecution=normalizeText(executionId,'executionId');
    const result=await this.pool.query(`SELECT * FROM canonical_fashion_garment_warp_layers WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND execution_id=$4`,[scope.tenantId,scope.userId,projectId,normalizedExecution]);
    return result.rows[0]?fromRow(result.rows[0]):undefined;
  }
  async load(scope:GarmentOwnerScope,projectIdValue:string,layerIdValue:string):Promise<GarmentWarpLayer|undefined>{
    const projectId=normalizeUuid(projectIdValue,'projectId'); const layerId=normalizeUuid(layerIdValue,'layerId');
    const result=await this.pool.query(`SELECT * FROM canonical_fashion_garment_warp_layers WHERE tenant_id=$1 AND user_id=$2 AND project_id=$3 AND layer_id=$4`,[scope.tenantId,scope.userId,projectId,layerId]);
    return result.rows[0]?fromRow(result.rows[0]):undefined;
  }
}
function normalizeInput(input:PersistGarmentWarpLayerInput):PersistGarmentWarpLayerInput{
  const projectId=normalizeUuid(input.projectId,'projectId'),projectImageStorageId=normalizeUuid(input.projectImageStorageId,'projectImageStorageId'),garmentId=normalizeUuid(input.garmentId,'garmentId'),viewId=normalizeUuid(input.viewId,'viewId'),representationId=normalizeUuid(input.representationId,'representationId'),anchorSetId=normalizeUuid(input.anchorSetId,'anchorSetId');
  for(const [name,value] of [['projectImageSha256',input.projectImageSha256],['viewContentSha256',input.viewContentSha256],['representationContentSha256',input.representationContentSha256],['anchorPayloadSha256',input.anchorPayloadSha256],['destinationMeshSha256',input.destinationMeshSha256]] as const)if(!SHA.test(value))throw new Error(`${name} must be canonical lowercase SHA-256`);
  const executionId=normalizeText(input.executionId,'executionId'),ticketId=normalizeText(input.ticketId,'ticketId');
  if(!Number.isSafeInteger(input.width)||!Number.isSafeInteger(input.height)||input.width<1||input.height<1||input.width>GARMENT_MESH_WARP_MAX_DIMENSION||input.height>GARMENT_MESH_WARP_MAX_DIMENSION)throw new Error('Garment warp layer dimensions are invalid');
  const pixels=input.width*input.height;if(!Number.isSafeInteger(pixels)||pixels>GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS||input.rgba.byteLength!==pixels*4)throw new Error('Garment warp layer RGBA payload is invalid');
  return Object.freeze({...input,projectId,projectImageStorageId,garmentId,viewId,representationId,anchorSetId,executionId,ticketId,rgba:Uint8Array.from(input.rgba)});
}
function fromRow(row:any):GarmentWarpLayer{
  const ids=[row.layer_id,row.project_id,row.project_image_storage_id,row.garment_id,row.view_id,row.representation_id,row.anchor_set_id].map((v:any)=>String(v).toLowerCase());
  if(ids.some(id=>!UUID.test(id)))throw new Error('Stored Fashion garment warp layer identity is invalid');
  const hashes=[row.project_image_sha256,row.view_content_sha256,row.representation_content_sha256,row.anchor_payload_sha256,row.destination_mesh_sha256,row.content_sha256].map(String);
  if(hashes.some(hash=>!SHA.test(hash)))throw new Error('Stored Fashion garment warp layer SHA identity is invalid');
  const width=Number(row.width),height=Number(row.height),rgba=new Uint8Array(row.rgba_bytes);const pixels=width*height;const contentSha256=sha256(rgba);
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width<1||height<1||width>GARMENT_MESH_WARP_MAX_DIMENSION||height>GARMENT_MESH_WARP_MAX_DIMENSION||!Number.isSafeInteger(pixels)||pixels>GARMENT_MESH_WARP_MAX_OUTPUT_PIXELS||rgba.byteLength!==pixels*4||contentSha256!==hashes[5]||row.encoding!=='RGBA8_RAW_V1'||row.tool_id!==GARMENT_MESH_WARP_TOOL_ID||row.tool_version!==GARMENT_MESH_WARP_TOOL_VERSION)throw new Error('Stored Fashion garment warp layer integrity mismatch');
  return Object.freeze({id:ids[0],projectId:ids[1],executionId:normalizeText(row.execution_id,'stored executionId'),ticketId:normalizeText(row.ticket_id,'stored ticketId'),projectImageStorageId:ids[2],projectImageSha256:hashes[0],garmentId:ids[3],viewId:ids[4],viewContentSha256:hashes[1],representationId:ids[5],representationContentSha256:hashes[2],anchorSetId:ids[6],anchorPayloadSha256:hashes[3],destinationMeshSha256:hashes[4],width,height,contentSha256,rgba,createdAt:new Date(row.created_at).toISOString()});
}
function assertExactReplay(s:GarmentWarpLayer,i:PersistGarmentWarpLayerInput,hash:string):void{const same=s.projectId===i.projectId&&s.executionId===i.executionId&&s.ticketId===i.ticketId&&s.projectImageStorageId===i.projectImageStorageId&&s.projectImageSha256===i.projectImageSha256&&s.garmentId===i.garmentId&&s.viewId===i.viewId&&s.viewContentSha256===i.viewContentSha256&&s.representationId===i.representationId&&s.representationContentSha256===i.representationContentSha256&&s.anchorSetId===i.anchorSetId&&s.anchorPayloadSha256===i.anchorPayloadSha256&&s.destinationMeshSha256===i.destinationMeshSha256&&s.width===i.width&&s.height===i.height&&s.contentSha256===hash&&s.rgba.byteLength===i.rgba.byteLength&&sha256(s.rgba)===sha256(i.rgba);if(!same)throw new Error('Canonical garment warp execution is already bound to a different intermediate layer or lineage');}
function normalizeUuid(value:unknown,label:string):string{const normalized=typeof value==='string'?value.toLowerCase():'';if(!UUID.test(normalized))throw new Error(`${label} must be a UUID`);return normalized;}
function normalizeText(value:unknown,label:string):string{const normalized=typeof value==='string'?value.normalize('NFKC').trim():'';if(!normalized||[...normalized].length>200||/[\u0000-\u001f\u007f]/u.test(normalized))throw new Error(`${label} is invalid`);return normalized;}
function sha256(bytes:Uint8Array):string{return createHash('sha256').update(bytes).digest('hex');}
