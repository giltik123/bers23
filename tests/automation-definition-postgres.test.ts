import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { migrateAutomationDefinitionSchema, checkAutomationDefinitionSchema } from '../server/core/automation/automationDefinitionSchema.ts';
import { PostgresAutomationDefinitionStore } from '../server/core/automation/PostgresAutomationDefinitionStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Automation definition acceptance');

const owner = Object.freeze({ tenantId: 'automation-tenant', userId: 'automation-user-a' });
const otherUser = Object.freeze({ tenantId: 'automation-tenant', userId: 'automation-user-b' });
const otherTenant = Object.freeze({ tenantId: 'automation-tenant-b', userId: 'automation-user-a' });
const limits = Object.freeze({ maxDimension: 4096, maxPixels: 16_777_216 });
const firstId = '11111111-1111-4111-8111-111111111111';

async function reset(pool: Pool) {
  await pool.query('DROP TABLE IF EXISTS canonical_automation_definitions CASCADE');
  await migrateAutomationDefinitionSchema(pool);
  await checkAutomationDefinitionSchema(pool);
}

test('Automation definition authority is Core-identified, revision-safe, tenant/user-scope-safe and restart durable', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await reset(pool);
    const definitions = new PostgresAutomationDefinitionStore(pool, limits, () => firstId);
    const created = await definitions.create(owner, {
      name: '  Rotate   and resize  ',
      trigger: 'MANUAL',
      plan: { kind: 'BOUNDED_DETERMINISTIC_IMAGE_V1', orthogonalMode: 'ROTATE_90_CW', targetWidth: 1024, targetHeight: 768 },
    });
    assert.equal(created.id, firstId);
    assert.equal(created.name, 'Rotate and resize');
    assert.equal(created.revision, 1);
    assert.equal(created.status, 'ACTIVE');
    assert.equal(await definitions.get(otherUser, created.id), undefined);
    assert.deepEqual(await definitions.list(otherUser), []);
    assert.equal(await definitions.get(otherTenant, created.id), undefined);
    assert.deepEqual(await definitions.list(otherTenant), []);
    await assert.rejects(
      () => definitions.update(otherUser, created.id, 1, { name: 'cross-user' }),
      (error: any) => error?.code === 'automation_not_found' && error?.status === 404,
    );
    await assert.rejects(
      () => definitions.archive(otherTenant, created.id, 1),
      (error: any) => error?.code === 'automation_not_found' && error?.status === 404,
    );

    const updated = await definitions.update(owner, created.id.toUpperCase(), 1, {
      plan: { kind: 'BOUNDED_DETERMINISTIC_IMAGE_V1', orthogonalMode: 'FLIP_HORIZONTAL', targetWidth: 800, targetHeight: 600 },
    });
    assert.equal(updated.revision, 2);
    assert.equal(updated.plan.orthogonalMode, 'FLIP_HORIZONTAL');
    await assert.rejects(() => definitions.update(owner, created.id, 1, { name: 'stale' }), (error: any) => error?.code === 'automation_revision_conflict' && error?.status === 409);

    const archived = await definitions.archive(owner, created.id, 2);
    assert.equal(archived.status, 'ARCHIVED');
    assert.equal(archived.revision, 3);
    await assert.rejects(() => definitions.update(owner, created.id, 3, { name: 'forbidden while archived' }), (error: any) => error?.code === 'automation_archived' && error?.status === 409);
    const restored = await definitions.restore(owner, created.id, 3);
    assert.equal(restored.status, 'ACTIVE');
    assert.equal(restored.revision, 4);

    for (const hostile of [
      { name: 'x', trigger: 'MANUAL', plan: created.plan, automationId: firstId },
      { name: 'x', trigger: 'MANUAL', plan: { ...created.plan, provider: 'fal' } },
      { name: 'x', trigger: 'MANUAL', plan: { ...created.plan, targetWidth: 99999 } },
      { name: 'x', trigger: 'schedule', plan: created.plan },
    ]) await assert.rejects(() => definitions.create(owner, hostile));
  } finally { await pool.end(); }

  const restarted = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    const definitions = new PostgresAutomationDefinitionStore(restarted, limits);
    const recovered = await definitions.get(owner, firstId);
    assert.equal(recovered?.revision, 4);
    assert.equal(recovered?.status, 'ACTIVE');
    assert.equal(recovered?.plan.targetWidth, 800);
  } finally { await restarted.end(); }
});

test('Automation schema readiness rejects same-name permissive constraints and hidden authority columns', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await reset(pool);
    await pool.query(`ALTER TABLE canonical_automation_definitions
      DROP CONSTRAINT canonical_automation_definitions_plan_kind_check,
      ADD CONSTRAINT canonical_automation_definitions_plan_kind_check
      CHECK (plan_kind = 'BOUNDED_DETERMINISTIC_IMAGE_V1' OR true)`);
    await assert.rejects(
      () => checkAutomationDefinitionSchema(pool),
      /incomplete or permissive/,
      'same-name same-literal OR true constraint must never satisfy readiness',
    );
    await assert.rejects(
      () => migrateAutomationDefinitionSchema(pool),
      /incomplete or permissive/,
      'CREATE TABLE IF NOT EXISTS must not mask existing permissive drift',
    );

    await reset(pool);
    await pool.query('ALTER TABLE canonical_automation_definitions ADD COLUMN provider text');
    await assert.rejects(
      () => checkAutomationDefinitionSchema(pool),
      /incomplete or permissive/,
      'unreviewed columns must not become hidden Automation authority',
    );
    await reset(pool);
  } finally { await pool.end(); }
});
