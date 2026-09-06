import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateImageArtifactSchema } from '../server/core/artifacts/imageArtifactSchema.ts';
import { migrateExecutionRunSchema } from '../server/core/execution/executionRunSchema.ts';
import { PostgresExecutionRunRegistry } from '../server/core/execution/PostgresExecutionRunRegistry.ts';
import { migrateProjectSchema } from '../server/core/projects/projectSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for ExecutionRun identity acceptance');
const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-execution-run-identity-p1f' });
const projects = new PostgresProjectStore(pool);
const registry = new PostgresExecutionRunRegistry(pool);
const owner = Object.freeze({ tenantId: 'tenant-p1f-identity', userId: 'user-p1f-identity' });
let projectId = '';

async function png() {
  return new Uint8Array(await sharp({ create: { width: 2, height: 2, channels: 4, background: { r: 17, g: 23, b: 31, alpha: 1 } } }).png().toBuffer());
}

function input(idempotencyKey = 'creative-run-v1:exact') {
  return Object.freeze({
    scope: Object.freeze({ ...owner, projectId }),
    capability: 'CREATIVE_EXECUTION' as const,
    idempotencyKey,
    authorityKind: 'CREATIVE_EXECUTION' as const,
    authorityRef: 'creative-p1f-authority-1',
  });
}

test.before(async () => {
  await migrateImageArtifactSchema(pool);
  await migrateProjectSchema(pool);
  await migrateExecutionRunSchema(pool);
  await pool.query('TRUNCATE canonical_execution_runs,canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts RESTART IDENTITY CASCADE');
  const row = await projects.create(owner, 'P1f identity project', await png(), { maxDimension: 64, maxPixels: 4096 });
  projectId = String(row.project_id).toLowerCase();
});

test.after(async () => {
  await pool.query('TRUNCATE canonical_execution_runs,canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts RESTART IDENTITY CASCADE');
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query('TRUNCATE canonical_execution_runs RESTART IDENTITY CASCADE');
});

test('exact scoped identity resolves the same durable run through both immutable bindings', async () => {
  const issued = await registry.issue(input());
  const lookup = await registry.lookupIdentity(input());
  assert.equal(lookup.byIdempotencyKey?.runId, issued.run.runId);
  assert.equal(lookup.byAuthority?.runId, issued.run.runId);
  assert.equal(lookup.byIdempotencyKey?.idempotencyKey, input().idempotencyKey);
  assert.equal(lookup.byAuthority?.authorityRef, input().authorityRef);
  assert.equal(lookup.byIdempotencyKey?.revision, 1);
  assert.equal(lookup.byAuthority?.status, 'QUEUED');
});

test('changed replay key with the same authority resolves authority only and performs no mutation', async () => {
  const issued = await registry.issue(input());
  const before = await registry.get(issued.run.scope, issued.run.runId);
  const lookup = await registry.lookupIdentity(input('creative-run-v1:changed-fingerprint'));
  assert.equal(lookup.byIdempotencyKey, undefined);
  assert.equal(lookup.byAuthority?.runId, issued.run.runId);
  const after = await registry.get(issued.run.scope, issued.run.runId);
  assert.deepEqual(after, before);
});

test('identity lookup is scope-bound and cannot reveal a globally unique authority across user scope', async () => {
  await registry.issue(input());
  const lookup = await registry.lookupIdentity({
    ...input(),
    scope: { tenantId: owner.tenantId, userId: 'other-user', projectId },
  });
  assert.deepEqual(lookup, {});
});

test('identity lookup preserves capability and authority binding validation without widening enums', async () => {
  await assert.rejects(
    () => registry.lookupIdentity({ ...input(), authorityKind: 'WORKFLOW_CONTINUATION' as any }),
    /incompatible/,
  );
  await assert.rejects(
    () => registry.lookupIdentity({ ...input(), capability: 'AUTOMATION' as any }),
    /outside the accepted execution run enum/,
  );
});
