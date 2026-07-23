import { creditsWallet } from '@/lib/credits/creditsWallet';
import { creditsReservation } from '@/lib/credits/creditsReservation';

// CreditsEngine — the ONE gate every AI action passes through.
// reserve → execute → settle on success / auto-release on failure, cancel or timeout.
class CreditsEngine {
  async ensure() { return creditsWallet.ensure(); }

  async canAfford(amount) {
    const wallet = await creditsWallet.ensure();
    return creditsWallet.available(wallet) >= amount;
  }

  failureReason(error) {
    if (error?.code === 'cancelled') return 'cancelled';
    const msg = (error?.message || '').toLowerCase();
    if (msg.includes('timeout') || msg.includes('timed out')) return 'timeout';
    if (msg.includes('rejected') || msg.includes('valid')) return 'validation_failure';
    return 'provider_failure';
  }

  // run({ operation, provider, credits, projectId, execute }) → execute()'s result.
  // Settles with the provider-reported actual cost when available (credits_used).
  async run({ operation, provider, credits, projectId, execute }) {
    await creditsWallet.ensure();
    const reservation = await creditsReservation.reserve({ amount: credits, operation, provider, projectId });
    try {
      const result = await execute();
      await creditsReservation.settle(reservation, result?.credits_used ?? credits);
      return result;
    } catch (error) {
      await creditsReservation.release(reservation, this.failureReason(error));
      throw error;
    }
  }
}

export const creditsEngine = new CreditsEngine();