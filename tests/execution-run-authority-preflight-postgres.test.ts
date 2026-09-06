import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';

import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { PostgresExecutionRunRegistry } from '../server/core/execution/PostgresExecutionRunRegistry.ts';
import { migrateExecutionRunSchema } from '../server/core/execution/executionRunSchema.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Execution Run authority preflight acceptance');

const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-execution-run-authority-preflight' });
const projects = new PostgresProjectStore(pool);
const registry = new PostgresExecutionRunRegistry(pool);
const owner = Object.freeze({ tenantId: 'tenant-authority-preflight', userId: 'user-authority-preflight' });
let projectId = '';
let otherProjectId = '';

async function png(seed: number) {
  return new Uint8Array(await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: seed, g: 30, b: 40, alpha: 1 } },
  }).png().toBuffer());
}

test.before(async () => {
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await migrateExecutionRunSchema(pool);
  await pool.query('TRUNCATE canonical_execution_runs,canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts RESTART IDENTITY CASCADE');
  projectId = String((await projects.create(owner, 'Authority preflight project', await png(20), { maxDimension: 64, maxPixels: 4096 })).project_id).toLowerCase();
  otherProjectId = String((await projects.create(owner, 'Authority preflight other project', await png(21), { maxDimension: 64, maxPixels: 4096 })).project_id).toLowerCase();
});

test.after(async () => {
  await pool.query('TRUNCATE canonical_execution_runs,canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts RESTART IDENTITY CASCADE');
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query('TRUNCATE canonical_execution_runs RESTART IDENTITY CASCADE');
});

test('getByAuthority is exact, scope-bound and observation-only', async () => {
  const scope = Object.freeze({ ...owner, projectId });
  const issued = await registry.issue({
    scope,
    capability: 'CREATIVE_EXECUTION',
    idempotencyKey: 'creative-request-v1:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    authorityKind: 'CREATIVE_EXECUTION',
    authorityRef: 'creative-authority-preflight-1',
  });
  const before = Object.freeze({ ...issued.run });
  const rowCountBefore = Number((await pool.query('SELECT COUNT(*)::int AS count FROM canonical_execution_runs')).rows[0].count);

  const found = await registry.getByAuthority(scope, 'CREATIVE_EXECUTION', issued.run.authorityRef);
  assert.deepEqual(found, issued.run);
  assert.equal(await registry.getByAuthority({ ...scope, userId: 'other-user' }, 'CREATIVE_EXECUTION', issued.run.authorityRef), undefined);
  assert.equal(await registry.getByAuthority({ ...scope, projectId: otherProjectId }, 'CREATIVE_EXECUTION', issued.run.authorityRef), undefined);
  assert.equal(await registry.getByAuthority(scope, 'CREATIVE_EXECUTION', 'creative-authority-missing'), undefined);

  const after = await registry.get(scope, issued.run.runId);
  assert.deepEqual(after, before);
  const rowCountAfter = Number((await pool.query('SELECT COUNT(*)::int AS count FROM canonical_execution_runs')).rows[0].count);
  assert.equal(rowCountAfter, rowCountBefore);
  assert.equal(after?.status, 'QUEUED');
  assert.equal(after?.revision, 1);
});
