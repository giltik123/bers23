import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';
import { PostgresProjectBodyAnchorStore } from '../server/core/fashion/postgresProjectBodyAnchorStore.ts';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { migrateProjectBodyAnchorSchema } from '../server/core/fashion/bodyAnchorSchema.ts';
import { checkGarmentWarpLayerSchema, migrateGarmentWarpLayerSchema } from '../server/core/fashion/garmentWarpLayerSchema.ts';
import { PostgresGarmentWarpLayerStore } from '../server/core/fashion/postgresGarmentWarpLayerStore.ts';
import { BODY_ANCHOR_COORDINATE_SPACE } from '../server/core/fashion/bodyAnchorGeometry.ts';

const databaseUrl=process.env.DATABASE_URL;if(!databaseUrl)throw new Error('DATABASE_URL is required for F4b.4 garment warp layer acceptance');
const owner=Object.freeze({tenantId:'f4b4-tenant-a',userId:'f4b4-user-a'});const foreign=Object.freeze({tenantId:'f4b4-tenant-a',userId:'f4b4-user-b'});
const garmentLimits=Object.freeze({maxUploadBytes:2*1024*1024,maxDimension:600,maxPixels:400_000});const projectLimits=Object.freeze({maxDimension:1200,maxPixels:1_500_000});
async function image(seed:number){return new Uint8Array(await sharp({create:{width:120,height:160,channels:4,background:{r:30+seed,g:70+seed,b:120+seed,alpha:1}}}).png().toBuffer());}
function parametric(){return Object.freeze({schemaVersion:1,coordinateSpace:'PRIMARY_VIEW_NORMALIZED',points:Object.freeze([[0,0],[1,0],[1,1],[0,1]].map(v=>Object.freeze(v))),triangles:Object.freeze([Object.freeze([0,1,2]),Object.freeze([0,2,3])]),outline:Object.freeze([0,1,2,3])});}
function anchors(){return Object.freeze({schemaVersion:1,coordinateSpace:BODY_ANCHOR_COORDINATE_SPACE,anchors:Object.freeze({leftShoulder:[0.2,0.1],rightShoulder:[0.8,0.1],leftHip:[0.25,0.8],rightHip:[0.75,0.8]})});}
function rgba(width:number,height:number,seed:number){const out=new Uint8Array(width*height*4);for(let i=0;i<out.length;i+=4){out[i]=(i/4+seed)%251;out[i+1]=(seed*3)%251;out[i+2]=(seed*7)%251;out[i+3]=(i/4)%5===0?0:255;}return out;}

test('F4b.4 immutable warp layer is exact-evidence bound, replay-safe and never a Project FINAL',async()=>{
  const pool=new Pool({connectionString:databaseUrl,max:5,application_name:'bers-f4b4-warp-layer'});
  try{
    await migrateGarmentSchema(pool);await migrateProjectBodyAnchorSchema(pool);await migrateGarmentWarpLayerSchema(pool);await checkGarmentWarpLayerSchema(pool);
    const projects=new PostgresProjectStore(pool),garments=new PostgresGarmentStore(pool),wardrobe=new PostgresGarmentWardrobeStore(pool),representations=new PostgresGarmentRepresentationStore(pool);
    const project=await projects.create(owner,'F4b.4 person',await image(1),projectLimits);const projectId=String(project.project_id).toLowerCase();
    let garment=await garments.createWithInitialView(owner,{name:'F4b.4 shirt',viewKind:'FRONT',sourceContentType:'image/png',bytes:await image(2)},garmentLimits);
    const metadata=await wardrobe.updateMetadata(owner,garment.id,garment.revision,{category:'tshirts'});garment=(await garments.get(owner,garment.id))!;assert.equal(metadata.revision,garment.revision);
    const admitted=await representations.admit(owner,garment.id,garment.revision,{tier:'PARAMETRIC',generatorId:'local.mesh-fit',generatorVersion:'1.0.0',sourceViewIds:[garment.primaryViewId],payload:parametric()});
    const anchorStore=new PostgresProjectBodyAnchorStore(pool);const anchor=await anchorStore.create(owner,projectId,{payload:anchors(),producerId:'local.pose-anchor',producerVersion:'1.0.0'});
    const mesh=await anchorStore.deriveDestinationMesh(owner,projectId,anchor.id,garment.id,admitted.representation.id);
    const basis=garment.views.find(v=>v.id===admitted.representation.basisViewId);assert.ok(basis);
    const layerStore=new PostgresGarmentWarpLayerStore(pool);const executionId='f4b4-warp-execution-1';const bytes=rgba(anchor.projectImageWidth,anchor.projectImageHeight,7);
    const input=Object.freeze({projectId,executionId,ticketId:'f4b4-ticket-1',projectImageStorageId:anchor.projectImageStorageId,projectImageSha256:anchor.projectImageSha256,garmentId:garment.id,viewId:basis.id,viewContentSha256:basis.contentSha256,representationId:admitted.representation.id,representationContentSha256:admitted.representation.contentSha256,anchorSetId:anchor.id,anchorPayloadSha256:anchor.payloadSha256,destinationMeshSha256:mesh.meshSha256,width:anchor.projectImageWidth,height:anchor.projectImageHeight,rgba:bytes});
    const first=await layerStore.persist(owner,input);const replay=await layerStore.persist(owner,input);assert.deepEqual(replay,first);assert.deepEqual(replay.rgba,bytes);
    assert.equal(await layerStore.load(foreign,projectId,first.id),undefined);
    await assert.rejects(layerStore.persist(owner,{...input,ticketId:'different-ticket'}),/already bound/i);
    const changed=Uint8Array.from(bytes);changed[0]^=1;await assert.rejects(layerStore.persist(owner,{...input,rgba:changed}),/already bound/i);
    await assert.rejects(layerStore.persist(owner,{...input,executionId:'bad-view-hash',viewContentSha256:'0'.repeat(64)}));
    await assert.rejects(layerStore.persist(owner,{...input,executionId:'bad-representation-hash',representationContentSha256:'1'.repeat(64)}));
    await assert.rejects(layerStore.persist(owner,{...input,executionId:'bad-anchor-hash',anchorPayloadSha256:'2'.repeat(64)}));
    await assert.rejects(pool.query(`UPDATE canonical_fashion_garment_warp_layers SET ticket_id='tampered' WHERE layer_id=$1`,[first.id]),/immutable/i);
    await assert.rejects(pool.query(`DELETE FROM canonical_fashion_garment_warp_layers WHERE layer_id=$1`,[first.id]),/immutable/i);
    const projectArtifact=await pool.query(`SELECT 1 FROM canonical_image_artifacts WHERE storage_id=$1 OR execution_id=$2`,[first.id,executionId]);assert.equal(projectArtifact.rowCount,0,'warp layer must not masquerade as Project Artifact/FINAL');
    await assert.rejects(projects.acceptFinal(owner,projectId,first.id),cause=>Boolean(cause&&typeof cause==='object'&&(cause as any).code==='invalid_final_artifact'));

    const replacementStorageId=randomUUID().toLowerCase();const replacement=await image(9);
    await pool.query(`INSERT INTO canonical_image_artifacts(storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes) VALUES($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9)`,[replacementStorageId,owner.tenantId,owner.userId,projectId,randomUUID(),'F4B4_STALE_FIXTURE',anchor.projectImageWidth,anchor.projectImageHeight,Buffer.from(replacement)]);
    await pool.query(`UPDATE canonical_projects SET current_image_storage_id=$2 WHERE project_id=$1`,[projectId,replacementStorageId]);
    assert.deepEqual(await layerStore.persist(owner,input),first,'historical exact replay stays idempotent after Project source changes');
    await assert.rejects(layerStore.persist(owner,{...input,executionId:'stale-project'}),/stale|canonical Fashion contract|violates check constraint/i);
    await pool.query(`UPDATE canonical_projects SET current_image_storage_id=$2 WHERE project_id=$1`,[projectId,anchor.projectImageStorageId]);

    const latest=(await garments.get(owner,garment.id))!;await representations.revoke(owner,garment.id,admitted.representation.id,latest.revision);
    assert.deepEqual(await layerStore.persist(owner,input),first,'historical exact replay stays idempotent after representation revocation');
    await assert.rejects(layerStore.persist(owner,{...input,executionId:'revoked-representation'}),/stale|canonical Fashion contract|violates check constraint/i);

    await pool.query('ALTER TABLE canonical_fashion_garment_warp_layers DROP CONSTRAINT canonical_fashion_garment_warp_layers_tool_check');
    await pool.query("ALTER TABLE canonical_fashion_garment_warp_layers ADD CONSTRAINT canonical_fashion_garment_warp_layers_tool_check CHECK (tool_id='garment-mesh-warp')");
    await assert.rejects(checkGarmentWarpLayerSchema(pool),/incomplete or drifted/i,'weakened same-name tool CHECK must fail readiness');
    await pool.query('ALTER TABLE canonical_fashion_garment_warp_layers DROP CONSTRAINT canonical_fashion_garment_warp_layers_tool_check');
    await pool.query("ALTER TABLE canonical_fashion_garment_warp_layers ADD CONSTRAINT canonical_fashion_garment_warp_layers_tool_check CHECK (tool_id='garment-mesh-warp' AND tool_version='1')");
    await pool.query('ALTER TABLE canonical_fashion_garment_warp_layers DISABLE TRIGGER canonical_fashion_garment_warp_layers_insert_guard');
    await assert.rejects(checkGarmentWarpLayerSchema(pool),/incomplete or drifted/i,'disabled source-state guard must fail readiness');
    await pool.query('ALTER TABLE canonical_fashion_garment_warp_layers ENABLE TRIGGER canonical_fashion_garment_warp_layers_insert_guard');await checkGarmentWarpLayerSchema(pool);
  }finally{await pool.end();}
});
