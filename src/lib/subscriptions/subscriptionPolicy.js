import { getPlan, getPlanIndex } from '@/lib/subscriptions/subscriptionPlans';

export const FEATURES = {
  AI_EDITING: 'ai_editing', VIRTUAL_TRYON: 'virtual_tryon', AI_AGENT: 'ai_agent',
  RECIPE_CHAINS: 'recipe_chains', PREMIUM_RECIPES: 'premium_recipes', SCENE_MEMORY: 'scene_memory',
  BATCH_PROCESSING: 'batch_processing', HIGH_RES_EXPORT: 'high_resolution_export',
  PRIORITY_QUEUE: 'priority_queue', COMMERCIAL_LICENSE: 'commercial_license',
};

class SubscriptionPolicy {
  hasFeature(planId, feature) { return getPlan(planId).features.includes(feature); }
  isUpgrade(fromPlanId, toPlanId) { return getPlanIndex(toPlanId) > getPlanIndex(fromPlanId); }
  isDowngrade(fromPlanId, toPlanId) { return getPlanIndex(toPlanId) < getPlanIndex(fromPlanId); }
  isTrialActive(subscription) { return subscription?.status === 'trialing' && new Date(subscription.trial_ends_at).getTime() > Date.now(); }
  trialDaysRemaining(subscription) { return Math.max(0, Math.ceil((new Date(subscription?.trial_ends_at).getTime() - Date.now()) / 86400000)); }
  renewalLabel(subscription) { return subscription?.renewal_date ? new Date(subscription.renewal_date).toLocaleDateString() : 'No renewal scheduled'; }
}
export const subscriptionPolicy = new SubscriptionPolicy();