import { creditsHistory } from '@/lib/credits/creditsHistory';

// CreditsAnalytics — usage insight derived from the transaction ledger:
// earned vs spent, refunds, average cost and the most expensive features.
class CreditsAnalytics {
  async summary(limit = 500) {
    const txs = await creditsHistory.list({ limit });
    const spends = txs.filter((t) => t.type === 'spend');
    const grants = txs.filter((t) => t.type === 'grant');
    const refunds = txs.filter((t) => t.type === 'refund');
    const releases = txs.filter((t) => t.type === 'release');

    const spent = spends.reduce((s, t) => s + t.amount, 0);
    const earned = grants.reduce((s, t) => s + t.amount, 0) + refunds.reduce((s, t) => s + t.amount, 0);

    const byOperation = {};
    for (const t of spends) {
      const key = t.operation || 'unknown';
      byOperation[key] = byOperation[key] || { operation: key, total: 0, count: 0 };
      byOperation[key].total += t.amount;
      byOperation[key].count += 1;
    }
    const topFeatures = Object.values(byOperation).sort((a, b) => b.total - a.total).slice(0, 5);

    return {
      earned,
      spent,
      refunds: { count: refunds.length + releases.length, amount: refunds.reduce((s, t) => s + t.amount, 0) + releases.reduce((s, t) => s + t.amount, 0) },
      averageCost: spends.length ? Math.round(spent / spends.length) : 0,
      operations: spends.length,
      topFeatures,
    };
  }
}

export const creditsAnalytics = new CreditsAnalytics();