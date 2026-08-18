import type { ActualCost, CostEstimate } from '../cost/contracts';
import { immutable, type CreativeOperationIdentity } from '../operations/contracts';

export type CheckStatus = 'ALLOWED' | 'DENIED' | 'WARNING';
export type ExecutionAuthorization = Readonly<{
  allowed: boolean; reason: string; policyVersion: string; budgetStatus: CheckStatus;
  privacyStatus: CheckStatus; capabilityStatus: CheckStatus; trustStatus: CheckStatus;
  authorizationId: string; expiresAt: string;
}>;
export type AuthorizationChecks = Readonly<{
  operationValid: boolean; capabilityAvailable: boolean; runtimeAllowed: boolean;
  modelTrusted: boolean; privacyAllowed: boolean; budgetAllowed: boolean; scopeValid: boolean;
}>;

export class ExecutionAuthorizationPolicy {
  authorize(input: Readonly<{ checks: AuthorizationChecks; policyVersion: string; authorizationId: string; expiresAt: string; budgetWarning?: boolean }>): ExecutionAuthorization {
    const failed = Object.entries(input.checks).filter(([, passed]) => !passed).map(([name]) => name);
    const allowed = failed.length === 0;
    return immutable({ allowed, reason: allowed ? 'All execution authority checks passed' : `Blocked: ${failed.join(', ')}`, policyVersion: input.policyVersion,
      budgetStatus: input.checks.budgetAllowed ? (input.budgetWarning ? 'WARNING' : 'ALLOWED') : 'DENIED',
      privacyStatus: input.checks.privacyAllowed && input.checks.scopeValid ? 'ALLOWED' : 'DENIED',
      capabilityStatus: input.checks.capabilityAvailable && input.checks.runtimeAllowed && input.checks.operationValid ? 'ALLOWED' : 'DENIED',
      trustStatus: input.checks.modelTrusted ? 'ALLOWED' : 'DENIED', authorizationId: input.authorizationId, expiresAt: input.expiresAt });
  }
}

export type BillingEventStatus = 'PENDING' | 'COMMITTED' | 'RELEASED' | 'UNKNOWN';
export type BillingEvent = Readonly<{ billingEventId: string; operationId: string; authorizationId: string; reservationId: string; billableAmount: number; creditUnit: string; status: BillingEventStatus; occurredAt: string }>;
export type BillingReservation = Readonly<{ reservationId: string; status: 'RESERVED' | 'COMMITTED' | 'RELEASED' | 'UNKNOWN'; replayed?: boolean }>;

/** The only port through which creative code may request a financial mutation. */
export interface BillingTransactionAuthority {
  reserve(input: Readonly<{ identity: CreativeOperationIdentity; authorizationId: string; amount: number; idempotencyKey: string }>): Promise<BillingReservation>;
  commit(reservationId: string): Promise<BillingReservation>;
  release(reservationId: string, reason: string): Promise<BillingReservation>;
  unknown?(reservationId: string, reason: string): Promise<BillingReservation>;
}

export function buildBillingEvent(input: Readonly<{ billingEventId: string; identity: CreativeOperationIdentity; authorization: ExecutionAuthorization; reservation: BillingReservation; billableAmount: number; creditUnit?: string; occurredAt: string }>): BillingEvent {
  if (!input.authorization.allowed) throw new Error('Billing event requires an allowed authorization');
  if (new Date(input.authorization.expiresAt).getTime() <= new Date(input.occurredAt).getTime()) throw new Error('Billing event authorization has expired');
  if (input.billableAmount < 0 || !Number.isFinite(input.billableAmount)) throw new Error('Invalid billable amount');
  return immutable({ billingEventId: input.billingEventId, operationId: input.identity.operationId, authorizationId: input.authorization.authorizationId, reservationId: input.reservation.reservationId, billableAmount: input.billableAmount, creditUnit: input.creditUnit ?? 'CREDIT', status: input.reservation.status === 'RESERVED' ? 'PENDING' : input.reservation.status, occurredAt: input.occurredAt });
}

export type UnifiedOperationOutcome = Readonly<{ operationId: string; executionId: string; authorizationId: string; providerExecutionId?: string; localExecutionId?: string; estimatedCost: CostEstimate; actualCost: ActualCost; billableCredits: number }>;
