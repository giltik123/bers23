import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';
import { migrateMaskArtifactSchema } from '../server/core/artifacts/maskArtifactSchema.ts';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required: Project history authority acceptance must use real PostgreSQL');

const owner = { tenantId: 'history-authority-tenant', userId: 'history-authority-user' };
const wrongUser = { tenantId: owner.tenantId, userId: 'history-authority-other-user' };
const wrongTenant = { tenantId: 'history-authority-other-tenant', userId: owner.userId };

async function reservationCount(pool: Pool) {
  return Number((await pool.query('SELECT count(*)::int AS count FROM credit_reservations')).rows[0].count);
}

test('Project history authority scopes commands and persists explicit source/result lineage', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3, application_name: 'project-history-authority-acceptance' });
  await migrateTransactionSchema(pool);
  await migrateMaskArtifactSchema(pool);
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await pool.query('TRUNCATE canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_projects,canonical_image_artifacts,canonical_mask_artifacts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
    await pool.end();
  });

  const store = new PostgresProjectStore(pool);
  const width = 4, height = 4;
  const png = new Uint8Array(await sharp({ create: { width, height, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } } }).png().toBuffer());
  const created = await store.create(owner, 'Authority Project', png, { maxDimension: 64, maxPixels: 4096 });
  const projectId = created.project_id as string;
  const originalStorage = created.original_image_storage_id as string;
  assert.equal(await reservationCount(pool), 0);

  const insertFinal = async (execution: string, operation: string, color: { r: number; g: number; b: number }) => {
    const storageId = randomUUID();
    const bytes = await sharp({ create: { width, height, channels: 4, background: { ...color, alpha: 1 } } }).png().toBuffer();
    await pool.query(`INSERT INTO canonical_image_artifacts (storage_id,tenant_id,user_id,project_id,execution_id,operation_id,role,lifecycle,width,height,encoding,content_type,image_bytes) VALUES ($1,$2,$3,$4,$5,$6,'COMPOSITE','FINAL',$7,$8,'PNG_RGBA8_LOSSLESS','image/png',$9)`, [storageId,owner.tenantId,owner.userId,projectId,execution,operation,width,height,bytes]);
    return storageId;
  };

  const final1 = await insertFinal('history-execution-1', 'history-operation-1', { r: 240, g: 1, b: 2 });
  let state = await store.acceptFinal(owner, projectId, final1, 'first edit');
  assert.equal(state.current_image_storage_id, final1);
  let accepted = (await pool.query("SELECT * FROM canonical_project_history WHERE project_id=$1 AND image_storage_id=$2 AND kind='ACCEPTED_FINAL'", [projectId,final1])).rows[0];
  assert.equal(accepted.source_image_storage_id, originalStorage);
  assert.equal(accepted.image_storage_id, final1);
  assert.equal(accepted.execution_id, 'history-execution-1');
  assert.equal(accepted.operation_id, 'history-operation-1');

  // All dedicated history commands are scoped by tenant/user and fail before mutation.
  await assert.rejects(() => store.navigate(wrongUser, projectId, 'undo'), /Project not found/);
  await assert.rejects(() => store.navigate(wrongTenant, projectId, 'original'), /Project not found/);
  await assert.rejects(() => store.createVersion(wrongUser, projectId, 'forbidden'), /Project not found/);
  assert.equal((await store.state(owner,projectId)).current_image_storage_id, final1);
  assert.equal(await reservationCount(pool), 0);

  // restore-original is a server cursor transition, then redo returns the durable FINAL.
  state = await store.navigate(owner, projectId, 'original');
  assert.equal(state.current_image_storage_id, originalStorage);
  state = await store.navigate(owner, projectId, 'redo');
  assert.equal(state.current_image_storage_id, final1);
  state = await store.createVersion(owner, projectId, 'Final One');
  const version1 = state.versions.find((version: any) => version.name === 'Final One');
  assert.ok(version1?.history_id);
  await assert.rejects(() => store.restoreVersion(wrongUser, projectId, version1.version_id), /Project not found/);
  assert.equal(await reservationCount(pool), 0);

  // Create FINAL #2 and snapshot it as a named version.
  const final2 = await insertFinal('history-execution-2', 'history-operation-2', { r: 3, g: 230, b: 4 });
  state = await store.acceptFinal(owner, projectId, final2, 'second edit');
  assert.equal(state.current_image_storage_id, final2);
  accepted = (await pool.query("SELECT * FROM canonical_project_history WHERE project_id=$1 AND image_storage_id=$2 AND kind='ACCEPTED_FINAL'", [projectId,final2])).rows[0];
  assert.equal(accepted.source_image_storage_id, final1);
  state = await store.createVersion(owner, projectId, 'Final Two');
  const version2 = state.versions.find((version: any) => version.name === 'Final Two');
  assert.ok(version2?.history_id);

  // Undo to FINAL #1 and accept a new branch, retiring FINAL #2's history row.
  state = await store.navigate(owner, projectId, 'undo');
  assert.equal(state.current_image_storage_id, final1);
  const final3 = await insertFinal('history-execution-3', 'history-operation-3', { r: 5, g: 6, b: 220 });
  state = await store.acceptFinal(owner, projectId, final3, 'alternate branch');
  assert.equal(state.current_image_storage_id, final3);
  const retiredFinal2 = (await pool.query("SELECT retired_at FROM canonical_project_history WHERE project_id=$1 AND image_storage_id=$2 AND kind='ACCEPTED_FINAL'", [projectId,final2])).rows[0];
  assert.ok(retiredFinal2.retired_at);

  // A named version remains durable even when its original redo branch is retired.
  state = await store.restoreVersion(owner, projectId, version2.version_id);
  assert.equal(state.current_image_storage_id, final2);
  const restore = (await pool.query("SELECT * FROM canonical_project_history WHERE project_id=$1 AND kind='RESTORE_VERSION' AND retired_at IS NULL", [projectId])).rows[0];
  assert.equal(restore.source_image_storage_id, final3);
  assert.equal(restore.image_storage_id, final2);
  assert.equal(restore.credits_used, 0);

  state = await store.navigate(owner, projectId, 'undo');
  assert.equal(state.current_image_storage_id, final3);
  state = await store.navigate(owner, projectId, 'redo');
  assert.equal(state.current_image_storage_id, final2);
  assert.equal(await reservationCount(pool), 0, 'history/version navigation must never create financial reservations');

  // Generic metadata PATCH cannot become an alternate history authority.
  await assert.rejects(() => store.update(owner, projectId, { current_image_storage_id: originalStorage }), /unsupported fields/);
  await assert.rejects(() => store.update(owner, projectId, { history: [] }), /unsupported fields/);
  await assert.rejects(() => store.update(owner, projectId, { versions: [] }), /unsupported fields/);
});
