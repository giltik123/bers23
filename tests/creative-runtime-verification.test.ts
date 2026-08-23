import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CreativeExecutionPlatform, type CreativeRequest } from '../src/platform/creative/canonical/index.ts';
import type { Artifact, WorkflowOperation } from '../src/platform/creative/workflow-engine/types.ts';
import { ProductionWorkflowVerifier, productionWorkflowVerifier } from '../server/core/providers/productionWorkflowVerifier.ts';

const scope = Object.freeze({ tenantId: 'tenant', projectId: 'project', userId: 'user' });
const hash = 'a'.repeat(64);
const validValue = Object.freeze({ url: 'https://provider.example/result.png', hash, mimeType: 'image/png' });
const artifact = (kind: string, value: unknown): Artifact => Object.freeze({ id: 'output', kind, value, producerStepId: 'edit', scope });
const operation = (extra: Readonly<Record<string, unknown>> = {}): WorkflowOperation => ({ id: 'edit', type: 'image-edit', providerId: 'fal', produces: ['image'], ...extra });

test('production image-edit verifier accepts only structurally valid downloaded image references', async () => {
  const verifier = new ProductionWorkflowVerifier();
  const accepted = await verifier.verify(operation(), [artifact('image', validValue)]);
  assert.deepEqual(accepted, {
    stepId: 'edit',
    valid: true,
    checks: ['PRODUCTION_OPERATION_SUPPORTED', 'OUTPUT_KIND_IMAGE', 'PROVIDER_IMAGE_REFERENCE_VALID'],
    errors: [],
  });
  assert.equal(Object.isFrozen(accepted), true);
  assert.equal(Object.isFrozen(accepted.checks), true);
  assert.equal(Object.isFrozen(accepted.errors), true);
});

test('production verifier fails closed for empty, wrong-kind and malformed provider outputs', async () => {
  const verifier = new ProductionWorkflowVerifier();
  assert.deepEqual(await verifier.verify(operation(), []), {
    stepId: 'edit', valid: false, checks: ['PRODUCTION_OPERATION_SUPPORTED'], errors: ['OUTPUT_REQUIRED'],
  });
  assert.deepEqual(await verifier.verify(operation(), [artifact('mask', validValue)]), {
    stepId: 'edit', valid: false, checks: ['PRODUCTION_OPERATION_SUPPORTED'], errors: ['OUTPUT_KIND_INVALID'],
  });
  for (const value of [
    {},
    { url: 'http://provider.example/result.png', hash, mimeType: 'image/png' },
    { url: 'https://user:pass@provider.example/result.png', hash, mimeType: 'image/png' },
    { url: 'https://provider.example/result.png', hash: 'not-a-sha256', mimeType: 'image/png' },
    { url: 'https://provider.example/result.png', hash, mimeType: 'text/html' },
  ]) {
    const result = await verifier.verify(operation(), [artifact('image', value)]);
    assert.equal(result.valid, false);
    assert.deepEqual(result.errors, ['PROVIDER_IMAGE_REFERENCE_INVALID']);
  }
});

test('planner verification claims cannot bless malformed output and unsupported operations fail closed', async () => {
  const forged = operation({ verificationPassed: true, quality: 1, verification: [{ required: false }] });
  const malformed = await productionWorkflowVerifier.verify(forged, [artifact('image', { url: 'https://provider.example/result.png', hash: 'forged', mimeType: 'image/png' })]);
  assert.equal(malformed.valid, false);
  assert.deepEqual(malformed.errors, ['PROVIDER_IMAGE_REFERENCE_INVALID']);
  const unsupported = await productionWorkflowVerifier.verify({ id: 'segment', type: 'segment', providerId: 'fal' }, [artifact('mask', validValue)]);
  assert.deepEqual(unsupported, { stepId: 'segment', valid: false, checks: [], errors: ['UNSUPPORTED_OPERATION_VERIFICATION'] });
});

test('generic verifier cannot replace canonical controlled-edit integrity verification', async () => {
  const result = await productionWorkflowVerifier.verify({ id: 'controlled', type: 'CONTROLLED_LOCAL_EDIT', providerId: 'fal' }, [artifact('image', validValue)]);
  assert.deepEqual(result, { stepId: 'controlled', valid: false, checks: [], errors: ['CONTROLLED_INTEGRITY_VERIFICATION_REQUIRED'] });
});

test('runtime verification failure produces FAILED and release while valid output commits exactly once', async () => {
  for (const malformed of [false, true]) {
    const billing: string[] = [];
    const request: CreativeRequest = { id: `runtime-verification-${malformed}`, intent: 'edit', scope, budget: { credits: 1, aiCalls: 1, latencyMs: 1_000, ramMb: 128, gpuMs: 0, retries: 0 } };
    const platform = new CreativeExecutionPlatform({
      decision: { decide: async value => ({ requestId: value.id, goal: value.intent, constraints: [] }) },
      planning: { plan: async value => ({ requestId: value.id, status: 'READY', operations: [{ id: 'edit', type: 'image-edit', providerId: 'forged', produces: ['image'], verificationPassed: true } as never] }) },
      routeSelector: { select: () => 'PROVIDER' }, targetSelector: { select: () => 'CLOUD' },
      providerSelector: { select: () => ({ allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'fal', selectionId: 'test:fal:image-edit' }) },
      capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'fal:image-edit:v1' }) },
      securityGate: { authorize: () => true },
      providers: { isAvailable: providerId => providerId === 'fal', fallback: () => undefined },
      runtime: { execute: async () => ({ artifacts: [{ id: 'provider-output', kind: malformed ? 'mask' : 'image', value: validValue }] }) },
      verifier: productionWorkflowVerifier,
      recovery: { decide: () => 'ABORT' },
      billing: {
        reserve: async () => { billing.push('reserve'); return { reservationId: 'reservation', status: 'RESERVED' }; },
        commit: async reservationId => { billing.push('commit'); return { reservationId, status: 'COMMITTED' }; },
        release: async reservationId => { billing.push('release'); return { reservationId, status: 'RELEASED' }; },
        unknown: async reservationId => { billing.push('unknown'); return { reservationId, status: 'UNKNOWN' }; },
      },
      now: (() => { let value = 1_000; return () => ++value; })(),
      id: () => 'generated-id',
    });
    platform.createExecution(request);
    const outcome = await platform.execute(request.id);
    assert.equal(outcome.status, malformed ? 'FAILED' : 'SUCCESS');
    assert.deepEqual(billing, malformed ? ['reserve', 'release'] : ['reserve', 'commit']);
  }
});

test('unknown provider outcome remains UNKNOWN and never becomes verification failure', async () => {
  const billing: string[] = [];
  const request: CreativeRequest = { id: 'runtime-verification-unknown', intent: 'edit', scope, budget: { credits: 1, aiCalls: 1, latencyMs: 1_000, ramMb: 128, gpuMs: 0, retries: 0 } };
  const platform = new CreativeExecutionPlatform({
    decision: { decide: async value => ({ requestId: value.id, goal: value.intent, constraints: [] }) },
    planning: { plan: async value => ({ requestId: value.id, status: 'READY', operations: [{ id: 'edit', type: 'image-edit', produces: ['image'] }] }) },
    routeSelector: { select: () => 'PROVIDER' }, targetSelector: { select: () => 'CLOUD' },
    providerSelector: { select: () => ({ allowed: true, reasonCode: 'PROVIDER_SELECTED', providerId: 'fal', selectionId: 'test:fal:image-edit' }) },
    capabilityAdmission: { admit: () => ({ allowed: true, reasonCode: 'CAPABILITY_SUPPORTED', capabilityId: 'fal:image-edit:v1' }) },
    securityGate: { authorize: () => true },
    providers: { isAvailable: () => true, fallback: () => undefined },
    runtime: { execute: async () => { throw Object.assign(new Error('pending provider result'), { code: 'PROVIDER_RESULT_UNKNOWN', unknownOutcome: true }); } },
    verifier: productionWorkflowVerifier,
    recovery: { decide: () => 'MARK_UNKNOWN' },
    billing: {
      reserve: async () => { billing.push('reserve'); return { reservationId: 'reservation', status: 'RESERVED' }; },
      commit: async reservationId => { billing.push('commit'); return { reservationId, status: 'COMMITTED' }; },
      release: async reservationId => { billing.push('release'); return { reservationId, status: 'RELEASED' }; },
      unknown: async reservationId => { billing.push('unknown'); return { reservationId, status: 'UNKNOWN' }; },
    },
    now: (() => { let value = 1_000; return () => ++value; })(),
    id: () => 'generated-id',
  });
  platform.createExecution(request);
  const outcome = await platform.execute(request.id);
  assert.equal(outcome.status, 'UNKNOWN');
  assert.deepEqual(billing, ['reserve', 'unknown']);
  assert.deepEqual(outcome.verification.errors, ['Provider outcome pending reconciliation']);
});

test('production runtime verifier is a narrow authority-free policy and production composition wires it by name', async () => {
  const source = await readFile('server/core/providers/productionWorkflowVerifier.ts', 'utf8');
  for (const marker of ['/auth/', '/projects/', '/artifacts/', '/transactions/', '/billing/', "from 'pg'", 'Postgres', 'TransactionService', 'ArtifactAuthority', 'fetch(', 'apiKey', 'authorization', 'provider.execute']) {
    assert.equal(source.includes(marker), false, `production verifier owns forbidden authority/transport surface ${marker}`);
  }
  assert.equal(source.includes('verificationPassed'), false, 'planner verification claims must not drive production verification');
  const production = await readFile('server/core/composition/createProductionCore.ts', 'utf8');
  assert.equal(production.includes('verifier: productionWorkflowVerifier'), true);
  assert.equal(/verifier:\s*\{\s*verify:/.test(production), false, 'production composition must not embed an inline verifier algorithm');
  assert.equal(production.includes('compositeExecutionEnabled: true'), false);
});
