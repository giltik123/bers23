import assert from 'node:assert/strict';
import test from 'node:test';
import { TransactionBillingAuthorityAdapter } from '../server/core/billing/TransactionBillingAuthorityAdapter.ts';
import { TransactionError } from '../server/transactions/application/transactionService.ts';

const input = { identity: { operationId: 'try-on', operationVersion: '1', operationFamily: 'creative', tenantId: 'tenant', userId: 'owner', projectId: 'project', requestId: 'request' }, authorizationId: 'authorized', amount: 1, idempotencyKey: 'key' };

test('missing wallet exposes account preparation without creating or authorizing a reservation', async () => {
  let calls = 0;
  const adapter = new TransactionBillingAuthorityAdapter({ reserve: async () => { calls++; throw new Error('wallet not found'); } } as never, {} as never);
  await assert.rejects(adapter.reserve(input), (error: any) => error.code === 'creative_account_unconfigured' && error.status === 409 && error.retryable === false);
  assert.equal(calls, 1);
});

test('insufficient credits and infrastructure errors retain their original authority and status', async () => {
  for (const error of [new TransactionError('insufficient_credits', 'Insufficient credits', 403), new Error('database unavailable')]) {
    const adapter = new TransactionBillingAuthorityAdapter({ reserve: async () => { throw error; } } as never, {} as never);
    await assert.rejects(adapter.reserve(input), cause => cause === error);
  }
});
