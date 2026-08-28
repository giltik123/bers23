import { requireServerFinancialAuthority } from '@/lib/financial/clientFinancialAuthority';

// Grants, refunds and wallet administration are privileged server operations.
// The browser compatibility facade is intentionally fail-closed.
class CreditsManager {
  async grant() { return requireServerFinancialAuthority('creditsManager.grant'); }
  async manualRefund() { return requireServerFinancialAuthority('creditsManager.manualRefund'); }
  async overview() { return requireServerFinancialAuthority('creditsManager.overview'); }
}

export const creditsManager = new CreditsManager();
