import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CreativeExecutionPlatform } from '../src/platform/creative/canonical/CreativeExecutionPlatform.ts';
import { ProductionProviderSelector, productionProviderSelection } from '../server/core/providers/productionProviderSelection.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const request = Object.freeze({ id: 'provider-selection-proof', intent: 'edit image', scope, budget: { credits: 1, latencyMs: 1_000, ramMb: 128, gpuMs: 0, aiCalls: 1, retries: 0 } });

const input = (operation: { id: string; type: string; providerId?: string }, target: 'LOCAL' | 'CLOUD' | 'HYBRID' | 'BLOCKED' = 'CLOUD') => ({ request, operation, target });

test('production provider selector ignores planner provider identity and admits only real current bindings', () => {
  const selector = new ProductionProviderSelector();
  assert.deepEqual(selector.select(input({ id: 'global', type: 'image-edit', providerId: 'evil' })), {
    allowed: true,
    reasonCode: 'PROVIDER_SELECTED',
    providerId: 'fal',
    selectionId: 'provider:fal:image-edit:cloud:v1',
  });
  assert.deepEqual(selector.select(input({ id: 'controlled', type: 'CONTROLLED_LOCAL_EDIT', providerId: 'evil' })), {
    allowed: true,
    reasonCode: 'PROVIDER_SELECTED',
    providerId: 'fal',
    selectionId: 'provider:fal:controlled-local-edit:cloud:v1',
  });
  for (const type of ['segment', 'remove', 'background_replace', 'relight', 'verify']) {
    assert.deepEqual(selector.select(input({ id: type, type, providerId: 'fal' })), { allowed: false, reasonCode: 'UNSUPPORTED_OPERATION' });
  }
  assert.deepEqual(selector.select(input({ id: 'local', type: 'image-edit', providerId: 'fal' }, 'LOCAL')), { allowed: false, reasonCode: 'UNSUPPORTED_TARGET' });
  assert.deepEqual(selector.select(input({ id: 'blocked', type: 'image-edit', providerId: 'fal' }, 'BLOCKED')), { allowed: false, reasonCode: 'TARGET_BLOCKED' });
  assert.equal(Object.isFrozen(selector.select(input({ id: 'frozen', type: 'image-edit' }))), true);
});

test('canonical provider binding overrides forged planner provider before capability, security, billing and runtime', async () => {
  const events: string[] = [];
  const seen = { capability: '', security: '', runtime: '' };
  const platform = new CreativeExecutionPlatform({
    decision: { decide: async value => ({ requestId: value.id, goal: value.intent, constraints: [] }) },
    planning: { plan: async value => ({ requestId: value.id, status: 'READY', operations: [{ id: 'edit', type: 'image-edit', providerId: 'evil', produces: ['image'] }] }) },
    targetSelector: { select: () => 'CLOUD' },
    providerSelector: { select: value => { events.push('provider'); return productionProviderSelection.select(value); } },
    capabilityAdmission: { admit: ({ operation }) => { events.push('capability'); seen.capability = operation.providerId ?? ''; return { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'proof:fal' }; } },
    securityGate: { authorize: (_request, operation) => { events.push('security'); seen.security = operation.providerId ?? ''; return true; } },
    providers: { isAvailable: providerId => providerId === 'fal', fallback: () => undefined },
    runtime: { execute: async ({ operation }) => { events.push('runtime'); seen.runtime = operation.providerId ?? ''; return { artifacts: [{ id: 'provider-output', kind: 'image', value: { safe: true } }] }; } },
    verifier: { verify: async operation => ({ stepId: operation.id, valid: true, checks: ['provider-bound'], errors: [] }) },
    recovery: { decide: () => 'ABORT' },
    billing: { reserve: async () => { events.push('reserve'); }, commit: async () => { events.push('commit'); }, release: async () => { events.push('release'); } },
    now: () => 1,
  });
  platform.createExecution(request);
  const compiled = await platform.compile(request.id);
  assert.equal(compiled.operations[0].providerId, 'fal');
  assert.equal(compiled.operations[0].providerId === 'evil', false);
  const outcome = await platform.execute(request.id);
  assert.equal(outcome.status, 'SUCCESS');
  assert.deepEqual(seen, { capability: 'fal', security: 'fal', runtime: 'fal' });
  assert.deepEqual(events, ['provider', 'capability', 'security', 'reserve', 'runtime', 'commit']);
  assert.equal(outcome.workflow?.operations[0].providerId, 'fal');
});

test('unsupported semantic operation fails at provider selection before downstream authorities', async () => {
  const calls = { capability: 0, security: 0, reserve: 0, runtime: 0 };
  const unsupported = { ...request, id: 'unsupported-provider-selection' };
  const platform = new CreativeExecutionPlatform({
    decision: { decide: async value => ({ requestId: value.id, goal: value.intent, constraints: [] }) },
    planning: { plan: async value => ({ requestId: value.id, status: 'READY', operations: [{ id: 'segment', type: 'segment', providerId: 'fal', produces: ['mask'] }] }) },
    targetSelector: { select: () => 'CLOUD' },
    providerSelector: productionProviderSelection,
    capabilityAdmission: { admit: () => { calls.capability++; return { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED' }; } },
    securityGate: { authorize: () => { calls.security++; return true; } },
    providers: { isAvailable: () => true, fallback: () => undefined },
    runtime: { execute: async () => { calls.runtime++; return {}; } },
    recovery: { decide: () => 'ABORT' },
    billing: { reserve: async () => { calls.reserve++; }, commit: async () => {}, release: async () => {} },
  });
  platform.createExecution(unsupported);
  await assert.rejects(platform.compile(unsupported.id), /Provider selection blocked operation segment: UNSUPPORTED_OPERATION/);
  assert.deepEqual(calls, { capability: 0, security: 0, reserve: 0, runtime: 0 });
});

test('BLOCKED target stops before provider selection and every downstream side effect', async () => {
  const calls = { provider: 0, capability: 0, security: 0, reserve: 0, runtime: 0 };
  const blocked = { ...request, id: 'blocked-provider-selection' };
  const platform = new CreativeExecutionPlatform({
    decision: { decide: async value => ({ requestId: value.id, goal: value.intent, constraints: [] }) },
    planning: { plan: async value => ({ requestId: value.id, status: 'READY', operations: [{ id: 'edit', type: 'image-edit', providerId: 'evil', produces: ['image'] }] }) },
    targetSelector: { select: () => 'BLOCKED' },
    providerSelector: { select: value => { calls.provider++; return productionProviderSelection.select(value); } },
    capabilityAdmission: { admit: () => { calls.capability++; return { allowed: true, reasonCode: 'CAPABILITY_SUPPORTED' }; } },
    securityGate: { authorize: () => { calls.security++; return true; } },
    providers: { isAvailable: () => true, fallback: () => undefined },
    runtime: { execute: async () => { calls.runtime++; return {}; } },
    recovery: { decide: () => 'ABORT' },
    billing: { reserve: async () => { calls.reserve++; }, commit: async () => {}, release: async () => {} },
  });
  platform.createExecution(blocked);
  await assert.rejects(platform.compile(blocked.id), /TARGET_BLOCKED/);
  assert.deepEqual(calls, { provider: 0, capability: 0, security: 0, reserve: 0, runtime: 0 });
});

test('provider selection is a narrow pure policy and production wires one named boundary', async () => {
  const selector = await readFile('server/core/providers/productionProviderSelection.ts', 'utf8');
  for (const marker of ['/auth/', '/projects/', '/artifacts/', '/transactions/', '/billing/', "from 'pg'", 'Postgres', 'TransactionService', 'ArtifactAuthority', 'fetch(', 'apiKey', 'authorization']) {
    assert.equal(selector.includes(marker), false, `provider selector owns forbidden authority/transport surface ${marker}`);
  }
  assert.equal(selector.includes('operation.providerId'), false, 'planner provider identity must not drive canonical provider selection');
  const production = await readFile('server/core/composition/createProductionCore.ts', 'utf8');
  assert.equal(production.includes('providerSelector: productionProviderSelection'), true);
  assert.equal(production.includes('compositeExecutionEnabled: true'), false);
  const platform = await readFile('src/platform/creative/canonical/CreativeExecutionPlatform.ts', 'utf8');
  const targetIndex = platform.indexOf('targetSelector.select');
  const hardConstraintIndex = platform.indexOf('validateExecutionTargets');
  const providerIndex = platform.indexOf('providerSelector.select');
  const capabilityIndex = platform.indexOf('capabilityAdmission.admit');
  const securityIndex = platform.indexOf('securityGate.authorize');
  const reserveIndex = platform.indexOf('#authority.reserve');
  assert.ok(targetIndex >= 0 && hardConstraintIndex > targetIndex && providerIndex > hardConstraintIndex && capabilityIndex > providerIndex && securityIndex > capabilityIndex && reserveIndex > securityIndex);
});
