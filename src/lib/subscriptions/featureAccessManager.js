import { subscriptionManager } from '@/lib/subscriptions/subscriptionManager';
import { subscriptionPolicy } from '@/lib/subscriptions/subscriptionPolicy';

class FeatureAccessManager {
  async canAccess(feature) { const subscription = await subscriptionManager.ensure(); return subscriptionPolicy.hasFeature(subscription.plan_id, feature); }
  async require(feature) {
    const allowed = await this.canAccess(feature);
    if (!allowed) throw new Error('Your current plan does not include this feature.');
    return true;
  }
}
export const featureAccessManager = new FeatureAccessManager();