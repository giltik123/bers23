import { createHash } from 'node:crypto';
import type { BillingTransactionAuthority, BillingReservation } from '../../../src/platform/creative/authority/contracts.ts';
import type { CreativeOperationIdentity } from '../../../src/platform/creative/operations/contracts.ts';
import { TransactionService } from '../../transactions/application/transactionService.ts';
import type { TransactionStore } from '../../transactions/application/ports.ts';

/** Maps Creative billing commands to the existing single-writer transaction subsystem. */
export class TransactionBillingAuthorityAdapter implements BillingTransactionAuthority {
  readonly #owners = new Map<string, string>();
  constructor(private readonly transactions: TransactionService, private readonly store: TransactionStore, private readonly provider = 'fal') {}

  async reserve(input: Readonly<{ identity: CreativeOperationIdentity; authorizationId: string; amount: number; idempotencyKey: string }>): Promise<BillingReservation> {
    const fingerprint = createHash('sha256').update(JSON.stringify({ identity: input.identity, amount: input.amount, provider: this.provider })).digest('hex');
    const result = await this.transactions.reserve({ correlation_id: input.identity.requestId, idempotency_key: input.idempotencyKey, request_fingerprint: fingerprint, owner_id: input.identity.userId, project_id: input.identity.projectId, operation_id: input.identity.operationId, operation_version: Number(input.identity.operationVersion), provider: this.provider, amount: input.amount });
    this.#owners.set(result.reservation.id, input.identity.userId);
    return { reservationId: result.reservation.id, status: 'RESERVED', replayed: result.kind === 'replayed' };
  }
  async commit(reservationId: string): Promise<BillingReservation> { await this.store.appendProviderFact(reservationId, 'provider_dispatched', new Date().toISOString()); await this.store.appendProviderFact(reservationId, 'provider_succeeded', new Date().toISOString()); await this.transactions.commit(reservationId, this.owner(reservationId)); return { reservationId, status: 'COMMITTED' }; }
  async release(reservationId: string, reason: string): Promise<BillingReservation> { await this.store.appendProviderFact(reservationId, 'provider_dispatched', new Date().toISOString()); await this.store.appendProviderFact(reservationId, 'provider_failed', new Date().toISOString()); await this.transactions.release(reservationId, this.owner(reservationId), reason); return { reservationId, status: 'RELEASED' }; }
  async unknown(reservationId: string): Promise<BillingReservation> { await this.store.appendProviderFact(reservationId, 'provider_dispatched', new Date().toISOString()); await this.store.appendRecoveryDeferred(reservationId, new Date().toISOString()); return { reservationId, status: 'UNKNOWN' }; }
  private owner(reservationId: string): string { const owner = this.#owners.get(reservationId); if (!owner) throw new Error('Reservation ownership is unavailable'); return owner; }
}
