import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { PostgresImageArtifactStore } from '../server/core/artifacts/postgresImageArtifactStore.ts';
import { PostgresMaskArtifactStore } from '../server/core/artifacts/postgresMaskArtifactStore.ts';
import { SignedArtifactAuthority } from '../server/core/artifacts/signedArtifactAuthority.ts';
import { DurableArtifactLineageResolver } from '../server/core/artifacts/durableArtifactLineageResolver.ts';
import { migrateFinalImageLineageSchema } from '../server/core/artifacts/finalImageLineageSchema.ts';
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
import { GARMENT_APPEARANCE_REFINEMENT_PROFILE } from '../src/platform/creative/deterministic/GarmentAppearanceRefinementIdentity.js';
import { GARMENT_APPEARANCE_REFINEMENT_PRODUCER_PARAMETERS_V1 } from '../src/platform/creative/deterministic/GarmentAppearanceRefinementParameters.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F5a.2 Fashion refinement FINAL lineage acceptance');

const owner = Object.freeze({ tenantId: 'f5a2-tenant-a', userId: 'f5a2-user-a' });
const garmentLimits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 600, maxPixels: 400_000 });
const projectLimits = Object.freeze({ maxDimension: 1200, maxPixels: 1_500_000 });
const PRODUCER_SHA256 = 'e12f9db090851cb15d70ea747b6945df832d57510d1d6c48a779594a46ed758d';
const REFINEMENT_IMMUTABLE_TRIGGER = 'canonical_image_artifacts_fashion_refinement_immut_guard';

async function image(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width: 120, height: 160, channels: 4, background: { r: 30 + seed, g: 70 + seed, b: 120 + seed, alpha: 1 } } }).png().toBuffer());
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
function refinementProducerParameters(): any {
  return JSON.parse(JSON.stringify(GARMENT_APPEARANCE_REFINEMENT_PRODUCER_PARAMETERS_V1.document));
}
function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

test('F5a.2 canonical refinement FINAL has exact deterministic F4 parentage and replay-safe lineage', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-f5a2-refinement-lineage' });
  try {
    await migrateFinalImageLineageSchema(pool);
    await migrateProjectSchema(pool);
    await migrateGarmentSchema(pool);
    await migrateProjectBodyAnchorSchema(pool);
    await migrateGarmentWarpLayerSchema(pool);
    await migrateGarmentTextureFinalLineageSchema(pool);

    const projects = new PostgresProjectStore(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    const images = new PostgresImageArtifactStore(pool);
    const masks = new PostgresMaskArtifactStore(pool);

    const project = await projects.create(owner, 'F5a.2 person', await image(1), projectLimits);
    const projectId = String(project.project_id).toLowerCase();
    const scope = Object.freeze({ ...owner, projectId });

    let garment = await garments.createWithInitialView(owner, {
      name: 'F5a.2 shirt', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: await image(2),
    }, garmentLimits);
    await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category: 'tshirts' });
    garment = (await garments.get(owner, garment.id))!;
    const admitted = await representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0', sourceViewIds: [garment.primaryViewId], payload: parametric(),
    });
    const anchorStore = new PostgresProjectBodyAnchorStore(pool);
    const anchor = await anchorStore.create(owner, projectId, { payload: anchors(), producerId: 'local.pose-anchor', producerVersion: '1.0.0' });
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

    const f4Lineage = Object.freeze({
      sourceImageStorageId: anchor.projectImageStorageId,
      producerOperation: 'GARMENT_TEXTURE_COMPOSITE' as const,
      garmentWarpLayerId: layer.id,
      garmentWarpLayerSha256: layer.contentSha256,
      producerParameters: producerParameters(),
    });
    const f4 = await images.persistFinal(scope, 'f5a2-f4-parent-execution', 'garment-texture-composite', {
      width: anchor.projectImageWidth,
      height: anchor.projectImageHeight,
      data: new Uint8ClampedArray(rgba(anchor.projectImageWidth, anchor.projectImageHeight, 11)),
    }, f4Lineage);

    await migrateGarmentAppearanceRefinementFinalLineageSchema(pool);
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);

    const supportSha = sha256(new Uint8Array([0, 255, 255, 0, 255]));
    const refinementLineage = Object.freeze({
      producerOperation: 'GARMENT_APPEARANCE_REFINEMENT' as const,
      refinementParentStorageId: f4.storageId,
      refinementParentSha256: sha256(f4.bytes),
      refinementProfile: GARMENT_APPEARANCE_REFINEMENT_PROFILE,
      refinementSupportSha256: supportSha,
      refinementProducerParameters: refinementProducerParameters(),
    });
    const refinementPixels = new Uint8ClampedArray(rgba(f4.width, f4.height, 17));
    const first = await images.persistFinal(scope, 'f5a2-refinement-execution', 'garment-appearance-refinement', {
      width: f4.width, height: f4.height, data: refinementPixels,
    }, refinementLineage);
    assert.equal(first.producerOperation, 'GARMENT_APPEARANCE_REFINEMENT');
    assert.equal(first.sourceImageStorageId, undefined);
    assert.equal(first.garmentWarpLayerId, undefined);
    assert.equal(first.refinementParentStorageId, f4.storageId);
    assert.equal(first.refinementParentSha256, sha256(f4.bytes));
    assert.equal(first.refinementProfile, 'REFINE_REALISM_V1');
    assert.equal(first.refinementSupportSha256, supportSha);
    assert.deepEqual(first.refinementProducerParameters, GARMENT_APPEARANCE_REFINEMENT_PRODUCER_PARAMETERS_V1.document);
    assert.equal(first.refinementProducerParametersSha256, PRODUCER_SHA256);

    const replay = await new PostgresImageArtifactStore(pool).persistFinal(
      scope,
      'f5a2-refinement-execution',
      'garment-appearance-refinement',
      { width: f4.width, height: f4.height, data: refinementPixels },
      refinementLineage,
    );
    assert.equal(replay.storageId, first.storageId, 'exact F5 replay must reuse the same canonical FINAL');
    assert.equal(replay.refinementProducerParametersSha256, PRODUCER_SHA256);

    const signed = new SignedArtifactAuthority('f5a2-artifact-secret', []);
    const resolver = new DurableArtifactLineageResolver({ signed, images, masks });
    const f4ArtifactId = signed.issueStoredFinal(f4.storageId, scope);
    const resolved = await resolver.resolve(scope, signed.issueStoredFinal(first.storageId, scope));
    assert.deepEqual(resolved.parentArtifactIds, [f4ArtifactId], 'F5 must expose deterministic F4 FINAL as its only direct Artifact parent');

    await assert.rejects(
      images.persistFinal(scope, 'f5a2-wrong-parent-hash', 'garment-appearance-refinement', {
        width: f4.width, height: f4.height, data: refinementPixels,
      }, { ...refinementLineage, refinementParentSha256: '0'.repeat(64) }),
      /parent|hash|violates|constraint/i,
    );

    const widenedProducer = refinementProducerParameters();
    widenedProducer.support.dilationRadiusPx = 3;
    await assert.rejects(
      images.persistFinal(scope, 'f5a2-open-producer', 'garment-appearance-refinement', {
        width: f4.width, height: f4.height, data: refinementPixels,
      }, { ...refinementLineage, refinementProducerParameters: widenedProducer }),
      /dilationRadiusPx/i,
    );

    const generic = await images.persistFinal(scope, 'f5a2-generic-parent', 'generic-final', {
      width: f4.width, height: f4.height, data: new Uint8ClampedArray(rgba(f4.width, f4.height, 19)),
    });
    await assert.rejects(
      images.persistFinal(scope, 'f5a2-generic-parent-refinement', 'garment-appearance-refinement', {
        width: f4.width, height: f4.height, data: refinementPixels,
      }, { ...refinementLineage, refinementParentStorageId: generic.storageId, refinementParentSha256: sha256(generic.bytes) }),
      /parent|deterministic Fashion FINAL|violates|constraint/i,
    );

    await assert.rejects(
      images.persistFinal(scope, 'f5a2-wrong-geometry', 'garment-appearance-refinement', {
        width: f4.width + 1, height: f4.height, data: new Uint8ClampedArray(rgba(f4.width + 1, f4.height, 23)),
      }, refinementLineage),
      /parent|geometry|violates|constraint/i,
    );

    const secondProject = await projects.create(owner, 'F5a.2 other person', await image(3), projectLimits);
    const crossScope = Object.freeze({ ...owner, projectId: String(secondProject.project_id).toLowerCase() });
    await assert.rejects(
      images.persistFinal(crossScope, 'f5a2-cross-project', 'garment-appearance-refinement', {
        width: f4.width, height: f4.height, data: refinementPixels,
      }, refinementLineage),
      /parent|cross-scope|violates|constraint/i,
    );

    await assert.rejects(
      pool.query(`UPDATE canonical_image_artifacts SET refinement_support_sha256=$2 WHERE storage_id=$1`, [first.storageId, 'c'.repeat(64)]),
      /refinement FINAL lineage is immutable/i,
    );
    await assert.rejects(
      pool.query(`UPDATE canonical_image_artifacts SET refinement_producer_parameters_sha256=$2 WHERE storage_id=$1`, [first.storageId, 'c'.repeat(64)]),
      /refinement FINAL lineage is immutable/i,
    );

    // Even with the immutable trigger deliberately disabled, the exact producer
    // CHECK must reject a semantically different SHA/document binding.
    await pool.query(`ALTER TABLE canonical_image_artifacts DISABLE TRIGGER ${REFINEMENT_IMMUTABLE_TRIGGER}`);
    await assert.rejects(
      pool.query(`UPDATE canonical_image_artifacts SET refinement_producer_parameters_sha256=$2 WHERE storage_id=$1`, [first.storageId, 'c'.repeat(64)]),
      /refinement_parameters_check|check constraint/i,
    );
    await pool.query(`ALTER TABLE canonical_image_artifacts ENABLE TRIGGER ${REFINEMENT_IMMUTABLE_TRIGGER}`);

    // Store-time revalidation must notice deterministic-parent byte tampering.
    const parentBytes = Buffer.from(f4.bytes);
    await pool.query(`UPDATE canonical_image_artifacts SET image_bytes=$2 WHERE storage_id=$1`, [f4.storageId, Buffer.from([1, 2, 3, 4])]);
    await assert.rejects(images.load(first.storageId, scope), /deterministic parent is unavailable or inconsistent/i);
    await pool.query(`UPDATE canonical_image_artifacts SET image_bytes=$2 WHERE storage_id=$1`, [f4.storageId, parentBytes]);
    assert.ok(await images.load(first.storageId, scope));

    // Generic FINAL persistence remains composable after F5 migration 032.
    const crop = await images.persistFinal(scope, 'f5a2-crop-regression', 'crop', {
      width: f4.width, height: f4.height, data: refinementPixels,
    }, { sourceImageStorageId: anchor.projectImageStorageId, producerOperation: 'CROP' });
    assert.equal(crop.producerOperation, 'CROP');
    assert.equal(crop.refinementParentStorageId, undefined);

    // Schema checker must detect a disabled lineage guard and migration must repair it.
    await pool.query('ALTER TABLE canonical_image_artifacts DISABLE TRIGGER canonical_image_artifacts_fashion_refinement_insert_guard');
    await assert.rejects(checkGarmentAppearanceRefinementFinalLineageSchema(pool), /triggers are incomplete|drifted|disabled/i);
    await migrateGarmentAppearanceRefinementFinalLineageSchema(pool);
    await checkGarmentAppearanceRefinementFinalLineageSchema(pool);
    const loaded = await images.load(first.storageId, scope);
    assert.equal(loaded?.refinementParentStorageId, f4.storageId);
  } finally {
    await pool.end();
  }
});
