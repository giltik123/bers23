import { requireServerFinancialAuthority } from '@/lib/financial/clientFinancialAuthority';

// Compatibility facade only. Subscription/entitlement state is server-owned.
// No browser method may bootstrap, activate, expire or mutate a plan/trial.
class SubscriptionManager {
  constructor() { this.current = null; this.listeners = new Set(); }
  subscribe(fn) { this.listeners.add(fn); fn(this.current); return () => this.listeners.delete(fn); }
  _set(sub) { this.current = sub; this.listeners.forEach((fn) => fn(sub)); }
  async ensure() { return requireServerFinancialAuthority('subscription.ensure'); }
  async changePlan() { return requireServerFinancialAuthority('subscription.changePlan'); }
  async startTrial() { return requireServerFinancialAuthority('subscription.startTrial'); }
}

export const subscriptionManager = new SubscriptionManager();
