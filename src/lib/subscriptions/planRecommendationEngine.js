import { subscriptionUsage } from '@/lib/subscriptions/subscriptionUsage';
import { subscriptionManager } from '@/lib/subscriptions/subscriptionManager';

class PlanRecommendationEngine {
  async recommend() {
    const [usage, subscription] = await Promise.all([subscriptionUsage.ensure(), subscriptionManager.ensure()]);
    if (subscription.plan_id === 'enterprise') return [];
    const suggestions = [];
    if ((usage.tryon_generations || 0) >= 5 && !['pro', 'studio'].includes(subscription.plan_id)) suggestions.push({ planId: 'pro', reason: 'You use Virtual Try-On often. Pro includes more capacity for it.' });
    if ((usage.feature_usage?.commercial_license || 0) > 0 || (usage.ai_generations || 0) >= 50) suggestions.push({ planId: 'studio', reason: 'Your high-volume creative work is a strong fit for Studio.' });
    if ((usage.projects_created || 0) >= 0.8 * 3 && subscription.plan_id === 'free') suggestions.push({ planId: 'plus', reason: 'You are nearing the Free plan project limit.' });
    return suggestions.slice(0, 2);
  }
}
export const planRecommendationEngine = new PlanRecommendationEngine();