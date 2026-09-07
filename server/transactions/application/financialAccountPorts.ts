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

/** Internal server authority. This port is intentionally never exposed as a browser command. */
export interface CreditGrantAuthority {
  grant(input: CreditGrantInput): Promise<CreditGrantResult>;
}

/** Observation-only surface suitable for an authenticated Core projection. */
export interface FinancialAccountReader {
  snapshot(identity: FinancialIdentity): Promise<FinancialAccountSnapshot>;
}
