import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { assessManagedGarmentCapture } from '../server/core/fashion/garmentCaptureAssessment.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for managed Garment representation acceptance');

const owner = Object.freeze({ tenantId: 'fashion-representation-tenant-a', userId: 'fashion-representation-user-a' });
const otherUser = Object.freeze({ tenantId: 'fashion-representation-tenant-a', userId: 'fashion-representation-user-b' });
const limits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 600, maxPixels: 400_000 });

async function image(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 520, height: 520, channels: 4, background: { r: 20 + seed, g: 70 + seed, b: 120 + seed, alpha: 1 } },
  }).png().toBuffer());
}

async function reset(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS
    canonical_garment_representation_sources,
    canonical_garment_representations,
    canonical_outfit_entries,
    canonical_outfits,
    canonical_garment_collection_members,
    canonical_garment_collections,
    canonical_garment_tags,
    canonical_garment_views,
    canonical_garments
    CASCADE`);
  await migrateGarmentSchema(pool);
}

async function expectCode(promise: Promise<unknown>, code: string, status?: number): Promise<void> {
  await assert.rejects(promise, (cause: any) => {
    assert.equal(cause?.code, code);
    if (status !== undefined) assert.equal(cause?.status, status);
    return true;
  });
}

function parametricVariant(delta = 0): unknown {
  return {
    schemaVersion: 1,
    coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
    points: [[0.1 + delta, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
    triangles: [[0, 1, 2], [0, 2, 3]],
    outline: [0, 1, 2, 3],
  };
}

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

function minimalGlb(): Uint8Array {
  const positions = Buffer.alloc(36);
  const values = [0, 0, 0, 1, 0, 0, 0, 1, 0];
  values.forEach((value, index) => positions.writeFloatLE(value, index * 4));
  const document = {
    asset: { version: '2.0', generator: 'BERS F4a test fixture' },
    buffers: [{ byteLength: positions.byteLength }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }],
    accessors: [{ bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: 'VEC3' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, mode: 4 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  const rawJson = Buffer.from(JSON.stringify(document), 'utf8');
  const jsonPadding = (4 - (rawJson.byteLength % 4)) % 4;
  const json = Buffer.concat([rawJson, Buffer.alloc(jsonPadding, 0x20)]);
  const binPadding = (4 - (positions.byteLength % 4)) % 4;
  const bin = Buffer.concat([positions, Buffer.alloc(binPadding)]);
  const total = 12 + 8 + json.byteLength + 8 + bin.byteLength;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(json.byteLength, 12);
  out.writeUInt32LE(0x4e4f534a, 16);
  json.copy(out, 20);
  const binHeader = 20 + json.byteLength;
  out.writeUInt32LE(bin.byteLength, binHeader);
  out.writeUInt32LE(0x004e4942, binHeader + 4);
  bin.copy(out, binHeader + 8);
  return new Uint8Array(out);
}

async function createGarment(
  garments: PostgresGarmentStore,
  wardrobe: PostgresGarmentWardrobeStore,
  scope: Readonly<{ tenantId: string; userId: string }> = owner,
  name = 'Representation garment',
  category: 'tshirts' | 'jackets' = 'tshirts',
): Promise<Readonly<{ id: string; revision: number; primaryViewId: string }>> {
  const created = await garments.createWithInitialView(scope, {
    name,
    viewKind: 'FRONT',
    sourceContentType: 'image/png',
    bytes: await image(1),
  }, limits);
  const classified = await wardrobe.updateMetadata(scope, created.id, created.revision, { category });
  return Object.freeze({ id: created.id, revision: classified.revision, primaryViewId: created.primaryViewId });
}

test('F4a admits immutable evidence-backed representations and keeps representation_tier derived', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);

    let garment = await garments.createWithInitialView(owner, {
      name: 'Four-view jacket', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: await image(2),
    }, limits);
    assert.equal(garment.representationTier, 'BASIC');

    for (const [kind, seed] of [['BACK', 3], ['LEFT', 4], ['RIGHT', 5], ['DETAIL', 6]] as const) {
      garment = await garments.appendView(owner, garment.id, garment.revision, {
        viewKind: kind, sourceContentType: 'image/png', bytes: await image(seed),
      }, limits);
    }
    const assessment = assessManagedGarmentCapture(garment);
    assert.equal(assessment.cardinalComplete, true);
    assert.equal(assessment.technicalResolution.status, 'ADEQUATE');
    assert.equal(assessment.semanticQuality, 'NOT_ASSESSED');
    assert.equal(garment.representationTier, 'BASIC', 'capture evidence alone must never promote representation tier');

    const cardinalIds = garment.views.filter(view => ['FRONT', 'BACK', 'LEFT', 'RIGHT'].includes(view.kind)).map(view => view.id);
    const backId = garment.views.find(view => view.kind === 'BACK')!.id;
    const detail = garment.views.find(view => view.kind === 'DETAIL')!;

    await expectCode(representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0', sourceViewIds: cardinalIds, payload: parametricVariant(),
    }), 'garment_representation_category_requires_classification', 409);
    assert.equal((await garments.get(owner, garment.id))?.revision, garment.revision);
    assert.equal((await garments.get(owner, garment.id))?.representationTier, 'BASIC');

    const metadata = await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category: 'jackets' });
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.revision, metadata.revision);

    await assert.rejects(
      pool.query(`UPDATE canonical_garments SET representation_tier='FULL_3D' WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3`,
        [garment.id, owner.tenantId, owner.userId]),
      /derived summary|representation_tier/i,
    );
    assert.equal((await garments.get(owner, garment.id))?.representationTier, 'BASIC');

    await expectCode(representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0', sourceViewIds: [backId], payload: parametricVariant(),
    }), 'garment_representation_basis_view_required', 409);

    const foreign = await createGarment(garments, wardrobe, otherUser, 'Foreign shirt');
    await expectCode(representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0', sourceViewIds: [garment.primaryViewId, foreign.primaryViewId], payload: parametricVariant(),
    }), 'garment_representation_source_unavailable', 409);
    const sibling = await createGarment(garments, wardrobe, owner, 'Sibling shirt');
    await expectCode(representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1.0.0', sourceViewIds: [garment.primaryViewId, sibling.primaryViewId], payload: parametricVariant(),
    }), 'garment_representation_source_unavailable', 409);
    assert.equal((await garments.get(owner, garment.id))?.revision, garment.revision);

    const admitted = await representations.admit(owner, garment.id.toUpperCase(), garment.revision, {
      tier: 'PARAMETRIC', generatorId: ' local.mesh-fit ', generatorVersion: ' 1.0.0 ', sourceViewIds: cardinalIds.map(id => id.toUpperCase()), payload: parametricVariant(),
    });
    assert.equal(admitted.garmentRevision, garment.revision + 1);
    assert.equal(admitted.representationTier, 'PARAMETRIC');
    assert.equal(admitted.representation.tier, 'PARAMETRIC');
    assert.equal(admitted.representation.basisViewId, garment.primaryViewId);
    assert.equal(admitted.representation.sources.length, 4);
    assert.deepEqual(admitted.representation.sources.map(source => source.viewId), cardinalIds);
    const currentViews = new Map(garment.views.map(view => [view.id, view.contentSha256]));
    for (const source of admitted.representation.sources) assert.equal(source.contentSha256, currentViews.get(source.viewId));
    const canonicalPayload = await representations.loadPayload(owner, garment.id, admitted.representation.id);
    assert.ok(canonicalPayload);
    assert.equal(canonicalPayload!.contentSha256, admitted.representation.contentSha256);
    assert.equal(sha256(canonicalPayload!.bytes), admitted.representation.contentSha256);
    assert.equal(JSON.parse(new TextDecoder().decode(canonicalPayload!.bytes)).schemaVersion, 1);
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.representationTier, 'PARAMETRIC');

    await expectCode(representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '2.0.0', sourceViewIds: cardinalIds, payload: parametricVariant(),
    }), 'garment_representation_duplicate_content', 409);
    await expectCode(representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '2.0.0', sourceViewIds: cardinalIds,
      payload: { ...parametricVariant() as any, triangles: [[0, 1, 1]] },
    }), 'invalid_garment_parametric_representation', 400);
    assert.equal((await garments.get(owner, garment.id))?.revision, garment.revision);

    await assert.rejects(pool.query(`UPDATE canonical_garment_representations SET generator_version='tampered'
      WHERE representation_id=$1`, [admitted.representation.id]), /immutable/i);
    await assert.rejects(pool.query(`UPDATE canonical_garment_representation_sources SET source_position=source_position
      WHERE representation_id=$1`, [admitted.representation.id]), /immutable/i);
    await assert.rejects(pool.query(`DELETE FROM canonical_garment_representations WHERE representation_id=$1`, [admitted.representation.id]), /revoke instead|immutable/i);
    await assert.rejects(pool.query(`INSERT INTO canonical_garment_representation_sources
      (representation_id,garment_id,tenant_id,user_id,source_position,view_id,source_content_sha256)
      VALUES ($1,$2,$3,$4,4,$5,$6)`, [admitted.representation.id, garment.id, owner.tenantId, owner.userId, detail.id, detail.contentSha256]),
    /source set|dense|exact-count|include basis/i);
    assert.equal((await representations.get(owner, garment.id, admitted.representation.id))?.sources.length, 4);

    const concurrentRevision = garment.revision;
    const concurrent = await Promise.allSettled([
      representations.admit(owner, garment.id, concurrentRevision, {
        tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '2.0.0-a', sourceViewIds: cardinalIds, payload: parametricVariant(0.01),
      }),
      representations.admit(owner, garment.id, concurrentRevision, {
        tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '2.0.0-b', sourceViewIds: cardinalIds, payload: parametricVariant(0.02),
      }),
    ]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    const concurrentFailure = concurrent.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal((concurrentFailure.reason as any)?.code, 'garment_revision_conflict');
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.revision, concurrentRevision + 1);
    assert.equal(garment.representationTier, 'PARAMETRIC');

    await expectCode(representations.admit(owner, garment.id, garment.revision, {
      tier: 'FULL_3D', generatorId: 'local.glb-builder', generatorVersion: '1', sourceViewIds: cardinalIds, bytes: new Uint8Array([1, 2, 3]),
    }), 'invalid_garment_glb_representation', 400);
    const full = await representations.admit(owner, garment.id, garment.revision, {
      tier: 'FULL_3D', generatorId: 'local.glb-builder', generatorVersion: '1', sourceViewIds: cardinalIds, bytes: minimalGlb(),
    });
    assert.equal(full.representationTier, 'FULL_3D');
    assert.equal(full.representation.validatorId, 'bers.glb-structural-validator');
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.representationTier, 'FULL_3D');

    let revoked = await representations.revoke(owner, garment.id, full.representation.id, garment.revision);
    assert.equal(revoked.representation.admissionState, 'REVOKED');
    assert.equal(revoked.representationTier, 'PARAMETRIC');
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.representationTier, 'PARAMETRIC');

    const parametrics = (await representations.list(owner, garment.id)).filter(rep => rep.tier === 'PARAMETRIC' && rep.admissionState === 'ADMITTED');
    assert.ok(parametrics.length >= 2);
    for (const [index, representation] of parametrics.entries()) {
      revoked = await representations.revoke(owner, garment.id, representation.id, garment.revision);
      garment = (await garments.get(owner, garment.id))!;
      assert.equal(revoked.garmentRevision, garment.revision);
      assert.equal(garment.representationTier, index === parametrics.length - 1 ? 'BASIC' : 'PARAMETRIC');
    }
    assert.equal(garment.representationTier, 'BASIC');

    await assert.rejects(pool.query(`UPDATE canonical_garment_representations SET admission_state='ADMITTED',revoked_at=NULL
      WHERE representation_id=$1`, [admitted.representation.id]), /cannot be re-admitted|revoked/i);

    const archivedBase = await createGarment(garments, wardrobe, owner, 'Archive jacket', 'jackets');
    const archivedAdmission = await representations.admit(owner, archivedBase.id, archivedBase.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '1', sourceViewIds: [archivedBase.primaryViewId], payload: parametricVariant(0.03),
    });
    const archivedMetadata = await wardrobe.archive(owner, archivedBase.id, archivedAdmission.garmentRevision);
    await expectCode(representations.admit(owner, archivedBase.id, archivedMetadata.revision, {
      tier: 'PARAMETRIC', generatorId: 'local.mesh-fit', generatorVersion: '2', sourceViewIds: [archivedBase.primaryViewId], payload: parametricVariant(0.04),
    }), 'garment_representation_garment_not_active', 409);
    const archivedRevoke = await representations.revoke(owner, archivedBase.id, archivedAdmission.representation.id, archivedMetadata.revision);
    assert.equal(archivedRevoke.representationTier, 'BASIC', 'revocation remains available as a safety action for archived Garments');
  } finally {
    await pool.end();
  }
});
