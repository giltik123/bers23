import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { PostgresImageArtifactStore } from '../server/core/artifacts/postgresImageArtifactStore.ts';
import { PostgresAutomationDefinitionStore } from '../server/core/automation/PostgresAutomationDefinitionStore.ts';
import {
  PostgresAutomationInvocationStore,
  automationInvocationPlanDigest,
} from '../server/core/automation/PostgresAutomationInvocationStore.ts';
import { checkAutomationInvocationSchema } from '../server/core/automation/automationInvocationSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');
const pool = new Pool({ connectionString: databaseUrl, max: 10, application_name: 'bers-c3b-automation-invocation' });
const LIMITS = Object.freeze({ maxDimension: 16384, maxPixels: 268435456 });

async function png(width = 3, height = 2) {
  return new Uint8Array(await sharp({
    create: { width, height, channels: 4, background: { r: 20, g: 40, b: 60, alpha: 1 } },
  }).png().toBuffer());
}

async function fixture(label: string) {
  const scope = Object.freeze({ tenantId: `tenant-${label}-${randomUUID()}`, userId: `user-${label}-${randomUUID()}` });
  const projects = new PostgresProjectStore(pool);
  const project = await projects.create(scope, `Project ${label}`, await png(), LIMITS);
  const definitions = new PostgresAutomationDefinitionStore(pool, LIMITS);
  const definition = await definitions.create(scope, Object.freeze({
    name: `Automation ${label}`,
    trigger: 'MANUAL',
    plan: Object.freeze({
      kind: 'BOUNDED_DETERMINISTIC_IMAGE_V1',
      orthogonalMode: 'ROTATE_90_CW',
      targetWidth: 5,
      targetHeight: 7,
    }),
  }));
  const invocations = new PostgresAutomationInvocationStore(pool);
  return { scope, projects, project, definitions, definition, invocations };
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: any) => error?.code === code);
}

test('C3b binding atomically snapshots exact ACTIVE definition and current ORIGINAL, then replays immutably', async () => {
  await checkAutomationInvocationSchema(pool);
  const { scope, project, definitions, definition, invocations } = await fixture('immutable');
  const command = Object.freeze({
    automationId: definition.id,
    definitionRevision: definition.revision,
    projectId: String(project.project_id),
    clientRequestId: `manual-${randomUUID()}`,
  });

  const first = await invocations.bind(scope, command);
  assert.equal(first.automationId, definition.id);
  assert.equal(first.definitionRevision, 1);
  assert.deepEqual(first.plan, definition.plan);
  assert.equal(first.planDigest, automationInvocationPlanDigest(definition.plan));
  assert.equal(first.projectId, String(project.project_id));
  assert.equal(first.sourceImageStorageId, String(project.current_image_storage_id));
  assert.equal(first.sourceRole, 'ORIGINAL');
  assert.deepEqual([first.sourceWidth, first.sourceHeight], [3, 2]);
  assert.match(first.downstreamClientRequestId, /^automation-agent-v1-[0-9a-f]{64}$/);
  assert.notEqual(first.downstreamClientRequestId, command.clientRequestId);

  const replay = await invocations.bind(scope, command);
  assert.deepEqual(replay, first);
  const count = await pool.query(`SELECT count(*)::int AS count FROM canonical_automation_invocation_bindings
    WHERE tenant_id=$1 AND user_id=$2 AND automation_id=$3 AND project_id=$4 AND client_request_id=$5`,
  [scope.tenantId, scope.userId, definition.id, project.project_id, command.clientRequestId]);
  assert.equal(count.rows[0]?.count, 1);

  const edited = await definitions.update(scope, definition.id, 1, Object.freeze({ name: 'Edited after binding' }));
  const archived = await definitions.archive(scope, definition.id, edited.revision);
  assert.equal(archived.status, 'ARCHIVED');
  assert.deepEqual(await invocations.bind(scope, command), first, 'accepted binding must replay after later definition mutation/archive');
  await expectCode(invocations.bind(scope, Object.freeze({ ...command, definitionRevision: 2 })), 'automation_invocation_revision_conflict');
  await expectCode(invocations.bind(scope, Object.freeze({ ...command, clientRequestId: `stale-${randomUUID()}` })), 'automation_revision_conflict');
  await expectCode(invocations.bind(scope, Object.freeze({ ...command, definitionRevision: archived.revision, clientRequestId: `archived-${randomUUID()}` })), 'automation_not_active');
});

test('C3b binding is isolated by tenant/user and a new invocation snapshots the current COMPOSITE Project cursor', async () => {
  const { scope, projects, project, definition, invocations } = await fixture('source');
  const first = await invocations.bind(scope, Object.freeze({
    automationId: definition.id,
    definitionRevision: definition.revision,
    projectId: String(project.project_id),
    clientRequestId: `before-${randomUUID()}`,
  }));
  assert.equal(first.sourceRole, 'ORIGINAL');

  const imageStore = new PostgresImageArtifactStore(pool);
  const final = await imageStore.persistFinal(
    Object.freeze({ ...scope, projectId: String(project.project_id) }),
    `execution-${randomUUID()}`,
    `operation-${randomUUID()}`,
    Object.freeze({ width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4).fill(127) }),
  );
  await projects.acceptFinal(scope, String(project.project_id), final.storageId, 'C3b source transition');

  const after = await invocations.bind(scope, Object.freeze({
    automationId: definition.id,
    definitionRevision: definition.revision,
    projectId: String(project.project_id),
    clientRequestId: `after-${randomUUID()}`,
  }));
  assert.equal(after.sourceImageStorageId, final.storageId);
  assert.equal(after.sourceRole, 'COMPOSITE');
  assert.deepEqual([after.sourceWidth, after.sourceHeight], [4, 4]);

  const otherUser = Object.freeze({ tenantId: scope.tenantId, userId: `other-${randomUUID()}` });
  const otherTenant = Object.freeze({ tenantId: `other-${randomUUID()}`, userId: scope.userId });
  assert.equal(await invocations.get(otherUser, first.invocationId), undefined);
  assert.equal(await invocations.get(otherTenant, first.invocationId), undefined);
  await expectCode(invocations.bind(otherUser, Object.freeze({
    automationId: definition.id, definitionRevision: 1, projectId: String(project.project_id), clientRequestId: `scope-${randomUUID()}`,
  })), 'automation_not_found');
});

test('C3b schema checker rejects a same-name permissive invocation constraint', async () => {
  await checkAutomationInvocationSchema(pool);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE canonical_automation_invocation_bindings DROP CONSTRAINT canonical_automation_invocation_bindings_client_request_check');
    await client.query(`ALTER TABLE canonical_automation_invocation_bindings
      ADD CONSTRAINT canonical_automation_invocation_bindings_client_request_check
      CHECK (client_request_id ~ '^[A-Za-z0-9._:-]{1,160}$' OR TRUE)`);
    await assert.rejects(checkAutomationInvocationSchema(client as any), /incomplete or permissive/);
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
});

test.after(async () => { await pool.end(); });
