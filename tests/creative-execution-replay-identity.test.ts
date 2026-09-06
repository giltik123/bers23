import assert from 'node:assert/strict';
import test from 'node:test';
import { CreativeExecutionService } from '../server/core/application/creativeExecutionService.ts';
import { creativeExecutionIdentity } from '../server/core/application/creativeExecutionIdentity.ts';
import type {
  ExecutionRun,
  ExecutionRunIdentityReader,
  ExecutionRunRegistry,
  ExecutionRunScope,
  IssueExecutionRunInput,
} from '../server/core/execution/executionRunRegistry.ts';
import type { BillingTransactionAuthority } from '../src/platform/creative/authority/contracts.ts';

const auth = Object.freeze({ tenantId: 'tenant-p1f-replay', userId: 'user-p1f-replay' });
const command = Object.freeze({
  projectId: '11111111-1111-4111-8111-111111111111',
  instruction: 'make the product blue',
  inputArtifactId: 'artifact-p1f-original',
  selectedObjectIds: Object.freeze(['object-a']),
  maskArtifactIds: Object.freeze(['mask-a']),
  preserveMode: 'STRICT',
  clientRequestId: 'request-p1f-1',
});
const identity = creativeExecutionIdentity(command, auth);
const runScope = Object.freeze({ ...auth, projectId: command.projectId });

function storedRun(idempotencyKey = identity.runIdempotencyKey, status: ExecutionRun['status'] = 'RUNNING'): ExecutionRun {
  return Object.freeze({
    runId: '11111111-1111-4111-8111-111111111111',
    scope: runScope,
    capability: 'CREATIVE_EXECUTION',
    idempotencyKey,
    authorityKind: 'CREATIVE_EXECUTION',
    authorityRef: identity.executionId,
    status,
    revision: status === 'QUEUED' ? 1 : 2,
    createdAt: '2026-09-06T00:00:00.000Z',
    updatedAt: '2026-09-06T00:00:01.000Z',
    ...(status === 'RUNNING' ? { startedAt: '2026-09-06T00:00:01.000Z' } : {}),
    ...(status === 'SUCCEEDED' ? { startedAt: '2026-09-06T00:00:01.000Z', finishedAt: '2026-09-06T00:00:02.000Z' } : {}),
  });
}

class StoredIdentityReader implements ExecutionRunIdentityReader {
  constructor(readonly stored: ExecutionRun) {}
  async lookupIdentity(input: IssueExecutionRunInput) {
    const sameScope = input.scope.tenantId === this.stored.scope.tenantId
      && input.scope.userId === this.stored.scope.userId
      && input.scope.projectId === this.stored.scope.projectId;
    if (!sameScope) return Object.freeze({});
    const byIdempotencyKey = input.capability === this.stored.capability && input.idempotencyKey === this.stored.idempotencyKey ? this.stored : undefined;
    const byAuthority = input.authorityKind === this.stored.authorityKind && input.authorityRef === this.stored.authorityRef ? this.stored : undefined;
    return Object.freeze({
      ...(byIdempotencyKey ? { byIdempotencyKey } : {}),
      ...(byAuthority ? { byAuthority } : {}),
    });
  }
}

class FreshRuns implements ExecutionRunRegistry {
  run?: ExecutionRun;
  issueInput?: IssueExecutionRunInput;
  async issue(input: IssueExecutionRunInput) {
    this.issueInput = input;
    this.run = Object.freeze({
      runId: '22222222-2222-4222-8222-222222222222',
      scope: input.scope,
      capability: input.capability,
      idempotencyKey: input.idempotencyKey,
      authorityKind: input.authorityKind,
      authorityRef: input.authorityRef,
      ...(input.parentRunId ? { parentRunId: input.parentRunId } : {}),
      status: 'QUEUED',
      revision: 1,
      createdAt: '2026-09-06T00:00:00.000Z',
      updatedAt: '2026-09-06T00:00:00.000Z',
    });
    return Object.freeze({ run: this.run, created: true });
  }
  async get(_scope: ExecutionRunScope, _runId: string) { return this.run; }
  async list(_scope: ExecutionRunScope) { return Object.freeze(this.run ? [this.run] : []); }
  async listRoots(_scope: ExecutionRunScope) { return Object.freeze(this.run ? [this.run] : []); }
  async listChildren(_scope: ExecutionRunScope, _parentRunId: string) { return Object.freeze([]); }
  async start() { this.run = Object.freeze({ ...this.run!, status: 'RUNNING', revision: 2, startedAt: '2026-09-06T00:00:01.000Z' }); return this.run; }
  async succeed() { this.run = Object.freeze({ ...this.run!, status: 'SUCCEEDED', revision: 3, finishedAt: '2026-09-06T00:00:02.000Z' }); return this.run; }
  async fail(_scope: ExecutionRunScope, _runId: string, reasonCode: string) { this.run = Object.freeze({ ...this.run!, status: 'FAILED', revision: 3, statusReasonCode: reasonCode, finishedAt: '2026-09-06T00:00:02.000Z' }); return this.run; }
  async cancel(_scope: ExecutionRunScope, _runId: string, reasonCode: string) { this.run = Object.freeze({ ...this.run!, status: 'CANCELLED', revision: 3, statusReasonCode: reasonCode, finishedAt: '2026-09-06T00:00:02.000Z' }); return this.run; }
  async markUnknown(_scope: ExecutionRunScope, _runId: string, reasonCode: string) { this.run = Object.freeze({ ...this.run!, status: 'UNKNOWN', revision: 3, statusReasonCode: reasonCode, finishedAt: '2026-09-06T00:00:02.000Z' }); return this.run; }
}

type FixtureOptions = Readonly<{
  identityReader?: ExecutionRunIdentityReader;
  runs?: ExecutionRunRegistry;
  holdProvider?: boolean;
}>;

function fixture(options: FixtureOptions = {}) {
  const events: string[] = [];
  let ownershipReads = 0;
  let billingMutations = 0;
  let providerCalls = 0;
  let persistedFinals = 0;
  let releaseProvider!: () => void;
  const providerRelease = new Promise<void>((resolve) => { releaseProvider = resolve; });
  let providerEnteredResolve!: () => void;
  const providerEntered = new Promise<void>((resolve) => { providerEnteredResolve = resolve; });

  const billing: BillingTransactionAuthority = {
    reserve: async () => { events.push('billing:reserve'); billingMutations += 1; return { reservationId: 'reservation-p1f', status: 'RESERVED' }; },
    commit: async id => { events.push('billing:commit'); billingMutations += 1; return { reservationId: id, status: 'COMMITTED' }; },
    release: async id => { events.push('billing:release'); billingMutations += 1; return { reservationId: id, status: 'RELEASED' }; },
    unknown: async id => { events.push('billing:unknown'); billingMutations += 1; return { reservationId: id, status: 'UNKNOWN' }; },
  };

  const service = new CreativeExecutionService({
    executionRuns: options.runs,
    executionRunIdentity: options.identityReader,
    creditsPerEdit: 1,
    hardBudgetCredits: 1,
    ownsArtifacts: async () => { events.push('ownership'); ownershipReads += 1; return true; },
    hydrateArtifacts: async (scope, originalId, maskIds) => [
      { id: originalId, kind: 'image', value: { artifactId: originalId }, producerOperationId: 'user-input', scope, state: 'AVAILABLE', role: 'ORIGINAL' },
      ...maskIds.map(id => ({ id, kind: 'mask' as const, value: { artifactId: id }, producerOperationId: 'user-input', scope, state: 'AVAILABLE' as const, role: 'MASK' as const })),
    ],
    persistFinal: async (_scope, _executionId, artifact) => { events.push('persistFinal'); persistedFinals += 1; return artifact; },
    platform: {
      billing,
      decision: { decide: async request => ({ requestId: request.id, goal: request.intent, constraints: [] }) },
      planning: { plan: async request => { events.push('plan'); return { requestId: request.id, operations: [{ id: 'image-edit', type: 'image-edit', produces: ['image'], cost: { credits: 1 } }] }; } },
      routeSelector: { select: () => 'PROVIDER' },
      targetSelector: { select: () => 'CLOUD' },
      providerSelector: { select: () => ({ allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'fal', selectionId: 'p1f:fal' }) },
      capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'p1f-provider' }) },
      securityGate: { authorize: () => true },
      runtime: {
        execute: async () => {
          events.push('provider:execute');
          providerCalls += 1;
          providerEnteredResolve();
          if (options.holdProvider) await providerRelease;
          return { artifacts: [{ id: 'result', kind: 'image', role: 'COMPOSITE', state: 'FINAL', value: { url: 'https://assets.example.test/p1f.png' } }] };
        },
      },
      providers: { isAvailable: () => true, fallback: () => undefined },
      verifier: { verify: async operation => ({ stepId: operation.id, valid: true, checks: ['image'], errors: [] }) },
      recovery: { decide: () => 'MARK_UNKNOWN' },
      now: (() => { let value = 1; return () => ++value; })(),
      id: (() => { let value = 0; return () => `p1f-id-${++value}`; })(),
    },
  });

  return Object.freeze({
    service,
    events,
    providerEntered,
    releaseProvider,
    counters: () => Object.freeze({ ownershipReads, billingMutations, providerCalls, persistedFinals }),
  });
}

test('post-restart exact durable replay is reconciliation-only before ownership planning Billing provider or FINAL persistence', async () => {
  const stored = storedRun();
  const f = fixture({ identityReader: new StoredIdentityReader(stored) });
  await assert.rejects(
    () => f.service.execute(command, auth),
    (error: any) => error?.code === 'creative_exact_replay_reconciliation_required'
      && error?.status === 409
      && error?.retryable === false
      && error?.executionId === identity.executionId
      && error?.runStatus === 'RUNNING'
      && error?.replay === true,
  );
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.counters(), { ownershipReads: 0, billingMutations: 0, providerCalls: 0, persistedFinals: 0 });
});

test('same clientRequestId with changed payload is a hard conflict before all execution side effects', async () => {
  const stored = storedRun();
  const f = fixture({ identityReader: new StoredIdentityReader(stored) });
  await assert.rejects(
    () => f.service.execute({ ...command, instruction: 'make the product red' }, auth),
    (error: any) => error?.code === 'creative_idempotency_conflict'
      && error?.status === 409
      && error?.retryable === false
      && error?.executionId === identity.executionId
      && error?.replay === false,
  );
  assert.deepEqual(f.events, []);
  assert.deepEqual(f.counters(), { ownershipReads: 0, billingMutations: 0, providerCalls: 0, persistedFinals: 0 });
});

test('legacy raw-idempotency Creative run is reconciliation-only because historical payload fingerprint is unknowable', async () => {
  const f = fixture({ identityReader: new StoredIdentityReader(storedRun(command.clientRequestId)) });
  await assert.rejects(
    () => f.service.execute({ ...command, instruction: 'possibly changed legacy request' }, auth),
    (error: any) => error?.code === 'creative_reconciliation_required'
      && error?.status === 409
      && error?.retryable === false
      && error?.executionId === identity.executionId
      && error?.replay === true,
  );
  assert.deepEqual(f.events, []);
  assert.equal(f.counters().providerCalls, 0);
  assert.equal(f.counters().billingMutations, 0);
});

test('fresh clientRequestId creates a fingerprint-aware durable run and executes normally', async () => {
  const runs = new FreshRuns();
  const noExisting: ExecutionRunIdentityReader = { lookupIdentity: async () => Object.freeze({}) };
  const freshCommand = Object.freeze({ ...command, clientRequestId: 'request-p1f-fresh' });
  const freshIdentity = creativeExecutionIdentity(freshCommand, auth);
  const f = fixture({ identityReader: noExisting, runs });
  const outcome = await f.service.execute(freshCommand, auth);
  assert.equal(outcome.status, 'SUCCESS');
  assert.equal(outcome.executionId, freshIdentity.executionId);
  assert.equal(runs.issueInput?.idempotencyKey, freshIdentity.runIdempotencyKey);
  assert.equal(runs.issueInput?.authorityRef, freshIdentity.executionId);
  assert.deepEqual(f.counters(), { ownershipReads: 1, billingMutations: 2, providerCalls: 1, persistedFinals: 1 });
});

test('same-process changed payload cannot borrow the in-flight promise for the original request', async () => {
  const runs = new FreshRuns();
  const f = fixture({ runs, holdProvider: true });
  const original = f.service.execute(command, auth);
  await f.providerEntered;
  await assert.rejects(
    () => f.service.execute({ ...command, instruction: 'changed while original is running' }, auth),
    (error: any) => error?.code === 'creative_idempotency_conflict' && error?.replay === false,
  );
  assert.equal(f.counters().providerCalls, 1);
  assert.equal(f.counters().billingMutations, 1);
  f.releaseProvider();
  const outcome = await original;
  assert.equal(outcome.status, 'SUCCESS');
  assert.equal(f.counters().providerCalls, 1);
  assert.equal(f.counters().billingMutations, 2);
});
