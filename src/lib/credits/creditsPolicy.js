// CreditsPolicy — the single source of truth for credit rules.
// Types, spending priority, expiration windows, grants and refund reasons.

export const CREDIT_TYPES = ['free', 'purchased', 'subscription', 'bonus', 'promotional', 'refund'];

// Spending priority: expiring/gifted credits burn first, purchased last.
export const SPEND_PRIORITY = ['promotional', 'bonus', 'free', 'subscription', 'refund', 'purchased'];

// Expiration windows in days (null = never expires).
export const EXPIRATION_DAYS = {
  free: null,
  purchased: null,
  subscription: 30,
  bonus: 90,
  promotional: 14,
  refund: null,
};

// One-time welcome grant for new wallets.
export const WELCOME_GRANT = { credit_type: 'free', amount: 500 };

// Automatic refund reasons — anything else requires a manual admin refund.
export const AUTO_REFUND_REASONS = ['cancelled', 'provider_failure', 'validation_failure', 'timeout'];

export const labelizeCreditType = (t) => ({ free: 'Free', purchased: 'Purchased', subscription: 'Subscription', bonus: 'Bonus', promotional: 'Promotional', refund: 'Refund' }[t] || t);

class CreditsPolicy {
  isValidType(type) { return CREDIT_TYPES.includes(type); }
  isAutoRefundable(reason) { return AUTO_REFUND_REASONS.includes(reason); }

  expiryDateFor(creditType, from = new Date()) {
    const days = EXPIRATION_DAYS[creditType];
    if (!days) return null;
    return new Date(from.getTime() + days * 86400000).toISOString();
  }

  // Splits a spend amount across balance buckets by priority.
  // → { breakdown: {type: amount}, covered: boolean }
  allocateSpend(balances, amount) {
    const breakdown = {};
    let remaining = amount;
    for (const type of SPEND_PRIORITY) {
      if (remaining <= 0) break;
      const available = balances[type] || 0;
      if (available <= 0) continue;
      const take = Math.min(available, remaining);
      breakdown[type] = take;
      remaining -= take;
    }
    return { breakdown, covered: remaining <= 0, shortfall: Math.max(0, remaining) };
  }
}

export const creditsPolicy = new CreditsPolicy();