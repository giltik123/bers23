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
import {
  checkGarmentTextureFinalLineageSchema,
  migrateGarmentTextureFinalLineageSchema,
} from '../server/core/fashion/garmentTextureFinalLineageSchema.ts';
import { normalizeGarmentTextureFinalLineageParameters } from '../server/core/fashion/garmentTextureFinalLineage.ts';
import { BODY_ANCHOR_COORDINATE_SPACE } from '../server/core/fashion/bodyAnchorGeometry.ts';
import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
} from '../src/platform/creative/deterministic/GarmentTextureComposite.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F4b.5b.1 Fashion FINAL lineage acceptance');

const owner = Object.freeze({ tenantId: 'f4b5b1-tenant-a', userId: 'f4b5b1-user-a' });
const garmentLimits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 600, maxPixels: 400_000 });
const projectLimits = Object.freeze({ maxDimension: 1200, maxPixels: 1_500_000 });

async function image(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 120, height: 160, channels: 4, background: { r: 30 + seed, g: 70 + seed, b: 120 + seed, alpha: 1 } },
  }).png().toBuffer());
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

test('F4b.5b.1 canonical Fashion FINAL lineage is exact, replay-safe and Artifact-parent clean', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-f4b5b1-final-lineage' });
  try {
    await migrateFinalImageLineageSchema(pool);
    await migrateProjectSchema(pool);
    await migrateGarmentSchema(pool);
    await migrateProjectBodyAnchorSchema(pool);
    await migrateGarmentWarpLayerSchema(pool);
    await migrateGarmentTextureFinalLineageSchema(pool);
    await checkGarmentTextureFinalLineageSchema(pool);

    const projects = new PostgresProjectStore(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    const images = new PostgresImageArtifactStore(pool);
    const masks = new PostgresMaskArtifactStore(pool);

    const project = await projects.create(owner, 'F4b.5b.1 person', await image(1), projectLimits);
    const projectId = String(project.project_id).toLowerCase();
    const scope = Object.freeze({ ...owner, projectId });

    let garment = await garments.createWithInitialView(owner, {
      name: 'F4b.5b.1 shirt',
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
      executionId: 'f4b5b1-warp-execution',
      ticketId: 'f4b5b1-warp-ticket',
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

    const params = producerParameters();
    const normalizedParams = normalizeGarmentTextureFinalLineageParameters(params);
    const output = new Uint8ClampedArray(rgba(anchor.projectImageWidth, anchor.projectImageHeight, 11));
    const lineage = Object.freeze({
      sourceImageStorageId: anchor.projectImageStorageId,
      producerOperation: 'GARMENT_TEXTURE_COMPOSITE' as const,
      garmentWarpLayerId: layer.id,
      garmentWarpLayerSha256: layer.contentSha256,
      producerParameters: params,
    });

    const first = await images.persistFinal(scope, 'f4b5b1-final-execution', 'garment-texture-composite', {
      width: anchor.projectImageWidth,
      height: anchor.projectImageHeight,
      data: output,
    }, lineage);
    assert.equal(first.sourceImageStorageId, anchor.projectImageStorageId);
    assert.equal(first.maskStorageId, undefined);
    assert.equal(first.producerOperation, 'GARMENT_TEXTURE_COMPOSITE');
    assert.equal(first.garmentWarpLayerId, layer.id);
    assert.equal(first.garmentWarpLayerSha256, layer.contentSha256);
    assert.deepEqual(first.producerParameters, normalizedParams.document);
    assert.equal(first.producerParametersSha256, normalizedParams.sha256);

    const replayStore = new PostgresImageArtifactStore(pool);
    const replay = await replayStore.persistFinal(scope, 'f4b5b1-final-execution', 'garment-texture-composite', {
      width: anchor.projectImageWidth,
      height: anchor.projectImageHeight,
      data: output,
    }, lineage);
    assert.equal(replay.storageId, first.storageId, 'exact replay must reuse one canonical FINAL');
    assert.equal(replay.producerParametersSha256, first.producerParametersSha256);

    await assert.rejects(
      images.persistFinal(scope, 'f4b5b1-bad-layer-hash', 'garment-texture-composite', {
        width: anchor.projectImageWidth, height: anchor.projectImageHeight, data: output,
      }, { ...lineage, garmentWarpLayerSha256: '0'.repeat(64) }),
      /foreign key|stale|lineage|evidence/i,
    );

    await assert.rejects(
      images.persistFinal(scope, 'f4b5b1-bad-params', 'garment-texture-composite', {
        width: anchor.projectImageWidth, height: anchor.projectImageHeight, data: output,
      }, { ...lineage, producerParameters: { ...params, unexpected: true } as any }),
      /unknown or missing fields/i,
    );

    const secondProject = await projects.create(owner, 'F4b.5b.1 other person', await image(3), projectLimits);
    const crossScope = Object.freeze({ ...owner, projectId: String(secondProject.project_id).toLowerCase() });
    await assert.rejects(
      images.persistFinal(crossScope, 'f4b5b1-cross-project', 'garment-texture-composite', {
        width: anchor.projectImageWidth, height: anchor.projectImageHeight, data: output,
      }, lineage),
      /stale|cross-scope|canonical Project source|violates/i,
    );

    const signed = new SignedArtifactAuthority('f4b5b1-artifact-secret', []);
    const resolver = new DurableArtifactLineageResolver({ signed, images, masks });
    const resolved = await resolver.resolve(scope, signed.issueStoredFinal(first.storageId, scope));
    const source = await images.loadSource(anchor.projectImageStorageId, scope);
    assert.ok(source);
    const sourceArtifactId = source.role === 'ORIGINAL'
      ? signed.issueStoredOriginal(source.storageId, scope)
      : signed.issueStoredFinal(source.storageId, scope);
    assert.deepEqual(resolved.parentArtifactIds, [sourceArtifactId], 'Fashion layer evidence must never masquerade as an Artifact parent');

    await assert.rejects(
      pool.query(`UPDATE canonical_image_artifacts SET garment_warp_layer_sha256=$2 WHERE storage_id=$1`, [first.storageId, '1'.repeat(64)]),
      /immutable/i,
    );

    const storedRow = await pool.query(`SELECT producer_parameters,producer_parameters_sha256 FROM canonical_image_artifacts WHERE storage_id=$1`, [first.storageId]);
    const originalDocument = storedRow.rows[0].producer_parameters;
    const originalSha = storedRow.rows[0].producer_parameters_sha256;

    await pool.query('ALTER TABLE canonical_image_artifacts DISABLE TRIGGER canonical_image_artifacts_fashion_texture_lineage_immutable_guard');
    await pool.query(`UPDATE canonical_image_artifacts SET producer_parameters_sha256=$2 WHERE storage_id=$1`, [first.storageId, '2'.repeat(64)]);
    await pool.query('ALTER TABLE canonical_image_artifacts ENABLE TRIGGER canonical_image_artifacts_fashion_texture_lineage_immutable_guard');
    await assert.rejects(images.load(first.storageId, scope), /producer-parameter SHA-256 mismatch/i);
    await pool.query('ALTER TABLE canonical_image_artifacts DISABLE TRIGGER canonical_image_artifacts_fashion_texture_lineage_immutable_guard');
    await pool.query(`UPDATE canonical_image_artifacts SET producer_parameters_sha256=$2 WHERE storage_id=$1`, [first.storageId, originalSha]);
    await pool.query('ALTER TABLE canonical_image_artifacts ENABLE TRIGGER canonical_image_artifacts_fashion_texture_lineage_immutable_guard');

    await pool.query('ALTER TABLE canonical_image_artifacts DROP CONSTRAINT canonical_image_artifacts_fashion_parameters_check');
    await pool.query('ALTER TABLE canonical_image_artifacts DISABLE TRIGGER canonical_image_artifacts_fashion_texture_lineage_immutable_guard');
    await pool.query(`UPDATE canonical_image_artifacts SET producer_parameters=producer_parameters || '{"unexpected":true}'::jsonb WHERE storage_id=$1`, [first.storageId]);
    await pool.query('ALTER TABLE canonical_image_artifacts ENABLE TRIGGER canonical_image_artifacts_fashion_texture_lineage_immutable_guard');
    await assert.rejects(images.load(first.storageId, scope), /unknown or missing fields/i);
    await pool.query('ALTER TABLE canonical_image_artifacts DISABLE TRIGGER canonical_image_artifacts_fashion_texture_lineage_immutable_guard');
    await pool.query(`UPDATE canonical_image_artifacts SET producer_parameters=$2 WHERE storage_id=$1`, [first.storageId, originalDocument]);
    await pool.query('ALTER TABLE canonical_image_artifacts ENABLE TRIGGER canonical_image_artifacts_fashion_texture_lineage_immutable_guard');
    await migrateGarmentTextureFinalLineageSchema(pool);
    await checkGarmentTextureFinalLineageSchema(pool);

    const crop = await images.persistFinal(scope, 'f4b5b1-crop-regression', 'crop', {
      width: anchor.projectImageWidth,
      height: anchor.projectImageHeight,
      data: output,
    }, { sourceImageStorageId: anchor.projectImageStorageId, producerOperation: 'CROP' });
    assert.equal(crop.producerOperation, 'CROP');
    assert.equal(crop.garmentWarpLayerId, undefined);
    assert.equal(crop.producerParameters, undefined);
  } finally {
    await pool.end();
  }
});
