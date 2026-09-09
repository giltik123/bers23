import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool, type PoolClient } from 'pg';
import { PostgresContextGraphV1Reader, ContextGraphReadError } from '../server/core/agentic/PostgresContextGraphV1Reader.ts';

const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');

const pool = new Pool({ connectionString, max: 8 });
const owner = Object.freeze({ tenantId: 'context-tenant', userId: 'context-user' });
const other = Object.freeze({ tenantId: 'context-tenant', userId: 'other-user' });
const PROJECT = '10000000-0000-4000-8000-000000000001';
const ORIGINAL = '10000000-0000-4000-8000-000000000002';
const CANDIDATE = '10000000-0000-4000-8000-000000000003';
const HISTORY = '10000000-0000-4000-8000-000000000004';
const GARMENT = '10000000-0000-4000-8000-000000000005';
const VIEW = '10000000-0000-4000-8000-000000000006';
const OUTFIT = '10000000-0000-4000-8000-000000000007';
const ENTRY = '10000000-0000-4000-8000-000000000008';
const SHA = 'c'.repeat(64);

function bulkGarmentId(index: number): string { return `20000000-0000-4000-8000-${String(index).padStart(12, '0')}`; }
function bulkViewId(index: number): string { return `30000000-0000-4000-8000-${String(index).padStart(12, '0')}`; }
function bulkOutfitId(index: number): string { return `40000000-0000-4000-8000-${String(index).padStart(12, '0')}`; }
function bulkEntryId(index: number): string { return `50000000-0000-4000-8000-${String(index).padStart(12, '0')}`; }

async function seed(): Promise<void> {
  await pool.query(
    `INSERT INTO canonical_image_artifacts
       (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes)
     VALUES ($1,$2,$3,$4,NULL,NULL,'ORIGINAL','IMMUTABLE',640,480,'PNG_RGBA8_LOSSLESS','image/png',$5)`,
    [ORIGINAL, owner.tenantId, owner.userId, PROJECT, Buffer.from([1])],
  );
  await pool.query(
    `INSERT INTO canonical_projects
       (project_id,tenant_id,user_id,name,original_image_storage_id,current_image_storage_id,width,height)
     VALUES ($1,$2,$3,'AE-1.5 fixture',$4,$4,640,480)`,
    [PROJECT, owner.tenantId, owner.userId, ORIGINAL],
  );
  await pool.query(
    `INSERT INTO canonical_project_history
       (history_id,project_id,tenant_id,user_id,ordinal,source_image_storage_id,image_storage_id,kind)
     VALUES ($1,$2,$3,$4,0,$5,$5,'ORIGINAL')`,
    [HISTORY, PROJECT, owner.tenantId, owner.userId, ORIGINAL],
  );
  await pool.query('UPDATE canonical_projects SET history_cursor_id=$2 WHERE project_id=$1', [PROJECT, HISTORY]);

  await pool.query(
    `INSERT INTO canonical_image_artifacts
       (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes)
     VALUES ($1,$2,$3,$4,'context-execution-1','context-operation-1','COMPOSITE','FINAL',640,480,'PNG_RGBA8_LOSSLESS','image/png',$5)`,
    [CANDIDATE, owner.tenantId, owner.userId, PROJECT, Buffer.from([2])],
  );

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO canonical_garments
         (garment_id,tenant_id,user_id,name,representation_tier,status,revision,primary_view_id)
       VALUES ($1,$2,$3,'Context jacket','BASIC','ACTIVE',1,$4)`,
      [GARMENT, owner.tenantId, owner.userId, VIEW],
    );
    await client.query(
      `INSERT INTO canonical_garment_views
         (view_id,garment_id,tenant_id,user_id,ordinal,view_kind,source_content_type,width,height,content_sha256,image_bytes)
       VALUES ($1,$2,$3,$4,0,'FRONT','image/png',256,256,$5,$6)`,
      [VIEW, GARMENT, owner.tenantId, owner.userId, SHA, Buffer.from([3])],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await pool.query(
    `INSERT INTO canonical_outfits
       (outfit_id,tenant_id,user_id,name,status,revision)
     VALUES ($1,$2,$3,'Context outfit','ACTIVE',1)`,
    [OUTFIT, owner.tenantId, owner.userId],
  );
  await pool.query(
    `INSERT INTO canonical_outfit_entries
       (entry_id,outfit_id,garment_id,tenant_id,user_id,position,layer_role)
     VALUES ($1,$2,$3,$4,$5,0,'OUTER_TOP')`,
    [ENTRY, OUTFIT, GARMENT, owner.tenantId, owner.userId],
  );
}

async function seedBoundedWindowOverflow(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (let index = 1; index <= 64; index += 1) {
      const garmentId = bulkGarmentId(index);
      const viewId = bulkViewId(index);
      await client.query(
        `INSERT INTO canonical_garments
           (garment_id,tenant_id,user_id,name,representation_tier,status,revision,primary_view_id)
         VALUES ($1,$2,$3,$4,'BASIC','ACTIVE',1,$5)`,
        [garmentId, owner.tenantId, owner.userId, `Bulk garment ${index}`, viewId],
      );
      await client.query(
        `INSERT INTO canonical_garment_views
           (view_id,garment_id,tenant_id,user_id,ordinal,view_kind,source_content_type,width,height,content_sha256,image_bytes)
         VALUES ($1,$2,$3,$4,0,'FRONT','image/png',64,64,$5,$6)`,
        [viewId, garmentId, owner.tenantId, owner.userId, SHA, Buffer.from([index])],
      );
    }
    for (let outfitIndex = 1; outfitIndex <= 2; outfitIndex += 1) {
      await client.query(
        `INSERT INTO canonical_outfits
           (outfit_id,tenant_id,user_id,name,status,revision)
         VALUES ($1,$2,$3,$4,'ACTIVE',1)`,
        [bulkOutfitId(outfitIndex), owner.tenantId, owner.userId, `Bulk outfit ${outfitIndex}`],
      );
    }
    for (let index = 1; index <= 64; index += 1) {
      const outfitIndex = index <= 32 ? 1 : 2;
      const position = (index - 1) % 32;
      await client.query(
        `INSERT INTO canonical_outfit_entries
           (entry_id,outfit_id,garment_id,tenant_id,user_id,position,layer_role)
         VALUES ($1,$2,$3,$4,$5,$6,'OUTER_TOP')`,
        [bulkEntryId(index), bulkOutfitId(outfitIndex), bulkGarmentId(index), owner.tenantId, owner.userId, position],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

test.before(async () => { await seed(); });
test.after(async () => { await pool.end(); });

test('Context Graph is derived from canonical owner/project state and excludes image bytes/authority widening', async () => {
  const reader = new PostgresContextGraphV1Reader(pool);
  const ephemeral = [{ kind: 'SELECTED_OBJECT', id: 'object-shirt', projectId: PROJECT, sourceStorageId: ORIGINAL, uiRevision: 'editor/1' }];
  const first = await reader.read(owner, PROJECT, ephemeral);
  const second = await reader.read(owner, PROJECT, [...ephemeral].reverse());

  assert.equal(first.digest, second.digest);
  assert.equal(first.graph.project.projectId, PROJECT);
  assert.equal(first.graph.project.cursorOrdinal, 0);
  assert.equal(first.graph.currentSource.storageId, ORIGINAL);
  assert.equal(first.graph.currentSource.role, 'ORIGINAL');
  assert.equal(first.graph.candidates[0]?.storageId, CANDIDATE);
  assert.equal(first.graph.garments[0]?.garmentId, GARMENT);
  assert.equal(first.graph.garments[0]?.revision, 1);
  assert.equal(first.graph.garments[0]?.primaryViewSha256, SHA);
  assert.equal(first.graph.outfits[0]?.outfitId, OUTFIT);
  assert.deepEqual(first.graph.outfits[0]?.entries.map(entry => entry.garmentId), [GARMENT]);
  assert.equal(first.graph.outfits[0]?.entries[0]?.garmentReferenceState, 'GROUNDED');
  const serialized = JSON.stringify(first);
  assert.doesNotMatch(serialized, /image_bytes|providerSelector|creditsWallet|billing|modelId/u);
  assert.equal(Object.isFrozen(first.graph), true);
});

test('one REPEATABLE READ READ ONLY graph cannot tear across a concurrent canonical mutation', async () => {
  let mutated = false;
  const snapshotPool = {
    connect: async () => {
      const client = await pool.connect();
      const wrapped = {
        query: async (text: string, values?: readonly unknown[]) => {
          const result = await client.query(text, values as any[] | undefined);
          if (!mutated && text.includes('FROM canonical_projects p')) {
            mutated = true;
            await pool.query(
              `UPDATE canonical_garments SET revision=revision+1,updated_at=CURRENT_TIMESTAMP
               WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3`,
              [GARMENT, owner.tenantId, owner.userId],
            );
          }
          return result;
        },
        release: () => client.release(),
      };
      return wrapped as unknown as PoolClient;
    },
  } as unknown as Pool;

  const snapshotReader = new PostgresContextGraphV1Reader(snapshotPool);
  const duringMutation = await snapshotReader.read(owner, PROJECT);
  assert.equal(mutated, true);
  assert.equal(duringMutation.graph.garments[0]?.revision, 1, 'snapshot must not observe a mutation committed after its first canonical read');

  const afterMutation = await new PostgresContextGraphV1Reader(pool).read(owner, PROJECT);
  assert.equal(afterMutation.graph.garments[0]?.revision, 2);
  assert.notEqual(duringMutation.digest, afterMutation.digest);
});

test('ARCHIVED Fashion aggregates remain canonical context and keep Outfit references grounded', async () => {
  await pool.query(
    `UPDATE canonical_garments
     SET status='ARCHIVED',revision=revision+1,updated_at=CURRENT_TIMESTAMP
     WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3`,
    [GARMENT, owner.tenantId, owner.userId],
  );
  await pool.query(
    `UPDATE canonical_outfits
     SET status='ARCHIVED',revision=revision+1,updated_at=CURRENT_TIMESTAMP
     WHERE outfit_id=$1 AND tenant_id=$2 AND user_id=$3`,
    [OUTFIT, owner.tenantId, owner.userId],
  );

  const graph = await new PostgresContextGraphV1Reader(pool).read(owner, PROJECT);
  assert.equal(graph.graph.garments[0]?.garmentId, GARMENT);
  assert.equal(graph.graph.garments[0]?.status, 'ARCHIVED');
  assert.equal(graph.graph.garments[0]?.revision, 3);
  assert.equal(graph.graph.outfits[0]?.outfitId, OUTFIT);
  assert.equal(graph.graph.outfits[0]?.status, 'ARCHIVED');
  assert.equal(graph.graph.outfits[0]?.revision, 2);
  assert.equal(graph.graph.outfits[0]?.entries[0]?.garmentReferenceState, 'GROUNDED');
});

test('scope and ephemeral source substitutions fail closed', async () => {
  const reader = new PostgresContextGraphV1Reader(pool);
  await assert.rejects(
    reader.read(other, PROJECT),
    (error) => error instanceof ContextGraphReadError && error.code === 'context_graph_project_not_found',
  );
  await assert.rejects(
    reader.read(owner, PROJECT, [{ kind: 'PERSON', id: 'person', projectId: PROJECT, sourceStorageId: CANDIDATE, uiRevision: 'editor/2' }]),
    (error) => error instanceof ContextGraphReadError && error.code === 'context_graph_ephemeral_stale_source',
  );
  await assert.rejects(
    reader.read(owner, PROJECT, [{ kind: 'PERSON', id: 'person', projectId: PROJECT, sourceStorageId: ORIGINAL, uiRevision: 'editor/2', provider: 'forbidden' }]),
    /exactly the documented keys/u,
  );
});

test('healthy referenced Garments beyond the 64-node projection are represented as OUTSIDE_BOUNDED_WINDOW', async () => {
  await seedBoundedWindowOverflow();
  const graph = await new PostgresContextGraphV1Reader(pool).read(owner, PROJECT);
  assert.equal(graph.graph.garments.length, 64);
  assert.ok(graph.graph.garments.some(garment => garment.garmentId === GARMENT), 'the lexically first referenced base Garment remains grounded');
  assert.ok(graph.graph.garments.some(garment => garment.garmentId === bulkGarmentId(63)), 'the first 63 bulk references fit after the base Garment');
  assert.ok(!graph.graph.garments.some(garment => garment.garmentId === bulkGarmentId(64)), 'the 65th referenced Garment is outside the bounded node window');

  const overflowOutfit = graph.graph.outfits.find(outfit => outfit.outfitId === bulkOutfitId(2));
  const overflowEntry = overflowOutfit?.entries.find(entry => entry.garmentId === bulkGarmentId(64));
  assert.equal(overflowEntry?.garmentReferenceState, 'OUTSIDE_BOUNDED_WINDOW');
  const groundedEntry = overflowOutfit?.entries.find(entry => entry.garmentId === bulkGarmentId(63));
  assert.equal(groundedEntry?.garmentReferenceState, 'GROUNDED');
});

test('soft-deleted referenced Garment remains inspectable as UNAVAILABLE without invalidating the whole graph', async () => {
  await pool.query(
    `UPDATE canonical_garments
     SET deleted_at=CURRENT_TIMESTAMP,status='ARCHIVED',revision=revision+1,updated_at=CURRENT_TIMESTAMP
     WHERE garment_id=$1 AND tenant_id=$2 AND user_id=$3`,
    [GARMENT, owner.tenantId, owner.userId],
  );

  const graph = await new PostgresContextGraphV1Reader(pool).read(owner, PROJECT);
  assert.ok(!graph.graph.garments.some(garment => garment.garmentId === GARMENT));
  const retainedOutfit = graph.graph.outfits.find(outfit => outfit.outfitId === OUTFIT);
  assert.equal(retainedOutfit?.status, 'ARCHIVED');
  assert.equal(retainedOutfit?.entries[0]?.garmentId, GARMENT);
  assert.equal(retainedOutfit?.entries[0]?.garmentReferenceState, 'UNAVAILABLE');
});
