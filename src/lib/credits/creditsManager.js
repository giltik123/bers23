import { base44 } from '@/api/base44Client';
import { creditsWallet } from '@/lib/credits/creditsWallet';
import { creditsPolicy } from '@/lib/credits/creditsPolicy';
import { creditsAnalytics } from '@/lib/credits/creditsAnalytics';

// CreditsManager — grants, manual admin refunds and wallet overview.
// (No payment provider yet — purchased/subscription grants are recorded the same way.)
class CreditsManager {
  async grant({ creditType, amount, note = '' }) {
    if (!creditsPolicy.isValidType(creditType)) throw new Error(`Unknown credit type: ${creditType}`);
    const wallet = await creditsWallet.ensure();
    const balances = { ...wallet.balances, [creditType]: (wallet.balances?.[creditType] || 0) + amount };
    const patch = { balances, lifetime_earned: (wallet.lifetime_earned || 0) + amount };
    if (creditType === 'purchased') patch.lifetime_purchased = (wallet.lifetime_purchased || 0) + amount;

    const expiresAt = creditsPolicy.expiryDateFor(creditType);
    if (expiresAt) patch.expirations = [...(wallet.expirations || []), { credit_type: creditType, amount, expires_at: expiresAt }];

    await creditsWallet.update(patch);
    return base44.entities.CreditTransaction.create({ type: 'grant', credit_type: creditType, amount, status: 'completed', note });
  }

  // Manual admin refund of a past spend — credits go into the refund bucket.
  async manualRefund({ transaction, note = '' }) {
    const wallet = await creditsWallet.ensure();
    await creditsWallet.update({
      balances: { ...wallet.balances, refund: (wallet.balances?.refund || 0) + transaction.amount },
    });
    await base44.entities.CreditTransaction.update(transaction.id, { status: 'refunded' });
    return base44.entities.CreditTransaction.create({
      type: 'refund', credit_type: 'refund', amount: transaction.amount,
      operation: transaction.operation, provider: transaction.provider,
      project_id: transaction.project_id, reservation_id: transaction.reservation_id,
      status: 'completed', reason: 'manual', note,
    });
  }

  async overview() {
    const wallet = await creditsWallet.ensure();
    const analytics = await creditsAnalytics.summary();
    return {
      wallet,
      totalBalance: creditsWallet.totalBalance(wallet),
      available: creditsWallet.available(wallet),
      reserved: wallet.reserved || 0,
      analytics,
    };
  }
}

export const creditsManager = new CreditsManager();