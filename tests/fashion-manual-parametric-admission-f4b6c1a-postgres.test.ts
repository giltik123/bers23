import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { Pool, type PoolClient } from 'pg';
import sharp from 'sharp';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { ManualParametricGarmentAdmissionService } from '../server/core/fashion/ManualParametricGarmentAdmissionService.ts';
import {
  MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID,
  MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION,
  canonicalManualParametricRepresentationBytes,
  produceManualParametricRepresentation,
} from '../server/core/fashion/manualParametricContour.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { ManagedGarmentLocalExecutionInputAuthority } from '../server/core/localExecution/ManagedGarmentLocalExecutionInputAuthority.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for manual PARAMETRIC admission acceptance');

const owner = Object.freeze({ tenantId: 'manual-parametric-tenant', userId: 'manual-parametric-user' });
const limits = Object.freeze({ maxUploadBytes: 2 * 1024 * 1024, maxDimension: 600, maxPixels: 400_000 });
const contour = Object.freeze({
  schemaVersion: 1 as const,
  coordinateSpace: 'PRIMARY_VIEW_NORMALIZED' as const,
  contour: Object.freeze([
    Object.freeze([0.12, 0.12] as const),
    Object.freeze([0.88, 0.12] as const),
    Object.freeze([0.82, 0.88] as const),
    Object.freeze([0.18, 0.88] as const),
  ]),
});

async function image(seed: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 480, height: 480, channels: 4, background: { r: 20 + seed, g: 80 + seed, b: 140 + seed, alpha: 1 } },
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

async function classifiedGarment(
  garments: PostgresGarmentStore,
  wardrobe: PostgresGarmentWardrobeStore,
  name: string,
) {
  const created = await garments.createWithInitialView(owner, {
    name,
    viewKind: 'FRONT',
    sourceContentType: 'image/png',
    bytes: await image(name.length),
  }, limits);
  await wardrobe.updateMetadata(owner, created.id, created.revision, { category: 'tshirts' });
  return (await garments.get(owner, created.id))!;
}

async function appendView(garments: PostgresGarmentStore, garmentId: string, revision: number, seed: number) {
  return garments.appendView(owner, garmentId, revision, {
    viewKind: 'DETAIL',
    sourceContentType: 'image/png',
    bytes: await image(seed),
  }, limits);
}

async function switchPrimary(
  client: PoolClient,
  garmentId: string,
  nextPrimaryViewId: string,
): Promise<number> {
  const locked = await client.query(`SELECT revision FROM canonical_garments
    WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND deleted_at IS NULL FOR UPDATE`,
  [garmentId, owner.tenantId, owner.userId]);
  assert.equal(locked.rowCount, 1);
  const revision = Number(locked.rows[0].revision);
  const updated = await client.query(`UPDATE canonical_garments
    SET primary_view_id=$4,revision=revision+1,updated_at=CURRENT_TIMESTAMP
    WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 AND revision=$5
    RETURNING revision`,
  [garmentId, owner.tenantId, owner.userId, nextPrimaryViewId, revision]);
  assert.equal(updated.rowCount, 1);
  return Number(updated.rows[0].revision);
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (cause: any) => {
    assert.equal(cause?.code, code);
    return true;
  });
}

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }

async function seedCollision(
  pool: Pool,
  garmentId: string,
  basisViewId: string,
  contentSha256: string,
): Promise<void> {
  const source = await pool.query(`SELECT content_sha256 FROM canonical_garment_views
    WHERE view_id=$1 AND garment_id=$2 AND tenant_id=$3 AND user_id=$4`,
  [basisViewId, garmentId, owner.tenantId, owner.userId]);
  assert.equal(source.rowCount, 1);
  const representationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT 1 FROM canonical_garments
      WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE`,
    [garmentId, owner.tenantId, owner.userId]);
    const hostile = Buffer.from('{"collision":true}', 'utf8');
    await client.query(`INSERT INTO canonical_garment_representations
      (representation_id,garment_id,tenant_id,user_id,tier,format,content_type,content_sha256,byte_size,storage_backend,representation_bytes,basis_view_id,source_count,generator_id,generator_version,validator_id,validator_version,admission_state)
      VALUES ($1,$2,$3,$4,'PARAMETRIC','BERS_PARAMETRIC_V1','application/vnd.bers.garment-parametric+json',$5,$6,'POSTGRES_BYTEA_V1',$7,$8,1,$9,$10,'bers.parametric-topology-validator','1','ADMITTED')`,
    [representationId, garmentId, owner.tenantId, owner.userId, contentSha256, hostile.byteLength, hostile, basisViewId,
      MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID, MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION]);
    await client.query(`INSERT INTO canonical_garment_representation_sources
      (representation_id,garment_id,tenant_id,user_id,source_position,view_id,source_content_sha256)
      VALUES ($1,$2,$3,$4,0,$5,$6)`,
    [representationId, garmentId, owner.tenantId, owner.userId, basisViewId, String(source.rows[0].content_sha256)]);
    await client.query(`UPDATE canonical_garments
      SET representation_tier='PARAMETRIC',revision=revision+1,updated_at=CURRENT_TIMESTAMP
      WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3`,
    [garmentId, owner.tenantId, owner.userId]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

test('F4b.6c.1a admits current-primary manual geometry and exact retry replays under the locked current revision', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    const service = new ManualParametricGarmentAdmissionService(representations);
    const garment = await classifiedGarment(garments, wardrobe, 'manual replay');
    const expectedRevision = garment.revision;

    const admitted = await service.admit(owner, { garmentId: garment.id, expectedRevision, contour });
    assert.equal(admitted.replayed, false);
    assert.equal(admitted.garmentRevision, expectedRevision + 1);
    assert.equal(admitted.representation.basisViewId, garment.primaryViewId);
    assert.equal(admitted.representation.generatorId, MANUAL_PARAMETRIC_CONTOUR_PRODUCER_ID);
    assert.equal(admitted.representation.generatorVersion, MANUAL_PARAMETRIC_CONTOUR_PRODUCER_VERSION);
    assert.equal(admitted.representation.sources.length, 1);
    assert.equal(admitted.representation.sources[0].viewId, garment.primaryViewId);

    const replay = await service.admit(owner, { garmentId: garment.id, expectedRevision, contour });
    assert.equal(replay.replayed, true);
    assert.equal(replay.garmentRevision, admitted.garmentRevision);
    assert.equal(replay.representation.id, admitted.representation.id);
    assert.equal((await garments.get(owner, garment.id))!.revision, admitted.garmentRevision);

    await expectCode(
      service.admit(owner, { garmentId: garment.id, expectedRevision: admitted.garmentRevision + 1, contour }),
      'garment_revision_conflict',
    );
    assert.equal((await garments.get(owner, garment.id))!.revision, admitted.garmentRevision);

    const key = await pool.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_representations')
        AND conname='canonical_garment_representations_garment_content_unique'`);
    assert.equal(key.rows[0]?.definition, 'UNIQUE (garment_id, content_sha256, basis_view_id)');
    await migrateGarmentSchema(pool);
    const rerunKey = await pool.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_representations')
        AND conname='canonical_garment_representations_garment_content_unique'`);
    assert.equal(rerunKey.rows[0]?.definition, 'UNIQUE (garment_id, content_sha256, basis_view_id)');
  } finally {
    await pool.end();
  }
});

test('F4b.6c.1a same deterministic bytes can be admitted for a new primary and historical basis cannot execute', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    const service = new ManualParametricGarmentAdmissionService(representations);
    let garment = await classifiedGarment(garments, wardrobe, 'basis change');
    const first = await service.admit(owner, { garmentId: garment.id, expectedRevision: garment.revision, contour });
    garment = (await garments.get(owner, garment.id))!;
    garment = await appendView(garments, garment.id, garment.revision, 44);
    const secondView = garment.views.find(view => view.id !== garment.primaryViewId)!;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await switchPrimary(client, garment.id, secondView.id);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.primaryViewId, secondView.id);

    const second = await service.admit(owner, { garmentId: garment.id, expectedRevision: garment.revision, contour });
    assert.equal(second.replayed, false);
    assert.notEqual(second.representation.id, first.representation.id);
    assert.equal(second.representation.contentSha256, first.representation.contentSha256);
    assert.equal(second.representation.basisViewId, secondView.id);

    const authority = new ManagedGarmentLocalExecutionInputAuthority({ garments, representations });
    await expectCode(
      authority.bindParametricRepresentation(owner, garment.id, first.representation.id),
      'managed_garment_input_state_mismatch',
    );
    const current = await authority.bindParametricRepresentation(owner, garment.id, second.representation.id);
    assert.equal(current.basisViewId, secondView.id);
  } finally {
    await pool.end();
  }
});

test('F4b.6c.1a primary mutation holding the Garment lock wins and stale admission cannot bind the historical basis', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    const service = new ManualParametricGarmentAdmissionService(representations);
    let garment = await classifiedGarment(garments, wardrobe, 'mutation first');
    garment = await appendView(garments, garment.id, garment.revision, 55);
    const oldPrimary = garment.primaryViewId;
    const nextPrimary = garment.views.find(view => view.id !== oldPrimary)!.id;
    const staleRevision = garment.revision;

    const mutation = await pool.connect();
    await mutation.query('BEGIN');
    await mutation.query(`SELECT revision FROM canonical_garments
      WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3 FOR UPDATE`,
    [garment.id, owner.tenantId, owner.userId]);
    await mutation.query(`UPDATE canonical_garments
      SET primary_view_id=$4,revision=revision+1,updated_at=CURRENT_TIMESTAMP
      WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3`,
    [garment.id, owner.tenantId, owner.userId, nextPrimary]);

    let settled = false;
    const admission = service.admit(owner, {
      garmentId: garment.id,
      expectedRevision: staleRevision,
      contour: { ...contour, contour: [[0.14, 0.14], [0.86, 0.14], [0.80, 0.86], [0.20, 0.86]] },
    }).finally(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(settled, false, 'manual admission must block behind the canonical Garment row lock');
    await mutation.query('COMMIT');
    mutation.release();

    await expectCode(admission, 'garment_revision_conflict');
    const stored = await representations.list(owner, garment.id);
    assert.equal(stored.length, 0);
    garment = (await garments.get(owner, garment.id))!;
    assert.equal(garment.primaryViewId, nextPrimary);
    assert.equal(garment.revision, staleRevision + 1);
  } finally {
    await pool.end();
  }
});

test('F4b.6c.1a manual admission lock serializes a concurrently started future primary mutation', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let mutation: PoolClient | undefined;
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    let garment = await classifiedGarment(garments, wardrobe, 'admission first');
    garment = await appendView(garments, garment.id, garment.revision, 66);
    const originalPrimary = garment.primaryViewId;
    const nextPrimary = garment.views.find(view => view.id !== originalPrimary)!.id;
    mutation = await pool.connect();

    let mutationStarted = false;
    let mutationFinished = false;
    let mutationPromise: Promise<void> | undefined;
    const fixedId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const representations = new PostgresGarmentRepresentationStore(pool, () => {
      mutationStarted = true;
      mutationPromise = (async () => {
        await mutation!.query('BEGIN');
        await switchPrimary(mutation!, garment.id, nextPrimary);
        await mutation!.query('COMMIT');
        mutationFinished = true;
      })();
      return fixedId;
    });
    const service = new ManualParametricGarmentAdmissionService(representations);
    const admitted = await service.admit(owner, { garmentId: garment.id, expectedRevision: garment.revision, contour });
    assert.equal(mutationStarted, true);
    assert.equal(admitted.representation.basisViewId, originalPrimary);
    await mutationPromise;
    assert.equal(mutationFinished, true);
    const current = (await garments.get(owner, garment.id))!;
    assert.equal(current.primaryViewId, nextPrimary);
    assert.ok(current.revision > admitted.garmentRevision);

    const authority = new ManagedGarmentLocalExecutionInputAuthority({ garments, representations });
    await expectCode(authority.bindParametricRepresentation(owner, garment.id, admitted.representation.id), 'managed_garment_input_state_mismatch');
  } finally {
    mutation?.release();
    await pool.end();
  }
});


test('F4b.6c.1a managed representation resolution serializes with primary mutation before returning bytes', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let mutation: PoolClient | undefined;
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    const service = new ManualParametricGarmentAdmissionService(representations);
    let garment = await classifiedGarment(garments, wardrobe, 'execution race');
    garment = await appendView(garments, garment.id, garment.revision, 67);
    const originalPrimary = garment.primaryViewId;
    const nextPrimary = garment.views.find(view => view.id !== originalPrimary)!.id;
    const admitted = await service.admit(owner, { garmentId: garment.id, expectedRevision: garment.revision, contour });
    assert.equal(admitted.representation.basisViewId, originalPrimary);

    mutation = await pool.connect();
    await mutation.query('BEGIN');
    await switchPrimary(mutation, garment.id, nextPrimary);

    const authority = new ManagedGarmentLocalExecutionInputAuthority({ garments, representations });
    let settled = false;
    const resolution = authority.bindParametricRepresentation(owner, garment.id, admitted.representation.id)
      .finally(() => { settled = true; });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(settled, false, 'managed representation resolution must block behind the canonical Garment row lock');

    await mutation.query('COMMIT');
    mutation.release();
    mutation = undefined;

    await expectCode(resolution, 'managed_garment_input_state_mismatch');
    const current = (await garments.get(owner, garment.id))!;
    assert.equal(current.primaryViewId, nextPrimary);
  } finally {
    mutation?.release();
    await pool.end();
  }
});

test('F4b.6c.1a hash collision and conflicting producer provenance fail closed before replay', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    let representations = new PostgresGarmentRepresentationStore(pool);
    let service = new ManualParametricGarmentAdmissionService(representations);

    let garment = await classifiedGarment(garments, wardrobe, 'provenance conflict');
    const produced = produceManualParametricRepresentation(contour);
    await representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC',
      generatorId: 'foreign.manual-producer',
      generatorVersion: '9',
      sourceViewIds: [garment.primaryViewId],
      payload: produced,
    });
    garment = (await garments.get(owner, garment.id))!;
    await expectCode(
      service.admit(owner, { garmentId: garment.id, expectedRevision: garment.revision, contour }),
      'manual_parametric_existing_provenance_conflict',
    );

    await reset(pool);
    const garments2 = new PostgresGarmentStore(pool);
    const wardrobe2 = new PostgresGarmentWardrobeStore(pool);
    representations = new PostgresGarmentRepresentationStore(pool);
    service = new ManualParametricGarmentAdmissionService(representations);
    const collisionGarment = await classifiedGarment(garments2, wardrobe2, 'hash collision');
    const canonicalBytes = canonicalManualParametricRepresentationBytes(contour);
    await seedCollision(pool, collisionGarment.id, collisionGarment.primaryViewId, sha256(canonicalBytes));
    const afterSeed = (await garments2.get(owner, collisionGarment.id))!;
    await expectCode(
      service.admit(owner, { garmentId: afterSeed.id, expectedRevision: afterSeed.revision, contour }),
      'manual_parametric_content_hash_collision',
    );
  } finally {
    await pool.end();
  }
});

test('F4b.6c.1a stale revision and unclassified Garment fail before mutation', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    const service = new ManualParametricGarmentAdmissionService(representations);
    const unclassified = await garments.createWithInitialView(owner, {
      name: 'unclassified', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: await image(77),
    }, limits);
    await expectCode(
      service.admit(owner, { garmentId: unclassified.id, expectedRevision: unclassified.revision, contour }),
      'garment_representation_category_requires_classification',
    );
    assert.equal((await representations.list(owner, unclassified.id)).length, 0);

    const classified = await classifiedGarment(garments, wardrobe, 'stale revision');
    await expectCode(
      service.admit(owner, { garmentId: classified.id, expectedRevision: classified.revision - 1, contour }),
      'garment_revision_conflict',
    );
    assert.equal((await representations.list(owner, classified.id)).length, 0);
  } finally {
    await pool.end();
  }
});
