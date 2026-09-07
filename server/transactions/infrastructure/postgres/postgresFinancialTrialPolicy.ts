import { createHash } from 'node:crypto';

import type {
  BillingInterval,
  CreditWalletSnapshot,
  EntitlementSource,
  EntitlementState,
  FinancialAccountSnapshot,
  FinancialEntitlementSnapshot,
  FinancialIdentity,
  FinancialTrialAuthority,
  FinancialTrialStartResult,
} from '../../application/financialAccountPorts.ts';
import type { SqlTransaction, SqlTransactionRunner } from './sql.ts';

type WalletRow = Readonly<{
  total_credited: string | number;
  lifetime_spent: string | number;
  balance: string | number;
  reserved: string | number;
  version: string | number;
  updated_at: string | Date;
}>;

type PolicyAccountRow = Readonly<{
  owner_id: string;
  tenant_id: string;
  plan_id: string;
  state: EntitlementState;
  billing_interval: BillingInterval | null;
  source: EntitlementSource;
  entitlement_revision: string | number;
  starts_at: string | Date;
  ends_at: string | Date | null;
  trial_consumed_at: string | Date | null;
  provider_customer_ref: string | null;
  provider_subscription_ref: string | null;
}>;

type WelcomeGrantRow = Readonly<{
  id: string;
  tenant_id: string;
  owner_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  grant_kind: string;
  source: string;
  amount: string | number;
  provider_event_id: string | null;
  occurred_at: string | Date;
}>;

type SnapshotRow = WalletRow & Readonly<{
  entitlement_plan_id: string;
  entitlement_state: EntitlementState;
  entitlement_billing_interval: BillingInterval | null;
  entitlement_source: EntitlementSource;
  entitlement_revision_value: string | number;
  entitlement_starts_at: string | Date;
  entitlement_ends_at: string | Date | null;
  entitlement_trial_consumed_at: string | Date | null;
  entitlement_updated_at: string | Date;
}>;

const DAY_MS = 86_400_000;
const FREE_PLAN_ID = 'free';
const FREE_STATE = 'FREE' as const;
const TRIAL_STATE = 'TRIAL' as const;
const SERVER_POLICY = 'SERVER_POLICY' as const;
const FREE_REVISION = 1;
const TRIAL_REVISION = 2;
const WELCOME_AMOUNT = 500;
const WELCOME_IDEMPOTENCY_KEY = 'server-policy/free-account/welcome/v1';
const WELCOME_FINGERPRINT = sha256(
  'bers.financial.free-welcome.v1|plan=free|state=FREE|source=SERVER_POLICY|grant=WELCOME|amount=500',
);

const TRIAL_DAYS = Object.freeze({
  plus: 7,
  pro: 14,
  studio: 14,
} as const);

type TrialPlanId = keyof typeof TRIAL_DAYS;

/**
 * P0b.2 server-policy trial authority. This module intentionally has no wallet/grant
 * write capability: trial v1 changes only the canonical entitlement row.
 */
export class PostgresFinancialTrialPolicy implements FinancialTrialAuthority {
  private readonly runner: SqlTransactionRunner;

  constructor(runner: SqlTransactionRunner) {
    this.runner = runner;
  }

  async startTrial(identityValue: FinancialIdentity, planIdValue: string): Promise<FinancialTrialStartResult> {
    const identity = normalizeIdentity(identityValue);
    const trialPlan = exactTrialPlan(planIdValue);
    if (!trialPlan) return Object.freeze({ kind: 'plan_not_eligible' as const });

    return this.runner.transaction('read committed', async (tx) => {
      // Global transaction lock order is wallet first. Trial never mutates the wallet,
      // but locking the same serialization root prevents races with grant/spend/bootstrap.
      const wallet = await lockWallet(tx, identity.userId);
      if (!wallet) return Object.freeze({ kind: 'account_not_found' as const });
      walletFromRow(wallet); // fail closed on reconciliation drift before entitlement mutation

      const accountResult = await tx.query<PolicyAccountRow>(
        `SELECT owner_id,tenant_id,plan_id,state,billing_interval,source,entitlement_revision,
                starts_at,ends_at,trial_consumed_at,provider_customer_ref,provider_subscription_ref
         FROM financial_entitlement_accounts
         WHERE owner_id=$1
         FOR UPDATE`,
        [identity.userId],
      );
      if (accountResult.rowCount === 0) {
        const orphanWelcome = await findWelcomeGrantCandidates(tx, identity);
        return Object.freeze({ kind: orphanWelcome.length === 0 ? 'account_not_found' as const : 'policy_drift' as const });
      }
      if (accountResult.rowCount !== 1) throw new Error('financial entitlement owner uniqueness invariant failed');

      const account = accountResult.rows[0];
      if (account.tenant_id !== identity.tenantId || account.owner_id !== identity.userId) {
        return Object.freeze({ kind: 'policy_conflict' as const });
      }

      const welcomeCandidates = await findWelcomeGrantCandidates(tx, identity);
      const welcome = welcomeCandidates.length === 1 ? welcomeCandidates[0] : undefined;
      if (!welcome || !sameWelcomeBinding(welcome, identity)) {
        return Object.freeze({ kind: 'policy_drift' as const });
      }

      const now = new Date().toISOString();

      if (account.state === TRIAL_STATE && account.source === SERVER_POLICY) {
        const existingPlan = exactTrialPlan(account.plan_id);
        if (!existingPlan || !sameTrialPolicyAccount(account, identity, existingPlan)) {
          return Object.freeze({ kind: 'policy_drift' as const });
        }
        if (!account.ends_at) return Object.freeze({ kind: 'policy_drift' as const });
        if (Date.parse(timestamp(account.ends_at, 'trial endsAt')) <= Date.parse(now)) {
          return Object.freeze({ kind: 'trial_consumed' as const });
        }
        if (existingPlan.id !== trialPlan.id) {
          return Object.freeze({ kind: 'trial_conflict' as const });
        }
        const snapshot = await snapshotLocked(tx, identity);
        if (!snapshot.entitlement || !snapshot.wallet) throw new Error('trial replay lost canonical account state');
        return Object.freeze({ kind: 'replayed' as const, snapshot });
      }

      if (!sameFreePolicyAccount(account, identity)) {
        if (account.source === SERVER_POLICY) return Object.freeze({ kind: 'policy_drift' as const });
        return Object.freeze({ kind: 'policy_conflict' as const });
      }
      if (!sameFreeWelcomeStartBinding(account, welcome)) {
        return Object.freeze({ kind: 'policy_drift' as const });
      }

      const startsAt = now;
      const endsAt = new Date(Date.parse(startsAt) + trialPlan.days * DAY_MS).toISOString();
      const updated = await tx.query<{ owner_id: string }>(
        `UPDATE financial_entitlement_accounts
         SET plan_id=$3,
             state='TRIAL',
             billing_interval=NULL,
             source='SERVER_POLICY',
             entitlement_revision=$4,
             starts_at=$5,
             ends_at=$6,
             trial_consumed_at=$5,
             provider_customer_ref=NULL,
             provider_subscription_ref=NULL,
             updated_at=$5
         WHERE owner_id=$1 AND tenant_id=$2 AND entitlement_revision=$7
         RETURNING owner_id`,
        [identity.userId, identity.tenantId, trialPlan.id, TRIAL_REVISION, startsAt, endsAt, FREE_REVISION],
      );
      if (updated.rowCount !== 1) throw new Error('trial entitlement transition lost its locked FREE account');

      const snapshot = await snapshotLocked(tx, identity);
      if (!snapshot.entitlement || !snapshot.wallet) throw new Error('trial start lost canonical account state');
      return Object.freeze({ kind: 'started' as const, snapshot });
    });
  }
}

async function lockWallet(tx: SqlTransaction, ownerId: string): Promise<WalletRow | undefined> {
  const result = await tx.query<WalletRow>(
    `SELECT total_credited,lifetime_spent,balance,reserved,version,updated_at
     FROM credit_wallets WHERE owner_id=$1 FOR UPDATE`,
    [ownerId],
  );
  if (result.rowCount > 1) throw new Error('canonical credit wallet owner uniqueness invariant failed');
  return result.rows[0];
}

async function findWelcomeGrantCandidates(tx: SqlTransaction, identity: FinancialIdentity): Promise<readonly WelcomeGrantRow[]> {
  const id = welcomeGrantId(identity);
  const result = await tx.query<WelcomeGrantRow>(
    `SELECT id,tenant_id,owner_id,idempotency_key,request_fingerprint,grant_kind,source,amount,provider_event_id,occurred_at
     FROM credit_grants
     WHERE id=$1 OR (owner_id=$2 AND idempotency_key=$3)
     ORDER BY id
     LIMIT 2`,
    [id, identity.userId, WELCOME_IDEMPOTENCY_KEY],
  );
  return result.rows;
}

function sameWelcomeBinding(row: WelcomeGrantRow, identity: FinancialIdentity): boolean {
  return row.id === welcomeGrantId(identity)
    && row.tenant_id === identity.tenantId
    && row.owner_id === identity.userId
    && row.idempotency_key === WELCOME_IDEMPOTENCY_KEY
    && row.request_fingerprint === WELCOME_FINGERPRINT
    && row.grant_kind === 'WELCOME'
    && row.source === SERVER_POLICY
    && safeInteger(row.amount, 'welcome amount') === WELCOME_AMOUNT
    && row.provider_event_id === null;
}

function sameFreePolicyAccount(row: PolicyAccountRow, identity: FinancialIdentity): boolean {
  return row.owner_id === identity.userId
    && row.tenant_id === identity.tenantId
    && row.plan_id === FREE_PLAN_ID
    && row.state === FREE_STATE
    && row.billing_interval === null
    && row.source === SERVER_POLICY
    && safeInteger(row.entitlement_revision, 'entitlement revision') === FREE_REVISION
    && row.ends_at === null
    && row.trial_consumed_at === null
    && row.provider_customer_ref === null
    && row.provider_subscription_ref === null;
}

function sameFreeWelcomeStartBinding(account: PolicyAccountRow, welcome: WelcomeGrantRow): boolean {
  return timestamp(account.starts_at, 'FREE startsAt') === timestamp(welcome.occurred_at, 'WELCOME occurredAt');
}

function sameTrialPolicyAccount(
  row: PolicyAccountRow,
  identity: FinancialIdentity,
  policy: Readonly<{ id: TrialPlanId; days: number }>,
): boolean {
  if (row.owner_id !== identity.userId
    || row.tenant_id !== identity.tenantId
    || row.plan_id !== policy.id
    || row.state !== TRIAL_STATE
    || row.billing_interval !== null
    || row.source !== SERVER_POLICY
    || safeInteger(row.entitlement_revision, 'entitlement revision') !== TRIAL_REVISION
    || row.ends_at === null
    || row.trial_consumed_at === null
    || row.provider_customer_ref !== null
    || row.provider_subscription_ref !== null) return false;

  const startsAt = timestamp(row.starts_at, 'trial startsAt');
  const consumedAt = timestamp(row.trial_consumed_at, 'trial consumedAt');
  const endsAt = timestamp(row.ends_at, 'trial endsAt');
  return startsAt === consumedAt && Date.parse(endsAt) - Date.parse(startsAt) === policy.days * DAY_MS;
}

async function snapshotLocked(tx: SqlTransaction, identity: FinancialIdentity): Promise<FinancialAccountSnapshot> {
  const result = await tx.query<SnapshotRow>(
    `SELECT
       w.total_credited,w.lifetime_spent,w.balance,w.reserved,w.version,w.updated_at,
       e.plan_id AS entitlement_plan_id,
       e.state AS entitlement_state,
       e.billing_interval AS entitlement_billing_interval,
       e.source AS entitlement_source,
       e.entitlement_revision AS entitlement_revision_value,
       e.starts_at AS entitlement_starts_at,
       e.ends_at AS entitlement_ends_at,
       e.trial_consumed_at AS entitlement_trial_consumed_at,
       e.updated_at AS entitlement_updated_at
     FROM financial_entitlement_accounts e
     JOIN credit_wallets w ON w.owner_id=e.owner_id
     WHERE e.tenant_id=$1 AND e.owner_id=$2`,
    [identity.tenantId, identity.userId],
  );
  const row = result.rows[0];
  if (!row) return Object.freeze({ identity });
  return Object.freeze({
    identity,
    entitlement: entitlementFromSnapshotRow(row),
    wallet: walletFromRow(row),
  });
}

function walletFromRow(row: WalletRow): CreditWalletSnapshot {
  const totalCredited = safeInteger(row.total_credited, 'wallet totalCredited');
  const lifetimeSpent = safeInteger(row.lifetime_spent, 'wallet lifetimeSpent');
  const balance = safeInteger(row.balance, 'wallet balance');
  const reserved = safeInteger(row.reserved, 'wallet reserved');
  const version = safeInteger(row.version, 'wallet version');
  if (totalCredited < 0 || lifetimeSpent < 0 || balance < 0 || reserved < 0 || reserved > balance || balance !== totalCredited - lifetimeSpent || version < 0) {
    throw new Error('canonical credit wallet violates reconciliation invariants');
  }
  return Object.freeze({
    totalCredited,
    lifetimeSpent,
    balance,
    reserved,
    available: balance - reserved,
    version,
    updatedAt: timestamp(row.updated_at, 'wallet updatedAt'),
  });
}

function entitlementFromSnapshotRow(row: SnapshotRow): FinancialEntitlementSnapshot {
  return Object.freeze({
    planId: exactPlanId(row.entitlement_plan_id),
    state: exactEntitlementState(row.entitlement_state),
    ...(row.entitlement_billing_interval ? { billingInterval: exactBillingInterval(row.entitlement_billing_interval) } : {}),
    source: exactEntitlementSource(row.entitlement_source),
    revision: positiveSafeInteger(row.entitlement_revision_value, 'entitlement revision'),
    startsAt: timestamp(row.entitlement_starts_at, 'entitlement startsAt'),
    ...(row.entitlement_ends_at ? { endsAt: timestamp(row.entitlement_ends_at, 'entitlement endsAt') } : {}),
    ...(row.entitlement_trial_consumed_at ? { trialConsumedAt: timestamp(row.entitlement_trial_consumed_at, 'entitlement trialConsumedAt') } : {}),
    updatedAt: timestamp(row.entitlement_updated_at, 'entitlement updatedAt'),
  });
}

function exactTrialPlan(value: unknown): Readonly<{ id: TrialPlanId; days: number }> | undefined {
  if (typeof value !== 'string' || !Object.prototype.hasOwnProperty.call(TRIAL_DAYS, value)) return undefined;
  const id = value as TrialPlanId;
  return Object.freeze({ id, days: TRIAL_DAYS[id] });
}

function welcomeGrantId(identity: FinancialIdentity): string {
  return `free-welcome-v1-${sha256(`${identity.tenantId}\u0000${identity.userId}`)}`;
}

function normalizeIdentity(value: FinancialIdentity): FinancialIdentity {
  if (!value || typeof value !== 'object') throw new TypeError('financial identity is required');
  return Object.freeze({
    tenantId: boundedText(value.tenantId, 'tenant id', 256),
    userId: boundedText(value.userId, 'user id', 256),
  });
}

function boundedText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be text`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new TypeError(`${label} is invalid`);
  return normalized;
}

function exactPlanId(value: unknown): string {
  const normalized = boundedText(value, 'plan id', 64);
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(normalized)) throw new Error('financial entitlement plan id is invalid');
  return normalized;
}

function exactEntitlementState(value: unknown): EntitlementState {
  if (value === 'FREE' || value === 'TRIAL' || value === 'ACTIVE' || value === 'GRACE' || value === 'PAST_DUE' || value === 'CANCELLED') return value;
  throw new Error('financial entitlement state is invalid');
}

function exactEntitlementSource(value: unknown): EntitlementSource {
  if (value === 'SERVER_POLICY' || value === 'VERIFIED_PROVIDER' || value === 'MANUAL_RESOLUTION') return value;
  throw new Error('financial entitlement source is invalid');
}

function exactBillingInterval(value: unknown): BillingInterval {
  if (value === 'MONTHLY' || value === 'YEARLY' || value === 'CUSTOM') return value;
  throw new Error('financial entitlement billing interval is invalid');
}

function positiveSafeInteger(value: unknown, label: string): number {
  const numeric = safeInteger(value, label);
  if (numeric < 1) throw new TypeError(`${label} must be a positive safe integer`);
  return numeric;
}

function safeInteger(value: unknown, label: string): number {
  const numeric = typeof value === 'number' ? value : typeof value === 'string' && /^-?[0-9]+$/.test(value) ? Number(value) : Number.NaN;
  if (!Number.isSafeInteger(numeric)) throw new TypeError(`${label} must be a safe integer`);
  return numeric;
}

function timestamp(value: unknown, label: string): string {
  const candidate = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : undefined;
  if (!candidate || !Number.isFinite(candidate.getTime())) throw new TypeError(`${label} must be a timestamp`);
  return candidate.toISOString();
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}
