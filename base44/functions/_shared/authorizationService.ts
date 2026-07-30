import {
  requireAiOperation,
  UnknownAiOperationError,
  type AiOperationDefinition,
} from './aiOperationRegistry.ts';
import {
  getServerSubscriptionPlan,
  serverPlanHasFeature,
  type ServerSubscriptionPlan,
} from './subscriptionPolicy.ts';

/** Minimal authenticated identity required by server authorization. */
export type AuthorizationUser = Readonly<{
  id: string;
  role?: string;
}>;

/** Request-bound Base44 authentication surface used by AuthorizationService. */
export type AuthorizationClient = Readonly<{
  auth: Readonly<{
    me(): Promise<unknown>;
  }>;
  asServiceRole: Readonly<{
    entities: Readonly<{
      Project: Readonly<{
        get(id: string): Promise<unknown>;
      }>;
      UserSubscription: Readonly<{
        filter(query: Record<string, unknown>, sort?: string, limit?: number): Promise<unknown>;
      }>;
      CreditsWallet: Readonly<{
        filter(query: Record<string, unknown>, sort?: string, limit?: number): Promise<unknown>;
      }>;
      SubscriptionUsage: Readonly<{
        filter(query: Record<string, unknown>, sort?: string, limit?: number): Promise<unknown>;
      }>;
    }>;
  }>;
}>;

/** Trusted identity and registry policy passed to later authorization stages. */
export type AuthorizationContext = Readonly<{
  user: AuthorizationUser;
  operation: AiOperationDefinition;
}>;

/** Minimal trusted project identity established by server-side ownership. */
export type AuthorizationProject = Readonly<{
  id: string;
  created_by_id: string;
}>;

/** Context that has passed registry, identity, and project ownership stages. */
export type ProjectAuthorizationContext = AuthorizationContext & Readonly<{
  project: AuthorizationProject;
}>;

/** Minimal subscription record accepted by the server authorization boundary. */
export type AuthorizationSubscription = Readonly<{
  plan_id: ServerSubscriptionPlan['plan_id'];
  status: 'free' | 'active' | 'trialing';
  trial_ends_at?: string;
}>;

/** Context that has also passed subscription status and feature permission. */
export type SubscriptionAuthorizationContext = ProjectAuthorizationContext & Readonly<{
  subscription: AuthorizationSubscription;
  plan: ServerSubscriptionPlan;
}>;

/** Server-validated credit capacity derived from the registry cost. */
export type AuthorizationCredits = Readonly<{
  wallet_id: string;
  balance: number;
  reserved: number;
  available: number;
  required: number;
}>;

/** Server-validated usage for the operation's registry quota category. */
export type AuthorizationQuota = Readonly<{
  period_key: string;
  category: AiOperationDefinition['quota_category'];
  used: number;
  limit: number | null;
  remaining: number | null;
}>;

/** Unified context passed forward after all PR 4B.4 authorization stages. */
export type AuthorizedOperationContext = SubscriptionAuthorizationContext & Readonly<{
  credits: AuthorizationCredits;
  quota: AuthorizationQuota;
}>;

/** Stable errors that server functions can translate without exposing internals. */
export class AuthorizationError extends Error {
  readonly code: 'unauthorized' | 'unknown_operation' | 'project_required' | 'project_access_denied' | 'subscription_access_denied' | 'credits_access_denied' | 'insufficient_credits' | 'quota_access_denied' | 'quota_exceeded';
  readonly status: 400 | 401 | 403;

  constructor(
    code: 'unauthorized' | 'unknown_operation' | 'project_required' | 'project_access_denied' | 'subscription_access_denied' | 'credits_access_denied' | 'insufficient_credits' | 'quota_access_denied' | 'quota_exceeded',
    message: string,
    status: 400 | 401 | 403,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AuthorizationError';
    this.code = code;
    this.status = status;
  }
}

/**
 * Starts the server authorization pipeline from an operation ID and
 * request-bound identity. Operation policy is always resolved by the registry;
 * this service does not contain a second authorization, execution or billing
 * policy map.
 *
 * Ownership, subscription, and feature permissions are enforced here. Credits
 * and quota remain isolated fail-closed stages for PR 4B.4.
 */
export class AuthorizationService {
  /** Requires a valid authenticated Base44 user with a stable ID. */
  async requireUser(client: AuthorizationClient): Promise<AuthorizationUser> {
    const user = await client.auth.me();
    if (!isAuthorizationUser(user)) {
      throw new AuthorizationError('unauthorized', 'Authentication required', 401);
    }
    return Object.freeze({ id: user.id, role: user.role });
  }

  /** Resolves immutable server policy for an untrusted operation ID. */
  requireOperation(operationId: unknown): AiOperationDefinition {
    try {
      return requireAiOperation(operationId);
    } catch (error) {
      if (error instanceof UnknownAiOperationError) {
        throw new AuthorizationError(
          'unknown_operation',
          'Unknown AI operation',
          400,
          { cause: error },
        );
      }
      throw error;
    }
  }

  /**
   * Builds identity context only; this is not a provider execution permit.
   */
  async createContext(
    client: AuthorizationClient,
    operationId: unknown,
  ): Promise<AuthorizationContext> {
    // Keep the boundary explicit: Request -> Operation Registry -> Authorization.
    const operation = this.requireOperation(operationId);
    const user = await this.requireUser(client);
    return Object.freeze({ user, operation });
  }

  /**
   * Requires an exact owner match for a project-scoped operation. Project data
   * is loaded with service role only after authenticating, then reduced to a
   * minimal immutable identity before it enters the authorization pipeline.
   */
  async authorizeProject(
    client: AuthorizationClient,
    operationId: unknown,
    projectId: unknown,
  ): Promise<ProjectAuthorizationContext> {
    const context = await this.createContext(client, operationId);
    if (!context.operation.project_scope) {
      throw new AuthorizationError('project_required', 'Operation is not project scoped', 400);
    }
    if (typeof projectId !== 'string' || !projectId.trim()) {
      throw new AuthorizationError('project_required', 'project_id is required', 400);
    }

    let project: unknown;
    try {
      project = await client.asServiceRole.entities.Project.get(projectId.trim());
    } catch {
      throw new AuthorizationError('project_access_denied', 'Project access denied', 403);
    }
    const normalizedProjectId = projectId.trim();
    if (!isOwnedProject(project, context.user.id, normalizedProjectId)) {
      // Use the same response for missing and foreign projects to avoid leaking IDs.
      throw new AuthorizationError('project_access_denied', 'Project access denied', 403);
    }
    return Object.freeze({
      ...context,
      project: Object.freeze({ id: project.id, created_by_id: project.created_by_id }),
    });
  }

  /** Requires an active server subscription with the registry-required feature. */
  async authorizeSubscription(
    client: AuthorizationClient,
    context: ProjectAuthorizationContext,
    now = new Date(),
  ): Promise<SubscriptionAuthorizationContext> {
    let records: unknown;
    try {
      records = await client.asServiceRole.entities.UserSubscription.filter(
        { created_by_id: context.user.id },
        '-updated_date',
        2,
      );
    } catch {
      throw subscriptionDenied();
    }

    const subscription = selectSubscription(records, context.user.id, now);
    const plan = subscription && getServerSubscriptionPlan(subscription.plan_id);
    if (!subscription || !plan ||
      !serverPlanHasFeature(plan, context.operation.required_feature)) {
      throw subscriptionDenied();
    }
    return Object.freeze({ ...context, subscription, plan });
  }

  /** Runs registry, identity, ownership, subscription, and permission stages. */
  async authorizeProjectWithSubscription(
    client: AuthorizationClient,
    operationId: unknown,
    projectId: unknown,
  ): Promise<SubscriptionAuthorizationContext> {
    const context = await this.authorizeProject(client, operationId, projectId);
    return this.authorizeSubscription(client, context);
  }

  /** Validates server wallet capacity using only the registry credit cost. */
  async authorizeCredits(
    client: AuthorizationClient,
    context: SubscriptionAuthorizationContext,
  ): Promise<AuthorizationCredits> {
    let records: unknown;
    try {
      records = await client.asServiceRole.entities.CreditsWallet.filter(
        { created_by_id: context.user.id },
        '-updated_date',
        2,
      );
    } catch {
      throw creditsDenied();
    }
    const credits = selectCredits(records, context.user.id, context.operation.credit_cost);
    if (!credits) throw creditsDenied();

    // Existing clients reserve before invoking providers. Until PR 4C moves the
    // reservation server-side, a valid reservation remains usable capacity.
    const legacyCapacity = credits.available + Math.min(credits.reserved, credits.required);
    if (legacyCapacity < credits.required) {
      throw new AuthorizationError('insufficient_credits', 'Insufficient credits', 403);
    }
    return credits;
  }

  /** Validates current-period usage against the server plan's quota policy. */
  async authorizeQuota(
    client: AuthorizationClient,
    context: SubscriptionAuthorizationContext,
    now = new Date(),
  ): Promise<AuthorizationQuota> {
    const periodKey = now.toISOString().slice(0, 7);
    let records: unknown;
    try {
      records = await client.asServiceRole.entities.SubscriptionUsage.filter(
        { created_by_id: context.user.id, period_key: periodKey },
        '-updated_date',
        2,
      );
    } catch {
      throw quotaDenied();
    }
    const quota = selectQuota(records, context.user.id, periodKey, context);
    if (!quota) throw quotaDenied();
    if (quota.limit !== null && quota.used >= quota.limit) {
      throw new AuthorizationError('quota_exceeded', 'Operation quota exceeded', 403);
    }
    return quota;
  }

  /**
   * Produces one immutable context for downstream reservation and provider
   * stages without changing its identity/project/subscription structure.
   */
  async authorizeOperation(
    client: AuthorizationClient,
    operationId: unknown,
    projectId: unknown,
  ): Promise<AuthorizedOperationContext> {
    const context = await this.authorizeProjectWithSubscription(client, operationId, projectId);
    const credits = await this.authorizeCredits(client, context);
    const quota = await this.authorizeQuota(client, context);
    return Object.freeze({ ...context, credits, quota });
  }
}

function isAuthorizationUser(value: unknown): value is { id: string; role?: string } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { id?: unknown; role?: unknown };
  return typeof candidate.id === 'string' && candidate.id.trim().length > 0 &&
    (candidate.role === undefined || typeof candidate.role === 'string');
}

function isOwnedProject(
  value: unknown,
  userId: string,
  projectId: string,
): value is { id: string; created_by_id: string } {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { id?: unknown; created_by_id?: unknown };
  return candidate.id === projectId &&
    candidate.created_by_id === userId;
}

function selectSubscription(
  value: unknown,
  userId: string,
  now: Date,
): AuthorizationSubscription | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const record = value[0] as Record<string, unknown>;
  if (record.created_by_id !== userId || typeof record.plan_id !== 'string') return null;
  if (record.status === 'free' && record.plan_id === 'free') {
    return Object.freeze({ plan_id: 'free', status: 'free' });
  }
  if (record.status === 'active') {
    const plan = getServerSubscriptionPlan(record.plan_id);
    return plan ? Object.freeze({ plan_id: plan.plan_id, status: 'active' }) : null;
  }
  if (record.status === 'trialing' && typeof record.trial_ends_at === 'string' &&
    new Date(record.trial_ends_at).getTime() > now.getTime()) {
    const plan = getServerSubscriptionPlan(record.plan_id);
    return plan ? Object.freeze({
      plan_id: plan.plan_id,
      status: 'trialing',
      trial_ends_at: record.trial_ends_at,
    }) : null;
  }
  return null;
}

function subscriptionDenied(): AuthorizationError {
  return new AuthorizationError(
    'subscription_access_denied',
    'Subscription does not allow this operation',
    403,
  );
}

const CREDIT_BUCKETS = ['free', 'purchased', 'subscription', 'bonus', 'promotional', 'refund'] as const;

function selectCredits(
  value: unknown,
  userId: string,
  required: number,
): AuthorizationCredits | null {
  if (!Array.isArray(value) || value.length !== 1 || !Number.isInteger(required) || required < 0) return null;
  const record = value[0] as Record<string, unknown>;
  if (record.created_by_id !== userId || typeof record.id !== 'string' ||
    !record.balances || typeof record.balances !== 'object') return null;
  const balances = record.balances as Record<string, unknown>;
  let balance = 0;
  for (const bucket of CREDIT_BUCKETS) {
    const amount = balances[bucket] ?? 0;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return null;
    balance += amount;
  }
  const reserved = record.reserved ?? 0;
  if (typeof reserved !== 'number' || !Number.isFinite(reserved) || reserved < 0 ||
    reserved > balance) return null;
  return Object.freeze({
    wallet_id: record.id,
    balance,
    reserved,
    available: balance - reserved,
    required,
  });
}

function selectQuota(
  value: unknown,
  userId: string,
  periodKey: string,
  context: SubscriptionAuthorizationContext,
): AuthorizationQuota | null {
  if (!Array.isArray(value) || value.length !== 1) return null;
  const record = value[0] as Record<string, unknown>;
  if (record.created_by_id !== userId || record.period_key !== periodKey) return null;
  const features = record.feature_usage;
  if (features !== undefined && (!features || typeof features !== 'object')) return null;
  const rawUsed = (features as Record<string, unknown> | undefined)?.[context.operation.quota_category] ?? 0;
  if (typeof rawUsed !== 'number' || !Number.isFinite(rawUsed) || rawUsed < 0) return null;
  const limit = context.plan.quota_limits[context.operation.quota_category];
  return Object.freeze({
    period_key: periodKey,
    category: context.operation.quota_category,
    used: rawUsed,
    limit,
    remaining: limit === null ? null : Math.max(0, limit - rawUsed),
  });
}

function creditsDenied(): AuthorizationError {
  return new AuthorizationError('credits_access_denied', 'Credit validation failed', 403);
}

function quotaDenied(): AuthorizationError {
  return new AuthorizationError('quota_access_denied', 'Operation quota validation failed', 403);
}

/** Shared stateless instance for Base44 server functions. */
export const authorizationService = new AuthorizationService();
