import { subscriptionHistory } from '@/lib/subscriptions/subscriptionHistory';
import { subscriptionUsage } from '@/lib/subscriptions/subscriptionUsage';

class SubscriptionAnalytics {
  async summary() {
    const [history, usage] = await Promise.all([subscriptionHistory.list(250), subscriptionUsage.ensure()]);
    const upgrades = history.filter((event) => event.event_type === 'upgraded').length;
    const downgrades = history.filter((event) => event.event_type === 'downgraded').length;
    const trials = history.filter((event) => event.event_type === 'trial_started').length;
    const conversions = history.filter((event) => event.event_type === 'upgraded' && event.from_plan_id !== 'free').length;
    return { planPopularity: history.reduce((all, e) => ({ ...all, [e.to_plan_id]: (all[e.to_plan_id] || 0) + 1 }), {}), upgradeRate: upgrades, downgradeRate: downgrades, trialConversion: trials ? Math.round((conversions / trials) * 100) : 0, featureUsageByPlan: usage.feature_usage || {} };
  }
}
export const subscriptionAnalytics = new SubscriptionAnalytics();