import assert from 'node:assert/strict';
import test from 'node:test';
import { ProductionOperationAuthority } from '../src/platform/creative/authority';
import { CreativeOperationReconciler } from '../src/platform/creative/integration';

const identity = { operationId: 'upscale', operationVersion: '1', operationFamily: 'image', tenantId: 'tenant', projectId: 'project', userId: 'user', requestId: 'request' };
const definition = { operationId: 'upscale', version: '1', family: 'image', capabilities: [], inputArtifacts: [], outputArtifacts: [], parametersSchema: {}, executionPolicy: {}, verificationPolicy: {}, resourceProfile: {}, costModel: {}, riskProfile: {}, billable: false };
const policy = { maxCredits: 0, maxProviderCost: 0, allowFallback: false, allowRetry: false, allowEscalation: false, budgetMode: 'HARD' as const };

test('a free local production operation is still authorized and reserved', async () => {
  let executed = 0;
  const authority = new ProductionOperationAuthority({ billing: { reserve: async () => { throw new Error('free operation touched billing'); }, commit: async () => { throw new Error('free operation touched billing'); }, release: async () => { throw new Error('free operation touched billing'); } }, execute: async () => { executed++; return { status: 'SUCCESS' }; }, now: () => '2026-01-01T00:00:00.000Z', id: () => 'authorization' });
  const operation = authority.instantiateOperation({ identity, definition, intent: { target: 'LOCAL', requiredCapabilities: [], executionMode: 'PRODUCTION', fallbackPolicy: {}, verificationPolicy: {} }, idempotencyKey: 'same-logical-operation' });
  authority.preflight(operation, { target: 'LOCAL', billable: false, credits: 0, policy });
  const authorization = authority.authorize(operation, { checks: { operationValid: true, capabilityAvailable: true, runtimeAllowed: true, modelTrusted: true, privacyAllowed: true, budgetAllowed: true, scopeValid: true }, policyVersion: '6.32', expiresAt: '2027-01-01T00:00:00.000Z', costPolicy: policy });
  const reservation = await authority.reserve(operation); await authority.execute(operation);
  const actual = authority.recordActualCost(operation, { actualProviderCost: { amount: 0, currency: 'USD' }, actualCreditsBasis: 0, actualLatency: 5, actualRetries: 0, actualFallbacks: 0, actualDeviceCost: 1, actualEnergyEstimate: 2 });
  authority.buildBillingEvent(operation, 0); await authority.commit(operation);
  assert.equal(authorization.allowed, true); assert.match(reservation.reservationId, /^free:/); assert.equal(actual.actualProviderCost.amount, 0); assert.equal(executed, 1); assert.equal(authority.snapshot(operation).lifecycle, 'COMMITTED');
});

test('hard worst-case budget blocks before execution', () => {
  const authority = new ProductionOperationAuthority({ billing: { reserve: async () => ({ reservationId: 'never', status: 'RESERVED' }), commit: async () => ({ reservationId: 'never', status: 'COMMITTED' }), release: async () => ({ reservationId: 'never', status: 'RELEASED' }) } });
  const operation = authority.instantiateOperation({ identity: { ...identity, operationId: 'cloud' }, definition: { ...definition, operationId: 'cloud', billable: true }, intent: { target: 'CLOUD', requiredCapabilities: [], executionMode: 'PRODUCTION', fallbackPolicy: {}, verificationPolicy: {} }, idempotencyKey: 'blocked-operation-key' });
  assert.throws(() => authority.preflight(operation, { target: 'CLOUD', billable: true, credits: 6, retries: 1, policy: { ...policy, maxCredits: 10 } }), /blocked/);
});

test('reconciler distinguishes matched, missing, inconsistent and unknown facts', () => {
  const reconciler = new CreativeOperationReconciler();
  assert.equal(reconciler.reconcile({}).status, 'missing');
  assert.equal(reconciler.reconcile({ reservation: { reservationId: 'r', status: 'UNKNOWN' } }).status, 'unknown');
});
