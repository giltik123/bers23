import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { migrateMaskArtifactSchema } from '../server/core/artifacts/maskArtifactSchema.ts';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { checkProjectSchema, migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: Project revision acceptance must use real PostgreSQL');

const owner = Object.freeze({ tenantId: `aee-project-revision-tenant-${randomUUID()}`, userId: `aee-project-revision-user-${randomUUID()}` });
const limits = Object.freeze({ maxDimension: 64, maxPixels: 4096 });

function revision(row: any): number { return Number(row?.revision); }

async function png(width = 4, height = 3, red = 20): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width, height, channels: 4, background: { r: red, g: 30, b: 40, alpha: 1 } } }).png().toBuffer());
}

test('migration 044 backfills existing Project rows to strict revision 0', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: 'aee-project-revision-backfill' });
  const client = await pool.connect();
  const schema = `aee_revision_backfill_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query('SELECT set_config($1,$2,false)', ['search_path', schema]);
    await client.query('CREATE TABLE canonical_projects(project_id text PRIMARY KEY)');
    await client.query("INSERT INTO canonical_projects(project_id) VALUES ('legacy-one'),('legacy-two')");

    const migration = await readFile(resolve(process.cwd(), 'server/core/projects/migrations/044_canonical_project_revision.sql'), 'utf8');
    await client.query(migration);

    const column = (await client.query("SELECT udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='canonical_projects' AND column_name='revision'")).rows[0];
    assert.equal(column.udt_name, 'int8');
    assert.equal(column.is_nullable, 'NO');
    assert.match(String(column.column_default), /^0(?:::(?:bigint|int8))?$/u);
    const constraint = (await client.query("SELECT convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='canonical_projects'::regclass AND conname='canonical_projects_revision_check'")).rows[0];
    assert.equal(constraint.convalidated, true);
    assert.match(String(constraint.definition).replace(/[()\s]+/gu, '').toLowerCase(), /^checkrevision>=0$/u);
    assert.deepEqual((await client.query('SELECT project_id,revision FROM canonical_projects ORDER BY project_id')).rows, [
      { project_id: 'legacy-one', revision: '0' },
      { project_id: 'legacy-two', revision: '0' },
    ]);
    await assert.rejects(() => client.query("UPDATE canonical_projects SET revision=-1 WHERE project_id='legacy-one'"), /canonical_projects_revision_check/);
    await client.query('ROLLBACK').catch(() => undefined);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.query('SELECT set_config($1,$2,false)', ['search_path', 'public']).catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    client.release();
    await pool.end();
  }
});

test('canonical Project revision is monotonic, mutation-bound and exposes exact AEE source context', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3, application_name: 'aee-project-revision-acceptance' });
  await migrateTransactionSchema(pool);
  await migrateMaskArtifactSchema(pool);
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await checkProjectSchema(pool);
  await pool.query('TRUNCATE canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
    await pool.end();
  });

  const column = (await pool.query("SELECT udt_name,is_nullable,column_default FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='canonical_projects' AND column_name='revision'")).rows[0];
  assert.equal(column.udt_name, 'int8');
  assert.equal(column.is_nullable, 'NO');
  assert.match(String(column.column_default), /^0(?:::(?:bigint|int8))?$/u);
  const constraint = (await pool.query("SELECT convalidated,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid=to_regclass('canonical_projects') AND conname='canonical_projects_revision_check'")).rows[0];
  assert.equal(constraint.convalidated, true);
  assert.match(String(constraint.definition).replace(/[()\s]+/gu, '').toLowerCase(), /^checkrevision>=0$/u);

  const store = new PostgresProjectStore(pool);
  const created = await store.create(owner, 'Revision Project', await png(), limits);
  const projectId = String(created.project_id);
  const originalStorageId = String(created.original_image_storage_id);
  assert.equal(revision(created), 0, 'new Project must start at revision 0 even though create initializes history_cursor_id');
  assert.deepEqual(await store.currentSourceContext(owner, projectId), {
    projectId,
    revision: 0,
    currentImageStorageId: originalStorageId,
    width: 4,
    height: 3,
  });

  let state = await store.update(owner, projectId, { name: 'Revision Project Renamed' });
  assert.equal(revision(state), 1, 'accepted metadata mutation increments exactly once');
  assert.equal((await store.currentSourceContext(owner, projectId))?.revision, 1);

  await assert.rejects(() => store.update(owner, projectId, { revision: 999 }), /unsupported fields/);
  assert.equal(revision(await store.get(owner, projectId)), 1, 'browser/generic patch cannot write or advance revision on rejection');

  const finalStorageId = randomUUID();
  await pool.query(`INSERT INTO canonical_image_artifacts
    (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes)
    VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',4,3,'PNG_RGBA8_LOSSLESS','image/png',$7)`,
  [finalStorageId, owner.tenantId, owner.userId, projectId, 'aee-project-revision-final', 'revision-test-operation', await png(4, 3, 200)]);

  state = await store.acceptFinal(owner, projectId, finalStorageId, 'revision acceptance');
  assert.equal(revision(state), 2);
  assert.equal(state.current_image_storage_id, finalStorageId);

  state = await store.acceptFinal(owner, projectId, finalStorageId, 'idempotent replay');
  assert.equal(revision(state), 2, 'idempotent Accept must not fabricate a new Project revision');

  state = await store.createVersion(owner, projectId, 'Accepted Final');
  assert.equal(revision(state), 2, 'version metadata does not mutate current Project state');
  const version = state.versions.find((candidate: any) => candidate.name === 'Accepted Final');
  assert.ok(version?.version_id);

  state = await store.navigate(owner, projectId, 'original');
  assert.equal(revision(state), 3);
  assert.equal(state.current_image_storage_id, originalStorageId);
  assert.deepEqual(await store.currentSourceContext(owner, projectId), {
    projectId,
    revision: 3,
    currentImageStorageId: originalStorageId,
    width: 4,
    height: 3,
  });

  await assert.rejects(() => store.navigate(owner, projectId, 'undo'), /Cannot undo/);
  assert.equal(revision(await store.get(owner, projectId)), 3, 'failed mutation must roll back without advancing revision');

  state = await store.restoreVersion(owner, projectId, version.version_id);
  assert.equal(revision(state), 4);
  assert.equal(state.current_image_storage_id, finalStorageId);

  await assert.rejects(() => store.navigate(owner, projectId, 'redo'), /Cannot redo/);
  assert.equal(revision(await store.get(owner, projectId)), 4, 'failed navigation must not consume revision');

  assert.equal(await store.delete(owner, projectId), true);
  const deleted = (await pool.query('SELECT revision,deleted_at FROM canonical_projects WHERE project_id=$1', [projectId])).rows[0];
  assert.equal(revision(deleted), 5, 'soft delete is one canonical Project mutation');
  assert.ok(deleted.deleted_at);
  assert.equal(await store.delete(owner, projectId), false, 'idempotent delete no-op remains false');
  const deletedAgain = (await pool.query('SELECT revision FROM canonical_projects WHERE project_id=$1', [projectId])).rows[0];
  assert.equal(revision(deletedAgain), 5, 'repeated delete must not advance revision');
  assert.equal(await store.currentSourceContext(owner, projectId), undefined, 'deleted Project has no active AEE source context');
});
