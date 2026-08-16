import { coreClient } from '@/api/coreClient';

const periodKey = (date = new Date()) => date.toISOString().slice(0, 7);
const dayKey = (date = new Date()) => date.toISOString().slice(0, 10);

// SubscriptionUsage — one current-period record per user, with daily/monthly
// feature counters for limits, recommendations, and analytics.
class SubscriptionUsageService {
  constructor() { this.current = null; }
  async ensure() {
    const user = await coreClient.auth.me();
    const key = periodKey();
    if (this.current?.period_key === key) return this.current;
    let [usage] = await coreClient.entities.SubscriptionUsage.filter({ created_by_id: user.id, period_key: key });
    if (!usage) usage = await coreClient.entities.SubscriptionUsage.create({ period_key: key, daily_usage: {}, monthly_usage: {}, feature_usage: {} });
    this.current = usage;
    return usage;
  }
  async track({ projects = 0, credits = 0, storage = 0, aiGenerations = 0, tryons = 0, recipes = 0, feature = null }) {
    const usage = await this.ensure();
    const day = dayKey();
    const daily = { ...(usage.daily_usage || {}) };
    daily[day] = { ...(daily[day] || {}), projects: (daily[day]?.projects || 0) + projects, credits: (daily[day]?.credits || 0) + credits, ai_generations: (daily[day]?.ai_generations || 0) + aiGenerations, tryons: (daily[day]?.tryons || 0) + tryons, recipes: (daily[day]?.recipes || 0) + recipes };
    const features = { ...(usage.feature_usage || {}) };
    if (feature) features[feature] = (features[feature] || 0) + 1;
    this.current = await coreClient.entities.SubscriptionUsage.update(usage.id, {
      projects_created: (usage.projects_created || 0) + projects, credits_used: (usage.credits_used || 0) + credits,
      storage_used: (usage.storage_used || 0) + storage, ai_generations: (usage.ai_generations || 0) + aiGenerations,
      tryon_generations: (usage.tryon_generations || 0) + tryons, recipe_usage: (usage.recipe_usage || 0) + recipes,
      daily_usage: daily, monthly_usage: { ...(usage.monthly_usage || {}), [periodKey()]: { projects: (usage.projects_created || 0) + projects, credits: (usage.credits_used || 0) + credits } }, feature_usage: features,
    });
    return this.current;
  }
}
export const subscriptionUsage = new SubscriptionUsageService();