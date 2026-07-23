import { base44 } from '@/api/base44Client';
import { creditsWallet } from '@/lib/credits/creditsWallet';
import { creditsPolicy } from '@/lib/credits/creditsPolicy';

// CreditsReservation — credits are reserved BEFORE execution, settled on success,
// and released (auto-refunded) on failure or cancellation.
class CreditsReservation {
  async reserve({ amount, operation, provider, projectId }) {
    const wallet = await creditsWallet.ensure();
    const available = creditsWallet.available(wallet);
    if (available < amount) {
      throw new Error(`Not enough credits: this needs ${amount}, you have ${available} available.`);
    }
    const tx = await base44.entities.CreditTransaction.create({
      type: 'reserve', amount, operation, provider, project_id: projectId, status: 'pending',
    });
    await creditsWallet.update({ reserved: (wallet.reserved || 0) + amount });
    return { id: tx.id, amount, operation, provider, projectId };
  }

  // Success: deduct across balance buckets by policy priority and record the spend.
  async settle(reservation, actualAmount = null) {
    const amount = actualAmount ?? reservation.amount;
    const wallet = creditsWallet.state.wallet;
    const { breakdown } = creditsPolicy.allocateSpend(wallet.balances || {}, amount);
    const balances = { ...wallet.balances };
    for (const [type, spent] of Object.entries(breakdown)) balances[type] = (balances[type] || 0) - spent;

    await creditsWallet.update({
      balances,
      reserved: Math.max(0, (wallet.reserved || 0) - reservation.amount),
      lifetime_spent: (wallet.lifetime_spent || 0) + amount,
    });
    await base44.entities.CreditTransaction.update(reservation.id, { status: 'completed' });
    return base44.entities.CreditTransaction.create({
      type: 'spend', amount, breakdown,
      operation: reservation.operation, provider: reservation.provider,
      project_id: reservation.projectId, reservation_id: reservation.id, status: 'completed',
    });
  }

  // Failure / cancellation / timeout: reserved credits return to the balance untouched.
  async release(reservation, reason = 'cancelled') {
    const wallet = creditsWallet.state.wallet;
    await creditsWallet.update({ reserved: Math.max(0, (wallet.reserved || 0) - reservation.amount) });
    await base44.entities.CreditTransaction.update(reservation.id, { status: 'refunded', reason });
    return base44.entities.CreditTransaction.create({
      type: 'release', amount: reservation.amount, reason,
      operation: reservation.operation, provider: reservation.provider,
      project_id: reservation.projectId, reservation_id: reservation.id, status: 'completed',
    });
  }
}

export const creditsReservation = new CreditsReservation();