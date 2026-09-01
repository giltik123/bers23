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
import {
  checkGarmentTextureFinalLineageSchema,
  migrateGarmentTextureFinalLineageSchema,
} from '../server/core/fashion/garmentTextureFinalLineageSchema.ts';
import {
  checkGarmentAppearanceRefinementFinalLineageSchema,
  migrateGarmentAppearanceRefinementFinalLineageSchema,
} from '../server/core/fashion/garmentAppearanceRefinementFinalLineageSchema.ts';
import { BODY_ANCHOR_COORDINATE_SPACE } from '../server/core/fashion/bodyAnchorGeometry.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
} from '../src/platform/creative/deterministic/GarmentTextureComposite.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F5a.2 refinement FINAL lineage acceptance');

const owner = Object.freeze({ tenantId: 'f5a2-tenant-a', userId: 'f5a2-user-a' });
const garmentLimits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 600, maxPixels: 400_000 });
const projectLimits = Object.freeze({ maxDimension: 1200, maxPixels: 1_500_000 });

async function image(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 120, height: 160, channels: 4, background: { r: 30 + seed, g: 70 + seed, b: 120 + seed, alpha: 1 } },
  }).png().toBuffer());
}

function rgba(width: number, height: number, seed: number): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let index = 0; index < out.length; index += 4) {
    out[index] = (index / 4 + seed) % 251;
    out[index + 1] = (seed * 3) % 251;
    out[index + 2] = (seed * 7) % 251;
    out[index + 3] = 255;
  }
  return out;
}

function parametric() {
  return Object.freeze({
    schemaVersion: 1,
    coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
    points: Object.freeze([[0,0],[1,0],[1,1],[0,1]].map(value => Object.freeze(value))),
    triangles: Object.freeze([Object.freeze([0,1,2]), Object.freeze([0,2,3])]),
    outline: Object.freeze([0,1,2,3]),
  });
}

function anchors() {
  return Object.freeze({
    schemaVersion: 1,
    coordinateSpace: BODY_ANCHOR_COORDINATE_SPACE,
    anchors: Object.freeze({ leftShoulder:[0.2,0.1], rightShoulder:[0.8,0.1], leftHip:[0.25,0.8], rightHip:[0.75,0.8] }),
  });
}

function producerParameters() {
  return Object.freeze({
    schema: GARMENT_TEXTURE_COMPOSITE_SCHEMA,
    textureTransform: Object.freeze({
      scaleXQ16: GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE,
      scaleYQ16: GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE,
      offsetXQ16: 0,
      offsetYQ16: 0,
      wrapMode: GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
      alphaPolicy: GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
    }),
    featherRadius: 2,
    colorSpacePolicy: GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  });
}

async function insertRefinement(
  pool: Pool,
  parentStorageId: string,
  executionId: string,
  profile = 'REFINE_REALISM_V1',
  version = '1',
  layerId?: string,
  layerSha?: string,
): Promise<any> {
  const result = await pool.query(`INSERT INTO canonical_image_artifacts
    (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes,
     source_image_storage_id,mask_storage_id,producer_operation,garment_warp_layer_id,garment_warp_layer_sha256,
     producer_parameters,producer_parameters_sha256,refinement_profile,refinement_contract_version)
    SELECT $2,parent.tenant_id,parent.user_id,parent.project_id,$3,'garment-appearance-refinement','COMPOSITE','FINAL',
      parent.width,parent.height,'PNG_RGBA8_LOSSLESS','image/png',parent.image_bytes,
      parent.storage_id,NULL,'GARMENT_APPEARANCE_REFINEMENT',COALESCE($6::uuid,parent.garment_warp_layer_id),COALESCE($7::char(64),parent.garment_warp_layer_sha256),
      NULL,NULL,$4,$5
    FROM canonical_image_artifacts parent
    WHERE parent.storage_id=$1
    RETURNING *`, [parentStorageId, randomUUID(), executionId, profile, version, layerId ?? null, layerSha ?? null]);
  return result.rows[0];
}

test('F5a.2 refinement FINAL is transitively bound to deterministic F4 parent and current Project source', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-f5a2-refinement-lineage' });
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

    let garment = await garments.createWithInitialView(owner, {
      name: 'F5a.2 shirt',
      viewKind: 'FRONT',
      sourceContentType: 'image/png',
      bytes: await image(2),
    }, garmentLimits);
    await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category: 'tshirts' });
    garment = (await garments.get(owner, garment.id))!;
    const admitted = await representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC',
      generatorId: 'local.mesh-fit',
      generatorVersion: '1.0.0',
      sourceViewIds: [garment.primaryViewId],
      payload: parametric(),
    });

    const anchorStore = new PostgresProjectBodyAnchorStore(pool);
    const anchor = await anchorStore.create(owner, projectId, {
      payload: anchors(),
      producerId: 'local.pose-anchor',
      producerVersion: '1.0.0',
    });
    const mesh = await anchorStore.deriveDestinationMesh(owner, projectId, anchor.id, garment.id, admitted.representation.id);
    const basis = garment.views.find(view => view.id === admitted.representation.basisViewId);
    assert.ok(basis);

    const layerStore = new PostgresGarmentWarpLayerStore(pool);
    const layer = await layerStore.persist(owner, Object.freeze({
      projectId,
      executionId: 'f5a2-warp-execution',
      ticketId: 'f5a2-warp-ticket',
      projectImageStorageId: anchor.projectImageStorageId,
      projectImageSha256: anchor.projectImageSha256,
      garmentId: garment.id,
      viewId: basis.id,
      viewContentSha256: basis.contentSha256,
      representationId: admitted.representation.id,
      representationContentSha256: admitted.representation.contentSha256,
      anchorSetId: anchor.id,
      anchorPayloadSha256: anchor.payloadSha256,
      destinationMeshSha256: mesh.meshSha256,
      width: anchor.projectImageWidth,
      height: anchor.projectImageHeight,
      rgba: rgba(anchor.projectImageWidth, anchor.projectImageHeight, 7),
    }));

    const f4 = await images.persistFinal(scope, 'f5a2-f4-final-execution', 'garment-texture-composite', {
      width: anchor.projectImageWidth,
      height: anchor.projectImageHeight,
      data: new Uint8ClampedArray(rgba(anchor.projectImageWidth, anchor.projectImageHeight, 11)),
    }, Object.freeze({
      sourceImageStorageId: anchor.projectImageStorageId,
      producerOperation: 'GARMENT_TEXTURE_COMPOSITE' as const,
      garmentWarpLayerId: layer.id,
      garmentWarpLayerSha256: layer.contentSha256,
      producerParameters: producerParameters(),
    }));

    const refined = await insertRefinement(pool, f4.storageId, 'f5a2-refinement-success');
    assert.equal(refined.source_image_storage_id, f4.storageId);
    assert.equal(refined.producer_operation, 'GARMENT_APPEARANCE_REFINEMENT');
    assert.equal(refined.garment_warp_layer_id, layer.id);
    assert.equal(String(refined.garment_warp_layer_sha256).trim(), layer.contentSha256);
    assert.equal(refined.refinement_profile, 'REFINE_REALISM_V1');
    assert.equal(refined.refinement_contract_version, '1');
    assert.equal(refined.producer_parameters, null);
    assert.equal(refined.producer_parameters_sha256, null);

    // F4-owned drift after F5 rows exist must use extension-safe migration 033,
    // not historical 030 whose shared lineage shape predates refinement rows.
    await pool.query('ALTER TABLE canonical_image_artifacts DISABLE TRIGGER canonical_image_artifacts_fashion_texture_insert_guard');
    await assert.rejects(checkGarmentTextureFinalLineageSchema(pool), /triggers are incomplete|disabled|drifted/i);
    await migrateGarmentTextureFinalLineageSchema(pool);
    await checkGarmentTextureFinalLineageSchema(pool);
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);
    const afterF4Repair = await pool.query(`SELECT source_image_storage_id,producer_operation,garment_warp_layer_id,
      garment_warp_layer_sha256,refinement_profile,refinement_contract_version
      FROM canonical_image_artifacts WHERE storage_id=$1`, [refined.storage_id]);
    assert.equal(afterF4Repair.rows[0]?.source_image_storage_id, f4.storageId);
    assert.equal(afterF4Repair.rows[0]?.producer_operation, 'GARMENT_APPEARANCE_REFINEMENT');
    assert.equal(afterF4Repair.rows[0]?.garment_warp_layer_id, layer.id);
    assert.equal(String(afterF4Repair.rows[0]?.garment_warp_layer_sha256).trim(), layer.contentSha256);
    assert.equal(afterF4Repair.rows[0]?.refinement_profile, 'REFINE_REALISM_V1');
    assert.equal(afterF4Repair.rows[0]?.refinement_contract_version, '1');

    await assert.rejects(
      insertRefinement(pool, anchor.projectImageStorageId, 'f5a2-non-f4-parent'),
      /refinement FINAL lineage|violates|constraint/i,
      'Project source cannot be used directly as an F5 parent',
    );
    await assert.rejects(
      insertRefinement(pool, f4.storageId, 'f5a2-wrong-profile', 'UNKNOWN_PROFILE'),
      /refinement_identity|check constraint|violates/i,
    );
    await assert.rejects(
      insertRefinement(pool, f4.storageId, 'f5a2-wrong-layer', 'REFINE_REALISM_V1', '1', randomUUID(), '0'.repeat(64)),
      /foreign key|refinement FINAL lineage|violates/i,
    );

    await assert.rejects(
      pool.query(`UPDATE canonical_image_artifacts SET refinement_profile='REFINE_REALISM_V1' WHERE storage_id=$1`, [refined.storage_id]),
      /immutable/i,
      'even no-op lineage updates remain blocked for canonical F5 rows',
    );

    const next = await images.persistFinal(scope, 'f5a2-next-project-final', 'crop', {
      width: anchor.projectImageWidth,
      height: anchor.projectImageHeight,
      data: new Uint8ClampedArray(rgba(anchor.projectImageWidth, anchor.projectImageHeight, 13)),
    }, { sourceImageStorageId: anchor.projectImageStorageId, producerOperation: 'CROP' });
    await pool.query(`UPDATE canonical_projects SET current_image_storage_id=$2 WHERE project_id=$1`, [projectId, next.storageId]);
    await assert.rejects(
      insertRefinement(pool, f4.storageId, 'f5a2-stale-parent'),
      /stale|current Project source|refinement FINAL lineage|violates/i,
      'a deterministic F4 parent becomes stale when Project source moves',
    );

    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);
  } finally {
    await pool.end();
  }
});
