import type { ActualCost } from '../cost/contracts';
import { immutable, type CreativeOperationIdentity } from '../operations/contracts';
import { buildBillingEvent, type BillingEvent, type BillingEventAuthority, type BillingReservation, type ExecutionAuthorization } from './contracts';

/** Converts authoritative cost facts to a journal-ready event; providers never receive this port. */
export class CreativeBillingEventBridge {
  constructor(private readonly billing: BillingEventAuthority, private readonly id: () => string = () => crypto.randomUUID(), private readonly now: () => string = () => new Date().toISOString()) {}

  async record(input: Readonly<{ identity: CreativeOperationIdentity; actualCost: ActualCost; authorization: ExecutionAuthorization; reservation: BillingReservation; billableCredits: number }>): Promise<BillingEvent> {
    if (input.billableCredits > input.actualCost.actualCreditsBasis) throw new Error('Billable credits cannot exceed authoritative actual cost basis');
    const event = buildBillingEvent({ billingEventId: this.id(), identity: input.identity, authorization: input.authorization, reservation: input.reservation, billableAmount: input.billableCredits, occurredAt: this.now() });
    await this.billing.record?.(event);
    return immutable(event);
  }
}
