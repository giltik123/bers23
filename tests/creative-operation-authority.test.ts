import assert from 'node:assert/strict';
import { CreativeOperationAuthority } from '../src/platform/creative/authority';

let mutations = 0;
const billing = { async reserve() { mutations++; return { reservationId: 'r1', status: 'RESERVED' as const }; }, async commit(id: string) { mutations++; return { reservationId: id, status: 'COMMITTED' as const }; }, async release(id: string) { mutations++; return { reservationId: id, status: 'RELEASED' as const }; } };
const authority = new CreativeOperationAuthority({ billing, now: () => '2026-01-01T00:00:00.000Z', id: (() => { let n = 0; return () => `id-${++n}`; })() });
authority.define({ operationId: 'generate', version: '1', family: 'Generation', capabilities: ['AI'], inputArtifacts: [], outputArtifacts: ['IMAGE'], parametersSchema: {}, executionPolicy: {}, verificationPolicy: {}, resourceProfile: {}, costModel: {}, riskProfile: {}, billable: true });
const identity = { operationId: 'generate', operationVersion: '1', operationFamily: 'Generation', tenantId: 't', projectId: 'p', userId: 'u', requestId: 'q' };
const intent = { target: 'CLOUD' as const, requiredCapabilities: ['AI'], executionMode: 'SYNC', fallbackPolicy: {}, verificationPolicy: {} };
const instance = authority.instantiate({ identity, parameters: { prompt: 'x' }, executionIntent: intent, idempotencyKey: 'same' });
assert.throws(() => (instance.parametersSnapshot as Record<string, unknown>).prompt = 'changed');
assert.equal(authority.instantiate({ identity, parameters: { prompt: 'ignored' }, executionIntent: intent, idempotencyKey: 'same' }), instance);
authority.estimate(instance, { target: 'CLOUD', billable: true, credits: 5, providerCost: { amount: .04, currency: 'USD' }, worstCaseCredits: 7 });
const authorization = authority.authorize(instance, { checks: { operationValid: true, capabilityAvailable: true, runtimeAllowed: true, modelTrusted: true, privacyAllowed: true, budgetAllowed: true, scopeValid: true }, policyVersion: '1', expiresAt: '2026-01-02T00:00:00.000Z', costPolicy: { maxCredits: 10, maxProviderCost: 1, allowFallback: true, allowRetry: true, allowEscalation: false, budgetMode: 'HARD' } });
assert.equal(authorization.allowed, true);
await authority.reserve(instance); await authority.reserve(instance); assert.equal(mutations, 1, 'reservation is idempotent');
await authority.execute(instance); authority.recordOutcome(instance, { status: 'SUCCEEDED' }); authority.recordActualCost(instance, { actualProviderCost: { amount: .03, currency: 'USD' }, actualCreditsBasis: 4, actualLatency: 20, actualRetries: 0, actualFallbacks: 0, actualDeviceCost: 0, actualEnergyEstimate: 0 });
const event = authority.buildBillingEvent(instance, 5); assert.equal(event.billableAmount, 5); await authority.commit(instance); assert.equal(mutations, 2);
console.log('creative operation authority tests passed');
