import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore, type GarmentCategory } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresOutfitStore } from '../server/core/fashion/postgresOutfitStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for managed Outfit acceptance');

const owner = Object.freeze({ tenantId: 'fashion-outfit-tenant-a', userId: 'fashion-outfit-user-a' });
const otherUser = Object.freeze({ tenantId: 'fashion-outfit-tenant-a', userId: 'fashion-outfit-user-b' });
const limits = Object.freeze({ maxUploadBytes: 1024 * 1024, maxDimension: 64, maxPixels: 4096 });

async function image(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 3, height: 3, channels: 4, background: { r: 40, g: 90, b: 140, alpha: 1 } },
  }).png().toBuffer());
}

async function reset(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS
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

test('canonical Outfit aggregate preserves ordered references, one revision and owner isolation', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await reset(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const outfits = new PostgresOutfitStore(pool);
    const bytes = await image();

    const createGarment = async (name: string, category: GarmentCategory) => {
      const garment = await garments.createWithInitialView(owner, {
        name,
        viewKind: 'FRONT',
        sourceContentType: 'image/png',
        bytes,
      }, limits);
      const metadata = await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category });
      return Object.freeze({ garment, metadata });
    };

    const tee = await createGarment('White tee', 'tshirts');
    const jacket = await createGarment('Black jacket', 'jackets');
    const pants = await createGarment('Blue pants', 'pants');
    const shirt = await createGarment('Oxford shirt', 'shirts');
    const deletedCandidate = await createGarment('Deleted spare shoes', 'shoes');

    let outfit = await outfits.create(owner, {
      name: '  City   capsule  ',
      style: 'smart_casual',
      season: 'autumn',
      occasion: 'business',
    });
    assert.equal(outfit.name, 'City capsule');
    assert.equal(outfit.revision, 1);
    assert.equal(outfit.referenceReadiness, 'EMPTY');
    assert.deepEqual(outfit.entries, []);

    outfit = await outfits.addEntry(owner, outfit.id.toUpperCase(), 1, {
      garmentId: tee.garment.id.toUpperCase(),
      layerRole: 'base_top',
    });
    assert.equal(outfit.revision, 2);
    assert.equal(outfit.entries[0].garmentId, tee.garment.id);
    assert.equal(outfit.entries[0].position, 0);
    assert.equal(outfit.entries[0].layerRole, 'BASE_TOP');
    assert.equal(outfit.referenceReadiness, 'REFERENCES_READY');

    outfit = await outfits.addEntry(owner, outfit.id, 2, { garmentId: jacket.garment.id });
    outfit = await outfits.addEntry(owner, outfit.id, 3, { garmentId: pants.garment.id });
    assert.equal(outfit.revision, 4);
    assert.deepEqual(outfit.entries.map(entry => entry.layerRole), ['BASE_TOP','OUTER_TOP','BOTTOM']);
    assert.deepEqual(outfit.entries.map(entry => entry.position), [0,1,2]);

    await expectCode(outfits.addEntry(owner, outfit.id, 4, { garmentId: tee.garment.id }), 'outfit_duplicate_garment', 409);
    assert.equal((await outfits.get(owner, outfit.id))?.revision, 4);

    const jacketEntry = outfit.entries.find(entry => entry.garmentId === jacket.garment.id)!;
    outfit = await outfits.replaceEntry(owner, outfit.id, 4, jacketEntry.entryId.toUpperCase(), { garmentId: shirt.garment.id });
    const replaced = outfit.entries.find(entry => entry.entryId === jacketEntry.entryId)!;
    assert.equal(outfit.revision, 5);
    assert.equal(replaced.garmentId, shirt.garment.id);
    assert.equal(replaced.entryId, jacketEntry.entryId);
    assert.equal(replaced.position, jacketEntry.position);
    assert.equal(replaced.layerRole, 'BASE_TOP');

    const reversed = [...outfit.entries].reverse().map(entry => entry.entryId.toUpperCase());
    outfit = await outfits.reorderEntries(owner, outfit.id, 5, reversed);
    assert.equal(outfit.revision, 6);
    assert.deepEqual(outfit.entries.map(entry => entry.entryId), reversed.map(value => value.toLowerCase()));
    assert.deepEqual(outfit.entries.map(entry => entry.position), [0,1,2]);

    const concurrentRevision = outfit.revision;
    const concurrent = await Promise.allSettled([
      outfits.updateMetadata(owner, outfit.id, concurrentRevision, { favorite: true }),
      outfits.updateMetadata(owner, outfit.id, concurrentRevision, { name: 'Concurrent winner' }),
    ]);
    assert.equal(concurrent.filter(result => result.status === 'fulfilled').length, 1);
    const rejected = concurrent.find(result => result.status === 'rejected') as PromiseRejectedResult;
    assert.equal((rejected.reason as any)?.code, 'outfit_revision_conflict');
    outfit = (await outfits.get(owner, outfit.id))!;
    assert.equal(outfit.revision, concurrentRevision + 1);

    await expectCode(outfits.updateMetadata(otherUser, outfit.id, outfit.revision, { favorite: false }), 'outfit_not_found', 404);
    assert.equal(await outfits.get(otherUser, outfit.id), undefined);

    outfit = await outfits.archive(owner, outfit.id, outfit.revision);
    assert.equal(outfit.status, 'ARCHIVED');
    await expectCode(outfits.addEntry(owner, outfit.id, outfit.revision, { garmentId: jacket.garment.id }), 'outfit_archived', 409);
    outfit = await outfits.restore(owner, outfit.id, outfit.revision);
    assert.equal(outfit.status, 'ACTIVE');

    const teeEntry = outfit.entries.find(entry => entry.garmentId === tee.garment.id)!;
    const teeCurrent = (await wardrobe.get(owner, tee.garment.id))!;
    await wardrobe.updateMetadata(owner, tee.garment.id, teeCurrent.revision, { category: 'jackets' });
    const unchangedAfterCategoryDrift = (await outfits.get(owner, outfit.id))!;
    assert.equal(unchangedAfterCategoryDrift.revision, outfit.revision);
    assert.equal(
      unchangedAfterCategoryDrift.entries.find(entry => entry.entryId === teeEntry.entryId)?.referenceReadiness,
      'ROLE_REVIEW_REQUIRED',
    );
    outfit = await outfits.setEntryRole(owner, outfit.id, outfit.revision, teeEntry.entryId, 'OUTER_TOP');
    assert.equal(outfit.entries.find(entry => entry.entryId === teeEntry.entryId)?.referenceReadiness, 'READY');

    const pantsEntry = outfit.entries.find(entry => entry.garmentId === pants.garment.id)!;
    const pantsCurrent = (await wardrobe.get(owner, pants.garment.id))!;
    await wardrobe.delete(owner, pants.garment.id, pantsCurrent.revision);
    const deletedCandidateCurrent = (await wardrobe.get(owner, deletedCandidate.garment.id))!;
    await wardrobe.delete(owner, deletedCandidate.garment.id, deletedCandidateCurrent.revision);

    const tombstoned = (await outfits.get(owner, outfit.id))!;
    assert.equal(tombstoned.revision, outfit.revision);
    assert.equal(tombstoned.entries.find(entry => entry.entryId === pantsEntry.entryId)?.garmentId, pants.garment.id);
    assert.equal(tombstoned.entries.find(entry => entry.entryId === pantsEntry.entryId)?.referenceReadiness, 'GARMENT_UNAVAILABLE');
    assert.equal(tombstoned.referenceReadiness, 'GARMENT_UNAVAILABLE');

    await expectCode(outfits.duplicate(owner, outfit.id, 'Blocked copy'), 'garment_not_found', 404);
    await expectCode(
      outfits.addEntry(owner, outfit.id, outfit.revision, { garmentId: deletedCandidate.garment.id }),
      'garment_not_found',
      404,
    );
    await expectCode(
      outfits.replaceEntry(owner, outfit.id, outfit.revision, teeEntry.entryId, { garmentId: deletedCandidate.garment.id }),
      'garment_not_found',
      404,
    );
    assert.equal((await outfits.get(owner, outfit.id))?.revision, outfit.revision);

    outfit = await outfits.removeEntry(owner, outfit.id, outfit.revision, pantsEntry.entryId);
    assert.equal(outfit.entries.some(entry => entry.entryId === pantsEntry.entryId), false);
    assert.deepEqual(outfit.entries.map(entry => entry.position), [0,1]);
    assert.notEqual(outfit.referenceReadiness, 'GARMENT_UNAVAILABLE');

    const copy = await outfits.duplicate(owner, outfit.id, 'City capsule copy');
    assert.equal(copy.revision, 1);
    assert.equal(copy.status, 'ACTIVE');
    assert.equal(copy.favorite, false);
    assert.deepEqual(copy.entries.map(entry => [entry.garmentId, entry.position, entry.layerRole]),
      outfit.entries.map(entry => [entry.garmentId, entry.position, entry.layerRole]));
    assert.notDeepEqual(copy.entries.map(entry => entry.entryId), outfit.entries.map(entry => entry.entryId));

    const emoji200 = '😀'.repeat(200);
    const unicode = await outfits.create(owner, { name: emoji200 });
    assert.equal(Array.from(unicode.name).length, 200);
    await expectCode(outfits.create(owner, { name: '😀'.repeat(201) }), 'invalid_outfit_name', 400);

    const deletedRevision = await outfits.delete(owner, copy.id, copy.revision);
    assert.equal(deletedRevision, copy.revision + 1);
    assert.equal(await outfits.get(owner, copy.id), undefined);
    assert.equal((await outfits.list(owner)).some(candidate => candidate.id === copy.id), false);
  } finally {
    await pool.end();
  }
});
