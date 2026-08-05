import type { ProviderRecoveryPort, ServerClock, TransactionStore } from './ports.ts';
import { TransactionService } from './transactionService.ts';

/** Owns abandoned-work orchestration; it does not mutate balances directly. */
export class RecoveryService {
  private readonly store: TransactionStore; private readonly provider: ProviderRecoveryPort; private readonly transactions: TransactionService; private readonly clock: ServerClock; private readonly workerId: string;
  constructor(store: TransactionStore, provider: ProviderRecoveryPort, transactions: TransactionService, clock: ServerClock, workerId: string) { this.store = store; this.provider = provider; this.transactions = transactions; this.clock = clock; this.workerId = workerId; }

  async runBatch(limit = 25): Promise<{ resolved: number; deferred: number }> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error('Recovery batch limit must be between 1 and 100');
    }
    const now = this.clock.now();
    const leaseUntil = new Date(now.getTime() + 60_000).toISOString();
    const items = await this.store.claimAbandoned(now.toISOString(), limit, this.workerId, leaseUntil);
    let resolved = 0; let deferred = 0;
    for (const reservation of items) {
      const outcome = await this.provider.resolve(reservation);
      if (outcome === 'succeeded') {
        await this.store.appendProviderFact(reservation.id, 'provider_succeeded', this.clock.now().toISOString());
        await this.transactions.commit(reservation.id, reservation.owner_id, 'recovery_service');
        resolved += 1;
      } else if (outcome === 'failed') {
        await this.store.appendProviderFact(reservation.id, 'provider_failed', this.clock.now().toISOString());
        await this.transactions.release(reservation.id, reservation.owner_id, outcome, 'recovery_service');
        resolved += 1;
      } else if (outcome === 'not_dispatched') {
        await this.transactions.release(reservation.id, reservation.owner_id, outcome, 'recovery_service');
        resolved += 1;
      } else {
        await this.store.appendRecoveryDeferred(reservation.id, this.clock.now().toISOString());
        deferred += 1;
      }
    }
    return { resolved, deferred };
  }
}
