import { requireServerFinancialAuthority } from '@/lib/financial/clientFinancialAuthority';

// Usage is derived from trusted server-side operation completion. Browser clocks,
// counters and arbitrary deltas are not production usage authority.
class SubscriptionUsageService {
  constructor() { this.current = null; }
  async ensure() { return requireServerFinancialAuthority('subscriptionUsage.ensure'); }
  async track() { return requireServerFinancialAuthority('subscriptionUsage.track'); }
}

export const subscriptionUsage = new SubscriptionUsageService();
