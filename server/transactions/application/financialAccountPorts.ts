export type FinancialIdentity = Readonly<{ tenantId: string; userId: string }>;

export type EntitlementState = 'FREE' | 'TRIAL' | 'ACTIVE' | 'GRACE' | 'PAST_DUE' | 'CANCELLED';
export type EntitlementSource = 'SERVER_POLICY' | 'VERIFIED_PROVIDER' | 'MANUAL_RESOLUTION';
export type BillingInterval = 'MONTHLY' | 'YEARLY' | 'CUSTOM';

export type FinancialEntitlementSnapshot = Readonly<{
  planId: string;
  state: EntitlementState;
  billingInterval?: BillingInterval;
  source: EntitlementSource;
  revision: number;
  startsAt: string;
  endsAt?: string;
  trialConsumedAt?: string;
  updatedAt: string;
}>;

export type CreditWalletSnapshot = Readonly<{
  totalCredited: number;
  lifetimeSpent: number;
  balance: number;
  reserved: number;
  available: number;
  version: number;
  updatedAt: string;
}>;

export type FinancialAccountSnapshot = Readonly<{
  identity: FinancialIdentity;
  entitlement?: FinancialEntitlementSnapshot;
  wallet?: CreditWalletSnapshot;
}>;

export type CreditGrantKind = 'WELCOME' | 'TRIAL' | 'PURCHASE' | 'ADJUSTMENT';
export type CreditGrantSource = 'SERVER_POLICY' | 'VERIFIED_PROVIDER' | 'MANUAL_RESOLUTION';

export type CreditGrantInput = Readonly<{
  id: string;
  identity: FinancialIdentity;
  idempotencyKey: string;
  requestFingerprint: string;
  kind: CreditGrantKind;
  source: CreditGrantSource;
  amount: number;
  providerEventId?: string;
  occurredAt: string;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type CreditGrantRecord = Readonly<{
  id: string;
  identity: FinancialIdentity;
  idempotencyKey: string;
  requestFingerprint: string;
  kind: CreditGrantKind;
  source: CreditGrantSource;
  amount: number;
  providerEventId?: string;
  occurredAt: string;
}>;

export type CreditGrantResult =
  | Readonly<{ kind: 'applied' | 'replayed'; grant: CreditGrantRecord; wallet: CreditWalletSnapshot }>
  | Readonly<{ kind: 'conflict' | 'account_not_found' }>;

export type FinancialAccountBootstrapResult =
  | Readonly<{ kind: 'initialized'; snapshot: FinancialAccountSnapshot }>
  | Readonly<{ kind: 'replayed'; snapshot: FinancialAccountSnapshot }>
  | Readonly<{ kind: 'policy_conflict' }>
  | Readonly<{ kind: 'policy_drift' }>;

export type FinancialTrialStartResult =
  | Readonly<{ kind: 'started'; snapshot: FinancialAccountSnapshot }>
  | Readonly<{ kind: 'replayed'; snapshot: FinancialAccountSnapshot }>
  | Readonly<{ kind: 'account_not_found' }>
  | Readonly<{ kind: 'plan_not_eligible' }>
  | Readonly<{ kind: 'trial_conflict' }>
  | Readonly<{ kind: 'trial_consumed' }>
  | Readonly<{ kind: 'policy_conflict' }>
  | Readonly<{ kind: 'policy_drift' }>;

/** Internal server authority. This port is intentionally never exposed as a browser command. */
export interface CreditGrantAuthority {
  grant(input: CreditGrantInput): Promise<CreditGrantResult>;
}

/**
 * Narrow server-policy authority for the one-time FREE bootstrap only.
 * Amount, plan, state, timestamps and idempotency material are not caller inputs.
 */
export interface FinancialAccountBootstrapAuthority {
  initializeFreeAccount(identity: FinancialIdentity): Promise<FinancialAccountBootstrapResult>;
}

/**
 * Narrow server-policy authority for a one-time trial entitlement transition.
 * The caller selects only a plan id; eligibility, duration, timestamps, state and
 * any financial grant policy remain server-owned.
 */
export interface FinancialTrialAuthority {
  startTrial(identity: FinancialIdentity, planId: string): Promise<FinancialTrialStartResult>;
}

/** Observation-only surface suitable for an authenticated Core projection. */
export interface FinancialAccountReader {
  snapshot(identity: FinancialIdentity): Promise<FinancialAccountSnapshot>;
}
