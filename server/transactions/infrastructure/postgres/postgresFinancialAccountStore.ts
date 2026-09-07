import { createHash } from 'node:crypto';

import type {
  BillingInterval,
  CreditGrantAuthority,
  CreditGrantInput,
  CreditGrantRecord,
  CreditGrantResult,
  CreditWalletSnapshot,
  EntitlementSource,
  EntitlementState,
  FinancialAccountBootstrapAuthority,
  FinancialAccountBootstrapResult,
  FinancialAccountReader,
  FinancialAccountSnapshot,
  FinancialEntitlementSnapshot,
  FinancialIdentity,
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

type GrantRow = Readonly<{
  id: string;
  tenant_id: string;
  owner_id: string;
  idempotency_key: string;
  request_fingerprint: string;
  grant_kind: CreditGrantRecord['kind'];
  source: CreditGrantRecord['source'];
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

const FREE_POLICY_PLAN_ID = 'free';
const FREE_POLICY_STATE = 'FREE' as const;
const FREE_POLICY_SOURCE = 'SERVER_POLICY' as const;
const FREE_POLICY_REVISION = 1;
const FREE_WELCOME_AMOUNT = 500;
const FREE_WELCOME_IDEMPOTENCY_KEY = 'server-policy/free-account/welcome/v1';
const FREE_WELCOME_FINGERPRINT = sha256(
  'bers.financial.free-welcome.v1|plan=free|state=FREE|source=SERVER_POLICY|grant=WELCOME|amount=500',
);

/**
 * Canonical PostgreSQL financial account authority over the existing credit_wallets balance.
 * Grants and wallet increments commit atomically. The FREE bootstrap is a narrow server-policy
 * command whose amount, plan, state and idempotency material are fixed in this module.
 */
export class PostgresFinancialAccountStore implements CreditGrantAuthority, FinancialAccountBootstrapAuthority, FinancialAccountReader {
  private readonly runner: SqlTransactionRunner;

  constructor(runner: SqlTransactionRunner) {
    this.runner = runner;
  }

  async grant(inputValue: CreditGrantInput): Promise<CreditGrantResult> {
    const input = normalizeGrantInput(inputValue);
    return this.runner.transaction('read committed', async (tx) => {
      // The canonical transaction authority uses the wallet as the first lock for
      // every balance mutation. Keep grants/bootstrap in that same global order.
      const wallet = await lockWallet(tx, input.identity.userId);
      if (!wallet) return Object.freeze({ kind: 'account_not_found' as const });

      const account = await tx.query<{ owner_id: string }>(
        `SELECT owner_id FROM financial_entitlement_accounts
         WHERE tenant_id=$1 AND owner_id=$2 FOR UPDATE`,
        [input.identity.tenantId, input.identity.userId],
      );
      if (account.rowCount !== 1) return Object.freeze({ kind: 'account_not_found' as const });
      return applyGrantLocked(tx, input, wallet);
    });
  }

  async initializeFreeAccount(identityValue: FinancialIdentity): Promise<FinancialAccountBootstrapResult> {
    const identity = normalizeIdentity(identityValue);
    const occurredAt = new Date().toISOString();
    const expectedGrant = freeWelcomeGrant(identity, occurredAt);

    return this.runner.transaction('read committed', async (tx) => {
      // A wallet can legitimately predate P0a/P0b, so preserve it byte-for-byte except for
      // the one accepted +500 welcome increment. INSERT only creates a missing zero wallet.
      await tx.query(
        `INSERT INTO credit_wallets(owner_id,created_at,updated_at)
         VALUES ($1,$2,$2)
         ON CONFLICT (owner_id) DO NOTHING`,
        [identity.userId, occurredAt],
      );
      const wallet = await lockWallet(tx, identity.userId);
      if (!wallet) throw new Error('canonical credit wallet could not be locked for FREE bootstrap');

      // Lock by globally unique owner_id rather than tenant-filtering. A wallet owner already
      // bound to another tenant must conflict, never appear unconfigured and be rebound.
      const account = await tx.query<PolicyAccountRow>(
        `SELECT owner_id,tenant_id,plan_id,state,billing_interval,source,entitlement_revision,
                starts_at,ends_at,trial_consumed_at,provider_customer_ref,provider_subscription_ref
         FROM financial_entitlement_accounts
         WHERE owner_id=$1
         FOR UPDATE`,
        [identity.userId],
      );
      const policyGrantCandidates = await findPolicyGrantCandidates(tx, expectedGrant);

      if (account.rowCount === 1) {
        if (!sameFreePolicyAccount(account.rows[0], identity)) {
          return Object.freeze({ kind: 'policy_conflict' as const });
        }
        const policyGrant = policyGrantCandidates.length === 1 ? policyGrantCandidates[0] : undefined;
        if (!policyGrant
          || !samePolicyGrantBinding(policyGrant, expectedGrant)
          || !sameFreePolicyStartBinding(account.rows[0], policyGrant)) {
          return Object.freeze({ kind: 'policy_drift' as const });
        }
        const snapshot = await snapshotLocked(tx, identity);
        if (!snapshot.entitlement || !snapshot.wallet) throw new Error('FREE bootstrap replay lost canonical account state');
        return Object.freeze({ kind: 'replayed' as const, snapshot });
      }
      if (account.rowCount !== 0) throw new Error('financial entitlement owner uniqueness invariant failed');

      // A policy grant without its policy-owned entitlement can only be partial/drifted state.
      // Do not "repair" financial truth by adding or recreating money.
      if (policyGrantCandidates.length !== 0) return Object.freeze({ kind: 'policy_drift' as const });

      const entitlement = await tx.query<{ owner_id: string }>(
        `INSERT INTO financial_entitlement_accounts
          (owner_id,tenant_id,plan_id,state,billing_interval,source,entitlement_revision,starts_at,ends_at,
           trial_consumed_at,provider_customer_ref,provider_subscription_ref,created_at,updated_at)
         VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,NULL,NULL,NULL,NULL,$7,$7)
         RETURNING owner_id`,
        [
          identity.userId,
          identity.tenantId,
          FREE_POLICY_PLAN_ID,
          FREE_POLICY_STATE,
          FREE_POLICY_SOURCE,
          FREE_POLICY_REVISION,
          occurredAt,
        ],
      );
      if (entitlement.rowCount !== 1) throw new Error('FREE entitlement bootstrap was not inserted');

      const grant = await applyGrantLocked(tx, expectedGrant, wallet);
      if (grant.kind !== 'applied') {
        // Throw rather than return: account creation must roll back if the welcome grant cannot
        // be atomically inserted and reflected in the canonical wallet.
        throw new Error(`FREE welcome bootstrap violated grant invariant: ${grant.kind}`);
      }

      const snapshot = await snapshotLocked(tx, identity);
      if (!snapshot.entitlement || !snapshot.wallet) throw new Error('FREE bootstrap commit lost canonical account state');
      return Object.freeze({ kind: 'initialized' as const, snapshot });
    });
  }

  async snapshot(identityValue: FinancialIdentity): Promise<FinancialAccountSnapshot> {
    const identity = normalizeIdentity(identityValue);
    return this.runner.transaction('read committed', tx => snapshotLocked(tx, identity));
  }
}

async function applyGrantLocked(tx: SqlTransaction, input: CreditGrantInput, wallet: WalletRow): Promise<CreditGrantResult> {
  const inserted = await tx.query<GrantRow>(
    `INSERT INTO credit_grants
      (id,tenant_id,owner_id,idempotency_key,request_fingerprint,grant_kind,source,amount,provider_event_id,occurred_at,metadata)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)
     ON CONFLICT DO NOTHING
     RETURNING id,tenant_id,owner_id,idempotency_key,request_fingerprint,grant_kind,source,amount,provider_event_id,occurred_at`,
    [
      input.id,
      input.identity.tenantId,
      input.identity.userId,
      input.idempotencyKey,
      input.requestFingerprint,
      input.kind,
      input.source,
      input.amount,
      input.providerEventId ?? null,
      input.occurredAt,
      JSON.stringify(input.metadata ?? {}),
    ],
  );

  if (inserted.rowCount !== 1) {
    const existing = await findConflictingGrant(tx, input);
    if (!existing || !sameGrantBinding(existing, input)) return Object.freeze({ kind: 'conflict' as const });
    return Object.freeze({
      kind: 'replayed' as const,
      grant: grantFromRow(existing),
      wallet: walletFromRow(wallet),
    });
  }

  const updated = await tx.query<WalletRow>(
    `UPDATE credit_wallets
     SET total_credited=total_credited+$2,
         balance=balance+$2,
         version=version+1,
         updated_at=$3
     WHERE owner_id=$1
     RETURNING total_credited,lifetime_spent,balance,reserved,version,updated_at`,
    [input.identity.userId, input.amount, input.occurredAt],
  );
  if (updated.rowCount !== 1) throw new Error('canonical credit wallet disappeared during grant transaction');

  return Object.freeze({
    kind: 'applied' as const,
    grant: grantFromRow(inserted.rows[0]),
    wallet: walletFromRow(updated.rows[0]),
  });
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

async function findConflictingGrant(tx: SqlTransaction, input: CreditGrantInput): Promise<GrantRow | undefined> {
  const result = await tx.query<GrantRow>(
    `SELECT id,tenant_id,owner_id,idempotency_key,request_fingerprint,grant_kind,source,amount,provider_event_id,occurred_at
     FROM credit_grants
     WHERE id=$1
        OR (tenant_id=$2 AND owner_id=$3 AND idempotency_key=$4)
        OR ($5::text IS NOT NULL AND provider_event_id=$5)
     ORDER BY CASE WHEN tenant_id=$2 AND owner_id=$3 AND idempotency_key=$4 THEN 0 ELSE 1 END, id
     LIMIT 2`,
    [input.id, input.identity.tenantId, input.identity.userId, input.idempotencyKey, input.providerEventId ?? null],
  );
  if (result.rowCount !== 1) return undefined;
  return result.rows[0];
}

async function findPolicyGrantCandidates(tx: SqlTransaction, input: CreditGrantInput): Promise<readonly GrantRow[]> {
  const result = await tx.query<GrantRow>(
    `SELECT id,tenant_id,owner_id,idempotency_key,request_fingerprint,grant_kind,source,amount,provider_event_id,occurred_at
     FROM credit_grants
     WHERE id=$1 OR (owner_id=$2 AND idempotency_key=$3)
     ORDER BY id
     LIMIT 2`,
    [input.id, input.identity.userId, input.idempotencyKey],
  );
  return result.rows;
}

function freeWelcomeGrant(identity: FinancialIdentity, occurredAt: string): CreditGrantInput {
  const subject = `${identity.tenantId}\u0000${identity.userId}`;
  return Object.freeze({
    id: `free-welcome-v1-${sha256(subject)}`,
    identity,
    idempotencyKey: FREE_WELCOME_IDEMPOTENCY_KEY,
    requestFingerprint: FREE_WELCOME_FINGERPRINT,
    kind: 'WELCOME' as const,
    source: FREE_POLICY_SOURCE,
    amount: FREE_WELCOME_AMOUNT,
    occurredAt,
    metadata: Object.freeze({ policy: 'free-account-welcome', policyVersion: 1 }),
  });
}

function sameFreePolicyAccount(row: PolicyAccountRow, identity: FinancialIdentity): boolean {
  return row.owner_id === identity.userId
    && row.tenant_id === identity.tenantId
    && row.plan_id === FREE_POLICY_PLAN_ID
    && row.state === FREE_POLICY_STATE
    && row.billing_interval === null
    && row.source === FREE_POLICY_SOURCE
    && safeInteger(row.entitlement_revision, 'entitlement revision') === FREE_POLICY_REVISION
    && row.ends_at === null
    && row.trial_consumed_at === null
    && row.provider_customer_ref === null
    && row.provider_subscription_ref === null;
}

function samePolicyGrantBinding(row: GrantRow, expected: CreditGrantInput): boolean {
  return row.id === expected.id
    && sameGrantBinding(row, expected)
    && row.provider_event_id === null;
}

function sameFreePolicyStartBinding(account: PolicyAccountRow, grant: GrantRow): boolean {
  return timestamp(account.starts_at, 'FREE entitlement startsAt') === timestamp(grant.occurred_at, 'WELCOME occurredAt');
}

function sameGrantBinding(row: GrantRow, input: CreditGrantInput): boolean {
  return row.tenant_id === input.identity.tenantId
    && row.owner_id === input.identity.userId
    && row.idempotency_key === input.idempotencyKey
    && row.request_fingerprint === input.requestFingerprint
    && row.grant_kind === input.kind
    && row.source === input.source
    && safeInteger(row.amount, 'grant amount') === input.amount
    && (row.provider_event_id ?? undefined) === input.providerEventId;
}

function grantFromRow(row: GrantRow): CreditGrantRecord {
  return Object.freeze({
    id: boundedText(row.id, 'grant id', 256),
    identity: Object.freeze({
      tenantId: boundedText(row.tenant_id, 'tenant id', 256),
      userId: boundedText(row.owner_id, 'owner id', 256),
    }),
    idempotencyKey: boundedText(row.idempotency_key, 'grant idempotency key', 256),
    requestFingerprint: fingerprint(row.request_fingerprint),
    kind: exactGrantKind(row.grant_kind),
    source: exactGrantSource(row.source),
    amount: positiveSafeInteger(row.amount, 'grant amount'),
    ...(row.provider_event_id ? { providerEventId: boundedText(row.provider_event_id, 'provider event id', 512) } : {}),
    occurredAt: timestamp(row.occurred_at, 'grant occurredAt'),
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
    planId: planId(row.entitlement_plan_id),
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

function normalizeGrantInput(value: CreditGrantInput): CreditGrantInput {
  if (!value || typeof value !== 'object') throw new TypeError('credit grant input is required');
  const identity = normalizeIdentity(value.identity);
  const id = boundedText(value.id, 'grant id', 256);
  const idempotencyKey = boundedText(value.idempotencyKey, 'grant idempotency key', 256);
  const requestFingerprint = fingerprint(value.requestFingerprint);
  const kind = exactGrantKind(value.kind);
  const source = exactGrantSource(value.source);
  const amount = positiveSafeInteger(value.amount, 'grant amount');
  const providerEventId = value.providerEventId === undefined ? undefined : boundedText(value.providerEventId, 'provider event id', 512);
  if (source === 'VERIFIED_PROVIDER' && !providerEventId) throw new TypeError('verified-provider grant requires providerEventId');
  if (source !== 'VERIFIED_PROVIDER' && providerEventId) throw new TypeError('providerEventId is reserved for verified-provider grants');
  const occurredAt = timestamp(value.occurredAt, 'grant occurredAt');
  const metadata = normalizeMetadata(value.metadata);
  return Object.freeze({ id, identity, idempotencyKey, requestFingerprint, kind, source, amount, ...(providerEventId ? { providerEventId } : {}), occurredAt, metadata });
}

function normalizeIdentity(value: FinancialIdentity): FinancialIdentity {
  if (!value || typeof value !== 'object') throw new TypeError('financial identity is required');
  return Object.freeze({
    tenantId: boundedText(value.tenantId, 'tenant id', 256),
    userId: boundedText(value.userId, 'user id', 256),
  });
}

function normalizeMetadata(value: Readonly<Record<string, unknown>> | undefined): Readonly<Record<string, unknown>> {
  if (value === undefined) return Object.freeze({});
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError('grant metadata must be an object');
  let serialized: string;
  try { serialized = JSON.stringify(value); }
  catch { throw new TypeError('grant metadata must be JSON serializable'); }
  if (serialized.length > 16_384) throw new TypeError('grant metadata is too large');
  const parsed = JSON.parse(serialized) as Record<string, unknown>;
  return Object.freeze(parsed);
}

function boundedText(value: unknown, label: string, max: number): string {
  if (typeof value !== 'string') throw new TypeError(`${label} must be text`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || normalized.length > max || /[\u0000-\u001f\u007f]/u.test(normalized)) throw new TypeError(`${label} is invalid`);
  return normalized;
}

function planId(value: unknown): string {
  const normalized = boundedText(value, 'plan id', 64);
  if (!/^[a-z][a-z0-9_-]{0,63}$/.test(normalized)) throw new Error('financial entitlement plan id is invalid');
  return normalized;
}

function fingerprint(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new TypeError('request fingerprint must be lowercase SHA-256');
  return value;
}

function exactGrantKind(value: unknown): CreditGrantRecord['kind'] {
  if (value === 'WELCOME' || value === 'TRIAL' || value === 'PURCHASE' || value === 'ADJUSTMENT') return value;
  throw new TypeError('credit grant kind is unsupported');
}

function exactGrantSource(value: unknown): CreditGrantRecord['source'] {
  if (value === 'SERVER_POLICY' || value === 'VERIFIED_PROVIDER' || value === 'MANUAL_RESOLUTION') return value;
  throw new TypeError('credit grant source is unsupported');
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
