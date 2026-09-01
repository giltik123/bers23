import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
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
import { migrateGarmentAppearanceRefinementFinalLineageSchema } from '../server/core/fashion/garmentAppearanceRefinementFinalLineageSchema.ts';
import { BODY_ANCHOR_COORDINATE_SPACE } from '../server/core/fashion/bodyAnchorGeometry.ts';
import {
  GARMENT_APPEARANCE_REFINEMENT_CONTRACT_VERSION,
  GARMENT_APPEARANCE_REFINEMENT_OPERATION,
  GARMENT_APPEARANCE_REFINEMENT_PROFILE,
} from '../src/platform/creative/deterministic/GarmentAppearanceRefinementIdentity.js';
import {
  GARMENT_TEXTURE_COMPOSITE_ALPHA_POLICY,
  GARMENT_TEXTURE_COMPOSITE_COLOR_SPACE_POLICY,
  GARMENT_TEXTURE_COMPOSITE_FIXED_POINT_ONE,
  GARMENT_TEXTURE_COMPOSITE_SCHEMA,
  GARMENT_TEXTURE_COMPOSITE_WRAP_MODE,
} from '../src/platform/creative/deterministic/GarmentTextureComposite.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F5a.3 refinement persistence acceptance');

const owner = Object.freeze({ tenantId: 'f5a3-tenant-a', userId: 'f5a3-user-a' });
const garmentLimits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 600, maxPixels: 400_000 });
const projectLimits = Object.freeze({ maxDimension: 1200, maxPixels: 1_500_000 });

async function png(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 120, height: 160, channels: 4, background: { r: 25 + seed, g: 65 + seed, b: 115 + seed, alpha: 1 } },
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
function rgba(width: number, height: number, seed: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < out.length; index += 4) {
    out[index] = (index / 4 + seed) % 251;
    out[index + 1] = (seed * 3) % 251;
    out[index + 2] = (seed * 7) % 251;
    out[index + 3] = 255;
  }
  return out;
}
function textureParameters() {
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

test('F5a.3 persists exact dual-bound refinement FINAL, replays across Accept and resolves only deterministic F4 as immediate parent', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8, application_name: 'bers-f5a3-refinement-persistence' });
  try {
    await migrateFinalImageLineageSchema(pool);
    await migrateProjectSchema(pool);
    await migrateGarmentSchema(pool);
    await migrateProjectBodyAnchorSchema(pool);
    await migrateGarmentWarpLayerSchema(pool);
    await migrateGarmentTextureFinalLineageSchema(pool);
    await migrateGarmentAppearanceRefinementFinalLineageSchema(pool);

    const projects = new PostgresProjectStore(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    const images = new PostgresImageArtifactStore(pool);
    const masks = new PostgresMaskArtifactStore(pool);

    const project = await projects.create(owner, 'F5a.3 person', await png(1), projectLimits);
    const projectId = String(project.project_id).toLowerCase();
    const scope = Object.freeze({ ...owner, projectId });

    let garment = await garments.createWithInitialView(owner, {
      name: 'F5a.3 shirt',
      viewKind: 'FRONT',
      sourceContentType: 'image/png',
      bytes: await png(2),
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
      executionId: 'f5a3-warp-execution',
      ticketId: 'f5a3-warp-ticket',
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

    const deterministic = await images.persistFinal(scope, 'f5a3-f4-execution', 'garment-texture-composite', {
      width: anchor.projectImageWidth,
      height: anchor.projectImageHeight,
      data: rgba(anchor.projectImageWidth, anchor.projectImageHeight, 11),
    }, {
      sourceImageStorageId: anchor.projectImageStorageId,
      producerOperation: 'GARMENT_TEXTURE_COMPOSITE',
      garmentWarpLayerId: layer.id,
      garmentWarpLayerSha256: layer.contentSha256,
      producerParameters: textureParameters(),
    });
    const parentSha = createHash('sha256').update(deterministic.bytes).digest('hex');
    const refinementLineage = Object.freeze({
      sourceImageStorageId: anchor.projectImageStorageId,
      producerOperation: GARMENT_APPEARANCE_REFINEMENT_OPERATION as 'GARMENT_APPEARANCE_REFINEMENT',
      refinementParentImageStorageId: deterministic.storageId,
      refinementParentImageSha256: parentSha,
      refinementProfile: GARMENT_APPEARANCE_REFINEMENT_PROFILE as 'REFINE_REALISM_V1',
      refinementContractVersion: GARMENT_APPEARANCE_REFINEMENT_CONTRACT_VERSION as '1',
    });
    const candidate = rgba(anchor.projectImageWidth, anchor.projectImageHeight, 17);

    const refined = await images.persistFinal(scope, 'f5a3-refinement-execution', 'garment-appearance-refinement', {
      width: anchor.projectImageWidth,
      height: anchor.projectImageHeight,
      data: candidate,
    }, refinementLineage);
    assert.equal(refined.sourceImageStorageId, anchor.projectImageStorageId);
    assert.equal(refined.producerOperation, 'GARMENT_APPEARANCE_REFINEMENT');
    assert.equal(refined.refinementParentImageStorageId, deterministic.storageId);
    assert.equal(refined.refinementParentImageSha256, parentSha);
    assert.equal(refined.refinementProfile, 'REFINE_REALISM_V1');
    assert.equal(refined.refinementContractVersion, '1');
    assert.equal(refined.garmentWarpLayerId, undefined);
    assert.equal(refined.producerParameters, undefined);

    const replay = await new PostgresImageArtifactStore(pool).persistFinal(
      scope,
      'f5a3-refinement-execution',
      'garment-appearance-refinement',
      { width: anchor.projectImageWidth, height: anchor.projectImageHeight, data: candidate },
      refinementLineage,
    );
    assert.equal(replay.storageId, refined.storageId, 'exact F5 replay must reuse one canonical FINAL before Accept');

    const divergent = Uint8ClampedArray.from(candidate);
    divergent[0] ^= 0xff;
    await assert.rejects(
      images.persistFinal(scope, 'f5a3-refinement-execution', 'garment-appearance-refinement', {
        width: anchor.projectImageWidth, height: anchor.projectImageHeight, data: divergent,
      }, refinementLineage),
      /already bound to a different FINAL or parent lineage/i,
    );
    await assert.rejects(
      images.persistFinal(scope, 'f5a3-bad-parent-sha', 'garment-appearance-refinement', {
        width: anchor.projectImageWidth, height: anchor.projectImageHeight, data: candidate,
      }, { ...refinementLineage, refinementParentImageSha256: '0'.repeat(64) }),
      /stale|cross-scope|deterministic F4 parent|violates|lineage/i,
    );

    const signed = new SignedArtifactAuthority('f5a3-artifact-secret', []);
    const resolver = new DurableArtifactLineageResolver({ signed, images, masks });
    const f5ArtifactId = signed.issueStoredFinal(refined.storageId, scope);
    const f4ArtifactId = signed.issueStoredFinal(deterministic.storageId, scope);
    const resolvedF5 = await resolver.resolve(scope, f5ArtifactId);
    assert.deepEqual(resolvedF5.parentArtifactIds, [f4ArtifactId], 'F5 immediate Artifact parent must be deterministic F4 FINAL only');

    const resolvedF4 = await resolver.resolve(scope, f4ArtifactId);
    const source = await images.loadSource(anchor.projectImageStorageId, scope);
    assert.ok(source);
    const sourceArtifactId = source.role === 'ORIGINAL'
      ? signed.issueStoredOriginal(source.storageId, scope)
      : signed.issueStoredFinal(source.storageId, scope);
    assert.deepEqual(resolvedF4.parentArtifactIds, [sourceArtifactId], 'Project source remains transitive through deterministic F4 parent');

    // Review gate: a refinement that became invalid after persistence must not be
    // accepted. Project Accept holds the Project row lock and invokes the same
    // Artifact/Fashion lineage validation before moving the source cursor.
    const originalParentBytes = Buffer.from(deterministic.bytes);
    await pool.query(`UPDATE canonical_image_artifacts SET image_bytes=$2 WHERE storage_id=$1`, [deterministic.storageId, Buffer.from(await png(9))]);
    await assert.rejects(images.load(refined.storageId, scope), /deterministic parent evidence is unavailable or inconsistent/i);
    await assert.rejects(resolver.resolve(scope, f5ArtifactId), /deterministic parent evidence is unavailable or inconsistent/i);
    await assert.rejects(
      projects.acceptFinal(owner, projectId, refined.storageId, 'Must reject invalid F5 lineage'),
      (error: any) => error?.status === 409 && error?.code === 'invalid_final_lineage',
    );
    const afterRejectedAccept = await projects.get(owner, projectId);
    assert.equal(afterRejectedAccept?.current_image_storage_id, anchor.projectImageStorageId, 'rejected F5 Accept must not move Project cursor');

    await pool.query(`UPDATE canonical_image_artifacts SET image_bytes=$2 WHERE storage_id=$1`, [deterministic.storageId, originalParentBytes]);
    const recovered = await images.load(refined.storageId, scope);
    assert.equal(recovered?.storageId, refined.storageId, 'restored exact parent bytes recover historical F5 readability');

    await projects.acceptFinal(owner, projectId, refined.storageId, 'Accept valid F5 refinement');
    const acceptedProject = await projects.get(owner, projectId);
    assert.equal(acceptedProject?.current_image_storage_id, refined.storageId, 'valid F5 Accept must advance Project cursor exactly once');

    // Critical restart/recovery law: after Accept the Project source cursor now
    // points at the refined FINAL, but the same durable F5 execution must replay
    // exactly without attempting a new INSERT/current-source trigger.
    const replayAfterAccept = await new PostgresImageArtifactStore(pool).persistFinal(
      scope,
      'f5a3-refinement-execution',
      'garment-appearance-refinement',
      { width: anchor.projectImageWidth, height: anchor.projectImageHeight, data: candidate },
      refinementLineage,
    );
    assert.equal(replayAfterAccept.storageId, refined.storageId, 'exact F5 replay must survive Project Accept source transition');
    assert.deepEqual(replayAfterAccept.bytes, refined.bytes, 'post-Accept exact replay must preserve canonical PNG bytes');

    await assert.rejects(
      images.persistFinal(scope, 'f5a3-refinement-execution', 'garment-appearance-refinement', {
        width: anchor.projectImageWidth, height: anchor.projectImageHeight, data: divergent,
      }, refinementLineage),
      /already bound to a different FINAL or parent lineage/i,
      'post-Accept divergent replay must remain fail-closed',
    );

    // Repeating Accept for an already accepted history entry remains an idempotent
    // no-op and does not create duplicate history or require a new execution.
    await projects.acceptFinal(owner, projectId, refined.storageId, 'Idempotent repeat');
    const finalState = await projects.state(owner, projectId);
    assert.equal(finalState.history.filter((entry: any) => entry.image_storage_id === refined.storageId && entry.kind === 'ACCEPTED_FINAL').length, 1);
  } finally {
    await pool.end();
  }
});