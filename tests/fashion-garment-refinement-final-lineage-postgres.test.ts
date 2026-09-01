import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { PostgresImageArtifactStore } from '../server/core/artifacts/postgresImageArtifactStore.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';
import { PostgresProjectBodyAnchorStore } from '../server/core/fashion/postgresProjectBodyAnchorStore.ts';
import { PostgresGarmentWarpLayerStore } from '../server/core/fashion/postgresGarmentWarpLayerStore.ts';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { migrateProjectBodyAnchorSchema } from '../server/core/fashion/bodyAnchorSchema.ts';
import { migrateGarmentWarpLayerSchema } from '../server/core/fashion/garmentWarpLayerSchema.ts';
import { migrateGarmentTextureFinalLineageSchema } from '../server/core/fashion/garmentTextureFinalLineageSchema.ts';
import { checkGarmentAppearanceRefinementFinalLineageSchema, migrateGarmentAppearanceRefinementFinalLineageSchema } from '../server/core/fashion/garmentAppearanceRefinementFinalLineageSchema.ts';
import { BODY_ANCHOR_COORDINATE_SPACE } from '../server/core/fashion/bodyAnchorGeometry.ts';
import { GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY, GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY, GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE, GARMENT_TEXTURE_COMPOSITE_SCHEMA, GARMENT_TEXTURE_COMPOSITE_WRAP_MODE } from '../src/platform/creative/deterministic/GarmentTextureComposite.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F5a.2 refinement FINAL lineage acceptance');
const owner = Object.freeze({ tenantId: 'f5a2-tenant-a', userId: 'f5a2-user-a' });
const garmentLimits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 600, maxPixels: 400_000 });
const projectLimits = Object.freeze({ maxDimension: 1200, maxPixels: 1_500_000 });

async function image(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width: 120, height: 160, channels: 4, background: { r: 30 + seed, g: 70 + seed, b: 120 + seed, alpha: 1 } } }).png().toBuffer());
}
function rgba(width: number, height: number, seed: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < out.length; i += 4) { out[i] = (i / 4 + seed) % 251; out[i + 1] = (seed * 3) % 251; out[i + 2] = (seed * 7) % 251; out[i + 3] = 255; }
  return out;
}
function parametric() { return Object.freeze({ schemaVersion: 1, coordinateSpace: 'PRIMARY_VIEW_NORMALIZED', points: Object.freeze([[0,0],[1,0],[1,1],[0,1]].map(v => Object.freeze(v))), triangles: Object.freeze([Object.freeze([0,1,2]), Object.freeze([0,2,3])]), outline: Object.freeze([0,1,2,3]) }); }
function anchors() { return Object.freeze({ schemaVersion: 1, coordinateSpace: BODY_ANCHOR_COORDINATE_SPACE, anchors: Object.freeze({ leftShoulder:[0.2,0.1], rightShoulder:[0.8,0.1], leftHip:[0.25,0.8], rightHip:[0.75,0.8] }) }); }
function producerParameters() { return Object.freeze({ schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA, textureTransform: Object.freeze({ scaleXQ16: GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE, scaleYQ16: GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE, offsetXQ16: 0, offsetYQ16: 0, wrapMode: GARMENT_TEXTURE_COMPOSITE_WRAP_MODE, alphaPolicy: GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY }), featherRadius: 2, colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY }); }

async function insertRefinement(pool: Pool, parentStorageId: string, executionId: string, options: { profile?: string; version?: string; parentSha?: string; sourceStorageId?: string } = {}) {
  const result = await pool.query(`INSERT INTO canonical_image_artifacts
    (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes,
     source_image_storage_id,mask_storage_id,producer_operation,garment_warp_layer_id,garment_warp_layer_sha256,producer_parameters,producer_parameters_sha256,
     refinement_parent_image_storage_id,refinement_parent_image_sha256,refinement_profile,refinement_contract_version)
    SELECT $2,parent.tenant_id,parent.user_id,parent.project_id,$3,'garment-appearance-refinement','COMPOSITE','FINAL',parent.width,parent.height,
      'PNG_RGBA8_LOSSLESS','image/png',parent.image_bytes,COALESCE($7::uuid,parent.source_image_storage_id),NULL,'GARMENT_APPEARANCE_REFINEMENT',NULL,NULL,NULL,NULL,
      parent.storage_id,COALESCE($6::char(64),encode(sha256(parent.image_bytes),'hex')),$4,$5
    FROM canonical_image_artifacts parent WHERE parent.storage_id=$1 RETURNING *`, [
      parentStorageId, randomUUID(), executionId, options.profile ?? 'REFINE_REALISM_V1', options.version ?? '1', options.parentSha ?? null, options.sourceStorageId ?? null,
    ]);
  return result.rows[0];
}

test('F5a.2 dual binding keeps Project stale-source law while direct Artifact parent remains deterministic F4 FINAL', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-f5a2-dual-lineage' });
  try {
    await migrateProjectSchema(pool);
    await migrateGarmentSchema(pool);
    await migrateProjectBodyAnchorSchema(pool);
    await migrateGarmentWarpLayerSchema(pool);
    await migrateGarmentTextureFinalLineageSchema(pool);
    await migrateGarmentAppearanceRefinementFinalLineageSchema(pool);
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);

    const projects = new PostgresProjectStore(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    const images = new PostgresImageArtifactStore(pool);
    const project = await projects.create(owner, 'F5a.2 person', await image(1), projectLimits);
    const projectId = String(project.project_id).toLowerCase();
    const scope = Object.freeze({ ...owner, projectId });
    const projectSource = String(project.current_image_storage_id).toLowerCase();

    let garment = await garments.createWithInitialView(owner, { name: 'F5a.2 shirt', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: await image(2) }, garmentLimits);
    await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category: 'tshirts' });
    garment = (await garments.get(owner, garment.id))!;
    const admitted = await representations.admit(owner, garment.id, garment.revision, { tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0', sourceViewIds: [garment.primaryViewId], payload: parametric() });
    const anchorStore = new PostgresProjectBodyAnchorStore(pool);
    const anchor = await anchorStore.create(owner, projectId, { payload: anchors(), producerId: 'local.pose-anchor', producerVersion: '1.0.0' });
    const mesh = await anchorStore.deriveDestinationMesh(owner, projectId, anchor.id, garment.id, admitted.representation.id);
    const basis = garment.views.find(view => view.id === admitted.representation.basisViewId); assert.ok(basis);
    const layer = await new PostgresGarmentWarpLayerStore(pool).persist(owner, Object.freeze({ projectId, executionId: 'f5a2-warp-execution', ticketId: 'f5a2-warp-ticket', projectImageStorageId: anchor.projectImageStorageId, projectImageSha256: anchor.projectImageSha256, garmentId: garment.id, viewId: basis.id, viewContentSha256: basis.contentSha256, representationId: admitted.representation.id, representationContentSha256: admitted.representation.contentSha256, anchorSetId: anchor.id, anchorPayloadSha256: anchor.payloadSha256, destinationMeshSha256: mesh.meshSha256, width: anchor.projectImageWidth, height: anchor.projectImageHeight, rgba: rgba(anchor.projectImageWidth, anchor.projectImageHeight, 7) }));
    const f4 = await images.persistFinal(scope, 'f5a2-f4-final-execution', 'garment-texture-composite', { width: anchor.projectImageWidth, height: anchor.projectImageHeight, data: new Uint8ClampedArray(rgba(anchor.projectImageWidth, anchor.projectImageHeight, 11)) }, Object.freeze({ sourceImageStorageId: anchor.projectImageStorageId, producerOperation: 'GARMENT_TEXTURE_COMPOSITE' as const, garmentWarpLayerId: layer.id, garmentWarpLayerSha256: layer.contentSha256, producerParameters: producerParameters() }));

    const beforeRefine = await projects.get(owner, projectId);
    assert.equal(beforeRefine.current_image_storage_id, projectSource, 'deterministic F4 candidate must remain unaccepted before optional refinement');
    const refined = await insertRefinement(pool, f4.storageId, 'f5a2-refinement-success');
    assert.equal(refined.source_image_storage_id, projectSource);
    assert.equal(refined.refinement_parent_image_storage_id, f4.storageId);
    assert.match(String(refined.refinement_parent_image_sha256).trim(), /^[0-9a-f]{64}$/);
    assert.equal(refined.garment_warp_layer_id, null);
    assert.equal(refined.producer_parameters, null);

    await projects.acceptFinal(owner, projectId, refined.storage_id, 'Accept constrained refinement');
    const afterAccept = await projects.get(owner, projectId);
    assert.equal(afterAccept.current_image_storage_id, refined.storage_id, 'F5 FINAL must be directly acceptable without accepting F4 parent first');
    await projects.navigate(owner, projectId, 'original');

    await assert.rejects(insertRefinement(pool, projectSource, 'f5a2-non-f4-parent', { sourceStorageId: projectSource }), /refinement FINAL lineage|constraint|violates/i);
    await assert.rejects(insertRefinement(pool, f4.storageId, 'f5a2-wrong-profile', { profile: 'UNKNOWN_PROFILE' }), /refinement_identity|check constraint|violates/i);
    await assert.rejects(insertRefinement(pool, f4.storageId, 'f5a2-wrong-parent-sha', { parentSha: '0'.repeat(64) }), /refinement FINAL lineage|constraint|violates/i);
    await assert.rejects(insertRefinement(pool, f4.storageId, 'f5a2-wrong-source', { sourceStorageId: randomUUID() }), /foreign key|refinement FINAL lineage|constraint|violates/i);

    const validAgain = await insertRefinement(pool, f4.storageId, 'f5a2-immutable-check');
    await assert.rejects(pool.query(`UPDATE canonical_image_artifacts SET refinement_parent_image_sha256=$2 WHERE storage_id=$1`, [validAgain.storage_id, '1'.repeat(64)]), /immutable/i);

    const next = await images.persistFinal(scope, 'f5a2-next-project-final', 'crop', { width: anchor.projectImageWidth, height: anchor.projectImageHeight, data: new Uint8ClampedArray(rgba(anchor.projectImageWidth, anchor.projectImageHeight, 13)) }, { sourceImageStorageId: projectSource, producerOperation: 'CROP' });
    await projects.acceptFinal(owner, projectId, next.storageId, 'Advance Project source');
    await assert.rejects(insertRefinement(pool, f4.storageId, 'f5a2-stale-parent'), /stale|current Project source|refinement FINAL lineage|violates/i);
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);
  } finally { await pool.end(); }
});
