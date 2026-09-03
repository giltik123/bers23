import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';

import { CreativeExecutionService } from '../server/core/application/creativeExecutionService.ts';
import { PostgresExecutionRunRegistry } from '../server/core/execution/PostgresExecutionRunRegistry.ts';
import { checkExecutionRunSchema } from '../server/core/execution/executionRunSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';
import type { BillingTransactionAuthority } from '../src/platform/creative/authority/contracts.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Creative durable restart acceptance');

const pool = new Pool({ connectionString: databaseUrl, max: 8, application_name: 'bers-creative-run-restart-acceptance' });
const projects = new PostgresProjectStore(pool);
const auth = Object.freeze({ tenantId: 'tenant-creative-restart', userId: 'user-creative-restart' });
let projectId = '';

async function png() {
  return new Uint8Array(await sharp({
    create: { width: 2, height: 2, channels: 4, background: { r: 40, g: 50, b: 60, alpha: 1 } },
  }).png().toBuffer());
}

async function resetDatabase() {
  await pool.query('TRUNCATE canonical_execution_runs,canonical_projects,canonical_project_history,canonical_project_versions,canonical_image_artifacts RESTART IDENTITY CASCADE');
}

test.before(async () => {
  await checkExecutionRunSchema(pool);
  await resetDatabase();
  const project = await projects.create(auth, 'Creative durable restart project', await png(), { maxDimension: 64, maxPixels: 4096 });
  projectId = String(project.project_id).toLowerCase();
});

test.after(async () => {
  await resetDatabase();
  await pool.end();
});

test.beforeEach(async () => {
  await pool.query('TRUNCATE canonical_execution_runs RESTART IDENTITY CASCADE');
});

type Counters = { providerCalls: number; billingMutations: number };
type RuntimeMode = 'success' | 'unknown';

function createService(registry: PostgresExecutionRunRegistry, counters: Counters, runtimeMode: RuntimeMode) {
  const billing: BillingTransactionAuthority = {
    reserve: async () => {
      counters.billingMutations += 1;
      return { reservationId: 'restart-reservation-1', status: 'RESERVED' };
    },
    commit: async reservationId => {
      counters.billingMutations += 1;
      return { reservationId, status: 'COMMITTED' };
    },
    release: async reservationId => {
      counters.billingMutations += 1;
      return { reservationId, status: 'RELEASED' };
    },
    unknown: async reservationId => {
      counters.billingMutations += 1;
      return { reservationId, status: 'UNKNOWN' };
    },
  };

  return new CreativeExecutionService({
    executionRuns: registry,
    creditsPerEdit: 1,
    hardBudgetCredits: 1,
    ownsArtifacts: async () => true,
    platform: {
      billing,
      decision: { decide: async request => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
      planning: { plan: async request => ({
        requestId: request.id,
        operations: [{ id: 'image-edit', type: 'image-edit', produces: ['image'], cost: { credits: 1 } }],
      }) },
      routeSelector: { select: () => 'PROVIDER' },
      targetSelector: { select: () => 'CLOUD' },
      providerSelector: { select: () => ({ allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'fal', selectionId: 'creative-restart:fal' }) },
      capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'creative-restart-provider' }) },
      securityGate: { authorize: () => true },
      runtime: {
        execute: async () => {
          counters.providerCalls += 1;
          if (runtimeMode === 'unknown') {
            throw Object.assign(new Error('provider response lost after dispatch'), {
              code: 'PROVIDER_RESULT_UNKNOWN',
              unknownOutcome: true,
            });
          }
          return { artifacts: [{ id: 'restart-result', kind: 'image', value: { url: 'https://assets.example.test/restart-result.png' } }] };
        },
      },
      providers: { isAvailable: () => true, fallback: () => undefined },
      verifier: { verify: async operation => ({ stepId: operation.id, valid: true, checks: ['image'], errors: [] }) },
      recovery: { decide: () => 'MARK_UNKNOWN' },
      now: (() => { let value = 100; return () => ++value; })(),
      id: (() => { let value = 0; return () => `creative-restart-id-${++value}`; })(),
    },
  });
}

test('process restart replay of a RUNNING UNKNOWN Creative execution never redispatches Billing or provider work', async () => {
  const scope = Object.freeze({ ...auth, projectId });
  const command = Object.freeze({
    projectId,
    instruction: 'preserve the product and make it blue',
    inputArtifactId: 'artifact-creative-restart',
    clientRequestId: 'creative-restart-request-1',
  });
  const counters: Counters = { providerCalls: 0, billingMutations: 0 };

  const firstRegistry = new PostgresExecutionRunRegistry(pool);
  const firstProcess = createService(firstRegistry, counters, 'unknown');
  const firstOutcome = await firstProcess.execute(command, auth);
  assert.equal(firstOutcome.status, 'UNKNOWN');
  assert.equal(counters.providerCalls, 1);
  assert.ok(counters.billingMutations > 0);

  const firstRuns = await firstRegistry.list(scope);
  assert.equal(firstRuns.length, 1);
  assert.equal(firstRuns[0].capability, 'CREATIVE_EXECUTION');
  assert.equal(firstRuns[0].authorityKind, 'CREATIVE_EXECUTION');
  assert.equal(firstRuns[0].idempotencyKey, command.clientRequestId);
  assert.equal(firstRuns[0].status, 'RUNNING');
  const durableRunId = firstRuns[0].runId;
  const sideEffectsAfterFirstProcess = Object.freeze({ ...counters });

  // Simulate a process restart: no in-memory service state or registry instance is reused.
  const secondRegistry = new PostgresExecutionRunRegistry(pool);
  const secondProcess = createService(secondRegistry, counters, 'success');
  await assert.rejects(
    () => secondProcess.execute(command, auth),
    (error: any) => error?.code === 'creative_reconciliation_required'
      && error?.status === 409
      && error?.retryable === true,
  );

  assert.deepEqual(counters, sideEffectsAfterFirstProcess, 'restart replay must not mutate Billing or dispatch provider work');
  const afterRestart = await secondRegistry.list(scope);
  assert.equal(afterRestart.length, 1);
  assert.equal(afterRestart[0].runId, durableRunId);
  assert.equal(afterRestart[0].status, 'RUNNING');

  const directReplay = await secondRegistry.issue({
    scope,
    capability: 'CREATIVE_EXECUTION',
    idempotencyKey: command.clientRequestId,
    authorityKind: 'CREATIVE_EXECUTION',
    authorityRef: firstOutcome.executionId,
  });
  assert.equal(directReplay.created, false);
  assert.equal(directReplay.run.runId, durableRunId);
  assert.equal(directReplay.run.status, 'RUNNING');
  assert.deepEqual(counters, sideEffectsAfterFirstProcess);
});
