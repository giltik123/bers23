/** Stable identifiers accepted by server-side AI authorization boundaries. */
export type AiOperationId = 'reve.edit' | 'sam3.segment' | 'fashn.tryon';

/** AI providers currently reachable through server functions. */
export type AiProvider = 'reve' | 'fal-ai/sam-3' | 'fashn';

/** Subscription features evaluated by the future AuthorizationService. */
export type AiRequiredFeature = 'ai_editing' | 'virtual_tryon';

/** Usage counters evaluated by server-side quota enforcement. */
export type AiQuotaCategory = 'editing' | 'segmentation' | 'virtual_tryon';

/** Credit lifecycle applied by the future transaction layer. */
export type AiBillingStrategy = 'reserve_commit';

/** Immutable server-owned policy for one billable AI operation. */
export type AiOperationDefinition = Readonly<{
  operation_id: AiOperationId;
  provider: AiProvider;
  project_scope: boolean;
  required_feature: AiRequiredFeature;
  credit_cost: number;
  quota_category: AiQuotaCategory;
  timeout_seconds: number;
  max_retries: number;
  idempotent: boolean;
  billing_strategy: AiBillingStrategy;
  version: number;
}>;

const defineOperation = (definition: AiOperationDefinition): AiOperationDefinition =>
  Object.freeze(definition);

/**
 * Server-owned source of truth for AI operation policy.
 *
 * Clients may submit only an operation ID. Provider, project scope, feature,
 * cost, quota, execution and billing policy must come from this registry.
 */
export const AI_OPERATION_REGISTRY: Readonly<Record<AiOperationId, AiOperationDefinition>> =
  Object.freeze({
    'reve.edit': defineOperation({
      operation_id: 'reve.edit',
      provider: 'reve',
      project_scope: true,
      required_feature: 'ai_editing',
      credit_cost: 30,
      quota_category: 'editing',
      timeout_seconds: 90,
      max_retries: 2,
      idempotent: false,
      billing_strategy: 'reserve_commit',
      version: 1,
    }),
    'sam3.segment': defineOperation({
      operation_id: 'sam3.segment',
      provider: 'fal-ai/sam-3',
      project_scope: true,
      required_feature: 'ai_editing',
      credit_cost: 10,
      quota_category: 'segmentation',
      timeout_seconds: 60,
      max_retries: 2,
      idempotent: false,
      billing_strategy: 'reserve_commit',
      version: 1,
    }),
    'fashn.tryon': defineOperation({
      operation_id: 'fashn.tryon',
      provider: 'fashn',
      project_scope: true,
      required_feature: 'virtual_tryon',
      credit_cost: 50,
      quota_category: 'virtual_tryon',
      timeout_seconds: 120,
      max_retries: 0,
      idempotent: false,
      billing_strategy: 'reserve_commit',
      version: 1,
    }),
  });

/** Returns whether an untrusted value is a registered operation ID. */
export function isAiOperationId(value: unknown): value is AiOperationId {
  return typeof value === 'string' && Object.hasOwn(AI_OPERATION_REGISTRY, value);
}

/** Resolves an operation without accepting client-supplied policy fields. */
export function getAiOperation(value: unknown): AiOperationDefinition | null {
  return isAiOperationId(value) ? AI_OPERATION_REGISTRY[value] : null;
}

/** Resolves a registered operation or rejects an unknown client value. */
export function requireAiOperation(value: unknown): AiOperationDefinition {
  const operation = getAiOperation(value);
  if (!operation) throw new UnknownAiOperationError(value);
  return operation;
}

/** Lists registered operations for server diagnostics without exposing mutation. */
export function listAiOperations(): readonly AiOperationDefinition[] {
  return Object.freeze(Object.values(AI_OPERATION_REGISTRY));
}

/** Stable validation error used when a client submits an unknown operation ID. */
export class UnknownAiOperationError extends Error {
  readonly code = 'unknown_operation';

  constructor(value: unknown) {
    super(`Unknown AI operation: ${typeof value === 'string' ? value : '<invalid>'}`);
    this.name = 'UnknownAiOperationError';
  }
}
