import type { AiQuotaCategory, AiRequiredFeature } from './aiOperationRegistry.ts';

/** Server-owned feature policy for one subscription plan. */
export type ServerSubscriptionPlan = Readonly<{
  plan_id: 'free' | 'plus' | 'pro' | 'studio' | 'enterprise';
  features: readonly AiRequiredFeature[];
  quota_limits: Readonly<Record<AiQuotaCategory, number | null>>;
}>;

const plan = (
  plan_id: ServerSubscriptionPlan['plan_id'],
  features: readonly AiRequiredFeature[],
): ServerSubscriptionPlan => Object.freeze({
  plan_id,
  features: Object.freeze([...features]),
  // Current product plans are credit-limited, not count-limited. Keeping an
  // explicit null policy prevents AuthorizationService from inventing quotas.
  quota_limits: Object.freeze({ editing: null, segmentation: null, virtual_tryon: null }),
});

/** Server authority for features currently required by registered AI operations. */
export const SERVER_SUBSCRIPTION_PLANS: Readonly<
  Record<ServerSubscriptionPlan['plan_id'], ServerSubscriptionPlan>
> = Object.freeze({
  free: plan('free', ['ai_editing']),
  plus: plan('plus', ['ai_editing', 'virtual_tryon']),
  pro: plan('pro', ['ai_editing', 'virtual_tryon']),
  studio: plan('studio', ['ai_editing', 'virtual_tryon']),
  enterprise: plan('enterprise', ['ai_editing', 'virtual_tryon']),
});

/** Resolves a known server plan without trusting client plan information. */
export function getServerSubscriptionPlan(value: unknown): ServerSubscriptionPlan | null {
  return typeof value === 'string' && Object.hasOwn(SERVER_SUBSCRIPTION_PLANS, value)
    ? SERVER_SUBSCRIPTION_PLANS[value as ServerSubscriptionPlan['plan_id']]
    : null;
}

/** Checks a feature against immutable server plan policy. */
export function serverPlanHasFeature(
  plan: ServerSubscriptionPlan,
  feature: AiRequiredFeature,
): boolean {
  return plan.features.includes(feature);
}
