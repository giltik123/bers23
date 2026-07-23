import { getPlan } from '@/lib/subscriptions/subscriptionPlans';
import { subscriptionManager } from '@/lib/subscriptions/subscriptionManager';
import { subscriptionUsage } from '@/lib/subscriptions/subscriptionUsage';
import { featureAccessManager } from '@/lib/subscriptions/featureAccessManager';
import { creditsWallet } from '@/lib/credits/creditsWallet';

// SubscriptionValidator centralizes every plan guard for app boundaries.
class SubscriptionValidator {
  async context() { const subscription = await subscriptionManager.ensure(); return { subscription, plan: getPlan(subscription.plan_id), usage: await subscriptionUsage.ensure() }; }
  async validateProject({ width = 0, height = 0 }) {
    const { plan, usage } = await this.context();
    if ((usage.projects_created || 0) >= plan.maxProjects) throw new Error(`Your ${plan.name} plan supports up to ${plan.maxProjects} projects per month.`);
    if (Math.max(width || 0, height || 0) > plan.maxImageResolution) throw new Error(`Your ${plan.name} plan supports images up to ${plan.maxImageResolution}px.`);
    return true;
  }
  async validateStorage(bytes = 0) {
    const { plan, usage } = await this.context();
    const maxBytes = plan.maxStorage * 1024 * 1024 * 1024;
    if ((usage.storage_used || 0) + bytes > maxBytes) throw new Error(`This upload would exceed your ${plan.maxStorage} GB storage limit.`);
    return true;
  }
  async validateQueue(currentLength = 0) { const { plan } = await this.context(); if (currentLength >= plan.maxQueueLength) throw new Error(`Your ${plan.name} plan allows up to ${plan.maxQueueLength} queued job${plan.maxQueueLength === 1 ? '' : 's'}.`); return true; }
  async validateCredits(amount) { const wallet = await creditsWallet.ensure(); if (creditsWallet.available(wallet) < amount) throw new Error('You do not have enough credits for this operation.'); return true; }
  async validateOperation({ feature, credits = 0 }) { if (feature) await featureAccessManager.require(feature); if (credits) await this.validateCredits(credits); return true; }
}
export const subscriptionValidator = new SubscriptionValidator();