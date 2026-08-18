import type { ActualCost } from '../cost/contracts';
import type { BillingEvent, BillingReservation } from '../authority/contracts';

export type ReconciliationStatus = 'matched' | 'missing' | 'inconsistent' | 'unknown';
export type ReconciliationInput = Readonly<{ reservation?: BillingReservation; providerOutcome?: 'SUCCESS' | 'FAILED' | 'UNKNOWN'; actualCost?: ActualCost; billingEvent?: BillingEvent; journal?: readonly Readonly<{ event: string }>[] }>;

export class CreativeOperationReconciler {
  reconcile(input: ReconciliationInput): Readonly<{ status: ReconciliationStatus; findings: readonly string[] }> {
    const findings: string[] = [];
    if (!input.reservation) findings.push('reservation');
    if (input.providerOutcome === 'UNKNOWN' || input.reservation?.status === 'UNKNOWN') return Object.freeze({ status: 'unknown', findings: Object.freeze(['provider outcome requires reconciliation']) });
    if (!input.actualCost) findings.push('actualCost');
    if (!input.billingEvent) findings.push('billingEvent');
    if (!input.journal?.length) findings.push('journal');
    if (findings.length) return Object.freeze({ status: 'missing', findings: Object.freeze(findings) });
    if (input.billingEvent!.reservationId !== input.reservation!.reservationId || input.billingEvent!.billableAmount > input.actualCost!.actualCreditsBasis) return Object.freeze({ status: 'inconsistent', findings: Object.freeze(['financial facts disagree']) });
    return Object.freeze({ status: 'matched', findings: Object.freeze([]) });
  }
}
