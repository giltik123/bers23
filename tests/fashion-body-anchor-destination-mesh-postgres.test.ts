import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';
import { migrateProjectBodyAnchorSchema } from '../server/core/fashion/bodyAnchorSchema.ts';
import {
  BODY_ANCHOR_COORDINATE_SPACE,
  bodyAnchorPayloadSha256,
  deriveDestinationGarmentMesh,
} from '../server/core/fashion/bodyAnchorGeometry.ts';
import { PostgresProjectBodyAnchorStore } from '../server/core/fashion/postgresProjectBodyAnchorStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F4b.3 body-anchor acceptance');

const owner = Object.freeze({ tenantId: 'f4b3-tenant-a', userId: 'f4b3-user-a' });
const foreignOwner = Object.freeze({ tenantId: 'f4b3-tenant-a', userId: 'f4b3-user-b' });
const garmentLimits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 600, maxPixels: 400_000 });
const projectLimits = Object.freeze({ maxDimension: 1200, maxPixels: 1_500_000 });
const fixedAnchorId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function anchors(overrides: Record<string, readonly [number, number]> = {}) {
  return Object.freeze({
    schemaVersion: 1,
    coordinateSpace: BODY_ANCHOR_COORDINATE_SPACE,
    anchors: Object.freeze({
      leftShoulder: Object.freeze([0.2, 0.1] as const),
      rightShoulder: Object.freeze([0.8, 0.1] as const),
      leftHip: Object.freeze([0.25, 0.8] as const),
      rightHip: Object.freeze([0.75, 0.8] as const),
      ...overrides,
    }),
  });
}
function parametricPayload() {
  return Object.freeze({
    schemaVersion: 1,
    coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
    points: Object.freeze([
      Object.freeze([0, 0] as const), Object.freeze([1, 0] as const),
      Object.freeze([1, 1] as const), Object.freeze([0, 1] as const),
    ]),
    triangles: Object.freeze([Object.freeze([0, 1, 2] as const), Object.freeze([0, 2, 3] as const)]),
    outline: Object.freeze([0, 1, 2, 3]),
  });
}
async function image(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 120, height: 160, channels: 4, background: { r: 30 + seed, g: 70 + seed, b: 120 + seed, alpha: 1 } },
  }).png().toBuffer());
}
function expectCode(code: string, status: number) {
  return (cause: any): boolean => {
    assert.equal(cause?.code, code);
    assert.equal(cause?.status, status);
    return true;
  };
}

test('F4b.3 destination mesh has a stable Q16 reference vector and rejects local inversion', () => {
  const provenance = Object.freeze({
    anchorSetId: '11111111-1111-4111-8111-111111111111',
    projectId: '22222222-2222-4222-8222-222222222222',
    projectImageStorageId: '33333333-3333-4333-8333-333333333333',
    projectImageSha256: '1'.repeat(64), projectImageWidth: 640, projectImageHeight: 960,
    anchorPayloadSha256: '2'.repeat(64),
    garmentId: '44444444-4444-4444-8444-444444444444',
    representationId: '55555555-5555-4555-8555-555555555555',
    representationContentSha256: '3'.repeat(64), garmentCategory: 'tshirts' as const,
  });
  const mesh = deriveDestinationGarmentMesh({
    anchorPayload: anchors(), garmentCategory: 'tshirts', sourcePoints: parametricPayload().points,
    triangles: parametricPayload().triangles, provenance,
  });
  assert.deepEqual(mesh.sourcePointsQ16, [[0, 0], [65536, 0], [65536, 65536], [0, 65536]]);
  assert.deepEqual(mesh.destinationPointsQ16, [[13107, 6554], [52429, 6554], [49152, 52429], [16384, 52429]]);
  assert.deepEqual(mesh.triangles, [[0, 1, 2], [0, 2, 3]]);
  assert.equal(mesh.meshSha256, '3230c12e1d3f818a6f0771d69b876c5aa1960ef22a32d0b7a53c0854a9feef32');

  assert.throws(() => deriveDestinationGarmentMesh({
    anchorPayload: anchors({ leftHip: [0.8, 0.8], rightHip: [0.2, 0.8] }), garmentCategory: 'tshirts',
    sourcePoints: parametricPayload().points, triangles: parametricPayload().triangles, provenance,
  }), (cause: any) => cause?.code === 'body_anchor_destination_geometry_invalid');
  assert.throws(() => deriveDestinationGarmentMesh({
    anchorPayload: anchors(), garmentCategory: 'hats', sourcePoints: parametricPayload().points,
    triangles: parametricPayload().triangles, provenance: Object.freeze({ ...provenance, garmentCategory: 'hats' as const }),
  }), (cause: any) => cause?.code === 'body_anchor_category_unsupported');
});

test('F4b.3 PostgreSQL body anchors bind exact Project evidence and derive replayable admitted Garment geometry', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 5, application_name: 'bers-f4b3-body-anchors' });
  try {
    await migrateProjectBodyAnchorSchema(pool);
    const projects = new PostgresProjectStore(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);

    const project = await projects.create(owner, 'F4b.3 person evidence', await image(1), projectLimits);
    const projectId = String(project.project_id).toLowerCase();

    let garment = await garments.createWithInitialView(owner, {
      name: 'F4b.3 shirt', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: await image(2),
    }, garmentLimits);
    await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category: 'tshirts' });
    garment = (await garments.get(owner, garment.id))!;
    const admitted = await representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0',
      sourceViewIds: [garment.primaryViewId], payload: parametricPayload(),
    });

    const anchorStore = new PostgresProjectBodyAnchorStore(pool, undefined, () => fixedAnchorId);
    const anchorSet = await anchorStore.create(owner, projectId, {
      payload: anchors(), producerId: 'local.pose-anchor', producerVersion: '1.0.0',
    });
    assert.equal(anchorSet.id, fixedAnchorId);
    assert.equal(anchorSet.projectId, projectId);
    assert.equal(anchorSet.schemaId, 'BERS_BODY_ANCHORS_V1');
    assert.equal(anchorSet.coordinateSpace, BODY_ANCHOR_COORDINATE_SPACE);
    assert.equal(anchorSet.payloadSha256, bodyAnchorPayloadSha256(anchors()));
    assert.match(anchorSet.projectImageSha256, /^[0-9a-f]{64}$/);

    const first = await anchorStore.deriveDestinationMesh(owner, projectId, anchorSet.id, garment.id, admitted.representation.id);
    const second = await new PostgresProjectBodyAnchorStore(pool).deriveDestinationMesh(owner, projectId, anchorSet.id, garment.id, admitted.representation.id);
    assert.deepEqual(second, first, 'restart/replay must reproduce the same destination mesh and hash');
    assert.deepEqual(first.destinationPointsQ16, [[13107, 6554], [52429, 6554], [49152, 52429], [16384, 52429]]);
    assert.equal(first.provenance.projectImageStorageId, anchorSet.projectImageStorageId);
    assert.equal(first.provenance.projectImageSha256, anchorSet.projectImageSha256);
    assert.equal(first.provenance.representationContentSha256, admitted.representation.contentSha256);
    assert.equal(first.provenance.anchorPayloadSha256, anchorSet.payloadSha256);
    assert.match(first.meshSha256, /^[0-9a-f]{64}$/);

    await assert.rejects(
      anchorStore.deriveDestinationMesh(foreignOwner, projectId, anchorSet.id, garment.id, admitted.representation.id),
      expectCode('body_anchor_set_not_found', 404),
    );
    await assert.rejects(
      anchorStore.deriveDestinationMesh(owner, randomUUID(), anchorSet.id, garment.id, admitted.representation.id),
      expectCode('body_anchor_set_not_found', 404),
    );

    await assert.rejects(
      pool.query(`UPDATE canonical_project_body_anchor_sets SET producer_version='tampered' WHERE anchor_set_id=$1`, [anchorSet.id]),
      /immutable/i,
      'canonical anchor evidence must not be rewritten after issuance',
    );

    const maliciousId = randomUUID().toLowerCase();
    await pool.query(`INSERT INTO canonical_project_body_anchor_sets
      (anchor_set_id,tenant_id,user_id,project_id,project_image_storage_id,project_image_sha256,project_image_width,project_image_height,
       schema_id,coordinate_space,anchor_payload,anchor_payload_sha256,producer_id,producer_version)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'BERS_BODY_ANCHORS_V1','PROJECT_IMAGE_NORMALIZED',$9::jsonb,$10,'hostile.fixture','1')`, [
      maliciousId, owner.tenantId, owner.userId, projectId, anchorSet.projectImageStorageId, '0'.repeat(64),
      anchorSet.projectImageWidth, anchorSet.projectImageHeight, JSON.stringify(anchors()), bodyAnchorPayloadSha256(anchors()),
    ]);
    await assert.rejects(
      anchorStore.deriveDestinationMesh(owner, projectId, maliciousId, garment.id, admitted.representation.id),
      expectCode('body_anchor_project_evidence_stale', 409),
      'Project bytes are rehashed instead of trusting a stored/client hash',
    );

    const missingStore = new PostgresProjectBodyAnchorStore(pool);
    const missing = await missingStore.create(owner, projectId, {
      payload: Object.freeze({ schemaVersion: 1, coordinateSpace: BODY_ANCHOR_COORDINATE_SPACE, anchors: Object.freeze({
        leftShoulder: [0.2, 0.1], rightShoulder: [0.8, 0.1], leftWaist: [0.3, 0.6], rightWaist: [0.7, 0.6],
      }) }),
      producerId: 'local.pose-anchor', producerVersion: '1.0.0',
    });
    await assert.rejects(
      missingStore.deriveDestinationMesh(owner, projectId, missing.id, garment.id, admitted.representation.id),
      expectCode('body_anchor_required_anchor_missing', 409),
    );

    const inverted = await missingStore.create(owner, projectId, {
      payload: anchors({ leftHip: [0.8, 0.8], rightHip: [0.2, 0.8] }),
      producerId: 'local.pose-anchor', producerVersion: '1.0.0',
    });
    await assert.rejects(
      missingStore.deriveDestinationMesh(owner, projectId, inverted.id, garment.id, admitted.representation.id),
      expectCode('body_anchor_destination_geometry_invalid', 409),
    );

    const replacementStorageId = randomUUID().toLowerCase();
    const replacementBytes = await image(9);
    await pool.query(`INSERT INTO canonical_image_artifacts
      (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes)
      VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9)`, [
      replacementStorageId, owner.tenantId, owner.userId, projectId, randomUUID(), 'F4B3_STALE_EVIDENCE_FIXTURE',
      anchorSet.projectImageWidth, anchorSet.projectImageHeight, Buffer.from(replacementBytes),
    ]);
    await pool.query(`UPDATE canonical_projects SET current_image_storage_id=$2,updated_at=CURRENT_TIMESTAMP WHERE project_id=$1`, [projectId, replacementStorageId]);
    await assert.rejects(
      anchorStore.deriveDestinationMesh(owner, projectId, anchorSet.id, garment.id, admitted.representation.id),
      expectCode('body_anchor_project_evidence_stale', 409),
      'undo/redo/Accept-equivalent Project cursor changes must invalidate old person evidence',
    );
  } finally {
    await pool.end();
  }
});
