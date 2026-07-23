import { base44 } from '@/api/base44Client';
import { getPlan } from '@/lib/subscriptions/subscriptionPlans';
import { subscriptionPolicy } from '@/lib/subscriptions/subscriptionPolicy';
import { subscriptionHistory } from '@/lib/subscriptions/subscriptionHistory';

// SubscriptionManager owns subscription state only. A future checkout provider
// can call changePlan() after payment confirmation without touching app logic.
class SubscriptionManager {
  constructor() { this.current = null; this.listeners = new Set(); }
  subscribe(fn) { this.listeners.add(fn); fn(this.current); return () => this.listeners.delete(fn); }
  _set(sub) { this.current = sub; this.listeners.forEach((fn) => fn(sub)); }
  async ensure() {
    const user = await base44.auth.me();
    let [subscription] = await base44.entities.UserSubscription.filter({ created_by_id: user.id });
    if (!subscription) {
      subscription = await base44.entities.UserSubscription.create({ plan_id: 'free', status: 'free', billing_interval: 'monthly', started_at: new Date().toISOString(), trial_used: false, metadata: {} });
      await subscriptionHistory.record({ event_type: 'created', to_plan_id: 'free', note: 'Free subscription created' });
    }
    if (subscription.status === 'trialing' && !subscriptionPolicy.isTrialActive(subscription)) {
      const trialPlanId = subscription.plan_id;
      subscription = await base44.entities.UserSubscription.update(subscription.id, { plan_id: 'free', status: 'expired' });
      await subscriptionHistory.record({ event_type: 'trial_expired', from_plan_id: trialPlanId, to_plan_id: 'free' });
    }
    this._set(subscription); return subscription;
  }
  async changePlan(planId, { interval = 'monthly', source = 'manual' } = {}) {
    const subscription = await this.ensure();
    const plan = getPlan(planId);
    const from = subscription.plan_id;
    const event = subscriptionPolicy.isUpgrade(from, planId) ? 'upgraded' : subscriptionPolicy.isDowngrade(from, planId) ? 'downgraded' : 'plan_changed';
    const updated = await base44.entities.UserSubscription.update(subscription.id, { plan_id: planId, status: planId === 'free' ? 'free' : 'active', billing_interval: interval, renewal_date: null, cancelled_at: null });
    await subscriptionHistory.record({ event_type: event, from_plan_id: from, to_plan_id: planId, source });
    this._set(updated); return updated;
  }
  async startTrial(planId) {
    const subscription = await this.ensure(); const plan = getPlan(planId);
    if (!plan.trialAvailable) throw new Error('This plan does not offer a trial.');
    if (subscription.trial_used) throw new Error('Your account has already used its trial.');
    const now = new Date(); const ends = new Date(now.getTime() + plan.trialDays * 86400000).toISOString();
    const updated = await base44.entities.UserSubscription.update(subscription.id, { plan_id: planId, status: 'trialing', trial_started_at: now.toISOString(), trial_ends_at: ends, trial_used: true });
    await subscriptionHistory.record({ event_type: 'trial_started', from_plan_id: subscription.plan_id, to_plan_id: planId });
    this._set(updated); return updated;
  }
}
export const subscriptionManager = new SubscriptionManager();