import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PostgresWorkflowContinuationStore } from './PostgresWorkflowContinuationStore.ts';

const DATABASE_URL = process.env.DATABASE_URL;
const sourceSha = 'c'.repeat(64);
const planDigest = 'd'.repeat(64);

function input(token, parameters) {
  return Object.freeze({
    executionId: `agent-plan-${token}`,
    clientRequestId: `agent-plan-request-${token}`,
    scope: Object.freeze({ tenantId: `tenant-${token}`, userId: `user-${token}`, projectId: `project-${token}` }),
    plan: Object.freeze({
      planId: 'bounded-agent-deterministic-v1',
      planRevision: '1',
      planDigest,
      ...(parameters === undefined ? {} : { parameters }),
    }),
    inputArtifacts: Object.freeze([Object.freeze({
      artifactId: `source-${token}`,
      kind: 'image',
      role: 'ORIGINAL',
      sha256: sourceSha,
      parentArtifactIds: Object.freeze([]),
    })]),
  });
}

test('PostgreSQL preserves immutable normalized workflow plan parameters across Core restart and replay', { skip: !DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: DATABASE_URL, application_name: 'bers-agent-plan-parameters-test' });
  const token = randomUUID();
  try {
    const firstStore = new PostgresWorkflowContinuationStore(pool);
    const created = await firstStore.create(input(token, { width: 640, mode: ' ROTATE_90_CW ', height: 480 }));
    assert.deepEqual(created.plan.parameters, { height: 480, mode: 'ROTATE_90_CW', width: 640 });

    const row = await pool.query('SELECT plan_parameters_json FROM workflow_continuations WHERE execution_id=$1', [created.executionId]);
    assert.deepEqual(row.rows[0]?.plan_parameters_json, { height: 480, mode: 'ROTATE_90_CW', width: 640 });

    const afterRestart = new PostgresWorkflowContinuationStore(pool);
    assert.deepEqual(await afterRestart.get(created.executionId, created.scope), created);
    assert.deepEqual(await afterRestart.create(input(token, { height: 480, width: 640, mode: 'ROTATE_90_CW' })), created);
    await assert.rejects(
      () => afterRestart.create(input(token, { height: 480, width: 641, mode: 'ROTATE_90_CW' })),
      /already bound to another workflow continuation/,
    );
    await assert.rejects(
      () => afterRestart.create(input(token, { height: 480, width: 640, mode: 'FLIP_HORIZONTAL' })),
      /already bound to another workflow continuation/,
    );
  } finally {
    await pool.query('DELETE FROM workflow_continuations WHERE execution_id=$1', [`agent-plan-${token}`]).catch(() => undefined);
    await pool.end();
  }
});

test('PostgreSQL keeps legacy empty workflow plans snapshot-compatible while storing canonical empty JSON', { skip: !DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: DATABASE_URL, application_name: 'bers-agent-plan-legacy-test' });
  const token = randomUUID();
  try {
    const store = new PostgresWorkflowContinuationStore(pool);
    const created = await store.create(input(token, undefined));
    assert.equal(Object.hasOwn(created.plan, 'parameters'), false);
    const row = await pool.query('SELECT plan_parameters_json FROM workflow_continuations WHERE execution_id=$1', [created.executionId]);
    assert.deepEqual(row.rows[0]?.plan_parameters_json, {});
  } finally {
    await pool.query('DELETE FROM workflow_continuations WHERE execution_id=$1', [`agent-plan-${token}`]).catch(() => undefined);
    await pool.end();
  }
});
