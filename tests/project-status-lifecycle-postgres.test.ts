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
if (!databaseUrl) throw new Error('DATABASE_URL is required: Project status lifecycle acceptance must use real PostgreSQL');

const limits = Object.freeze({ maxDimension: 64, maxPixels: 4096 });

async function png(red: number): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: { width: 4, height: 3, channels: 4, background: { r: red, g: 30, b: 40, alpha: 1 } },
  }).png().toBuffer());
}

test('migration 045 reconstructs Draft/Editing from durable Project history and seals the enum', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: 'project-status-045-backfill' });
  const client = await pool.connect();
  const schema = `project_status_045_${randomUUID().replaceAll('-', '')}`;
  try {
    await client.query(`CREATE SCHEMA "${schema}"`);
    await client.query('SELECT set_config($1,$2,false)', ['search_path', schema]);
    await client.query(`CREATE TABLE canonical_projects(
      project_id text PRIMARY KEY,
      tenant_id text NOT NULL,
      user_id text NOT NULL,
      status text NOT NULL DEFAULT 'draft'
    )`);
    await client.query(`CREATE TABLE canonical_project_history(
      history_id text PRIMARY KEY,
      project_id text NOT NULL,
      tenant_id text NOT NULL,
      user_id text NOT NULL,
      kind text NOT NULL
    )`);
    await client.query(`INSERT INTO canonical_projects(project_id,tenant_id,user_id,status) VALUES
      ('never-edited','t','u','completed'),
      ('accepted-but-reset','t','u','draft'),
      ('fake-editing','t','u','editing'),
      ('accepted-arbitrary','t','u','processing')`);
    await client.query(`INSERT INTO canonical_project_history(history_id,project_id,tenant_id,user_id,kind) VALUES
      ('h1','accepted-but-reset','t','u','ACCEPTED_FINAL'),
      ('h2','accepted-arbitrary','t','u','ACCEPTED_FINAL')`);

    const migration = await readFile(resolve(process.cwd(), 'server/core/projects/migrations/045_canonical_project_status_lifecycle.sql'), 'utf8');
    await client.query(migration);

    assert.deepEqual(
      (await client.query('SELECT project_id,status FROM canonical_projects ORDER BY project_id')).rows,
      [
        { project_id: 'accepted-arbitrary', status: 'editing' },
        { project_id: 'accepted-but-reset', status: 'editing' },
        { project_id: 'fake-editing', status: 'draft' },
        { project_id: 'never-edited', status: 'draft' },
      ],
    );
    const constraint = (await client.query(`SELECT convalidated,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid='canonical_projects'::regclass AND conname='canonical_projects_status_check'`)).rows[0];
    assert.equal(constraint.convalidated, true);
    const definition = String(constraint.definition).replace(/::text/giu, '').replace(/[()\s]+/gu, '').toLowerCase();
    assert.equal(definition, "checkstatus=anyarray['draft','editing']");
    await assert.rejects(
      () => client.query("UPDATE canonical_projects SET status='completed' WHERE project_id='never-edited'"),
      /canonical_projects_status_check/,
    );
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    await client.query('SELECT set_config($1,$2,false)', ['search_path', 'public']).catch(() => undefined);
    await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`).catch(() => undefined);
    client.release();
    await pool.end();
  }
});

test('Project Draft/Editing lifecycle is server-owned and browser/generic patch cannot mutate it', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3, application_name: 'project-status-lifecycle-acceptance' });
  await migrateTransactionSchema(pool);
  await migrateMaskArtifactSchema(pool);
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await checkProjectSchema(pool);

  const owner = Object.freeze({
    tenantId: `project-status-tenant-${randomUUID()}`,
    userId: `project-status-user-${randomUUID()}`,
  });
  const store = new PostgresProjectStore(pool);
  t.after(async () => {
    await pool.query('DELETE FROM canonical_projects WHERE tenant_id=$1 AND user_id=$2', [owner.tenantId, owner.userId]).catch(() => undefined);
    await pool.end();
  });

  let project = await store.create(owner, 'Draft authority', await png(20), limits);
  const projectId = String(project.project_id);
  assert.equal(project.status, 'draft');

  await assert.rejects(
    () => store.update(owner, projectId, { status: 'editing' }),
    (error: any) => error?.code === 'invalid_project_patch' && error?.status === 400,
    'generic/browser Project patch must not own lifecycle status',
  );
  assert.equal((await store.get(owner, projectId)).status, 'draft');

  project = await store.update(owner, projectId, { name: 'Renamed Draft' });
  assert.equal(project.status, 'draft', 'ordinary metadata mutation does not fabricate edit lifecycle');

  const finalStorageId = randomUUID();
  await pool.query(`INSERT INTO canonical_image_artifacts
    (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes)
    VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',4,3,'PNG_RGBA8_LOSSLESS','image/png',$7)`,
  [finalStorageId, owner.tenantId, owner.userId, projectId, 'project-status-final', 'status-accept', await png(190)]);

  project = await store.acceptFinal(owner, projectId, finalStorageId, 'first accepted edit');
  assert.equal(project.status, 'editing', 'only accepted canonical FINAL transitions Draft to Editing');

  await assert.rejects(
    () => store.update(owner, projectId, { status: 'draft' }),
    (error: any) => error?.code === 'invalid_project_patch' && error?.status === 400,
  );
  project = await store.navigate(owner, projectId, 'original');
  assert.equal(project.status, 'editing', 'returning the cursor to ORIGINAL does not erase durable edit history');

  await assert.rejects(
    () => pool.query("UPDATE canonical_projects SET status='completed' WHERE project_id=$1", [projectId]),
    /canonical_projects_status_check/,
    'database rejects lifecycle values outside the accepted server-owned enum',
  );
});
