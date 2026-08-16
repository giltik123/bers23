import { coreClient } from '@/api/coreClient';
import { creditsPolicy, WELCOME_GRANT, CREDIT_TYPES } from '@/lib/credits/creditsPolicy';

const zeroBalances = () => Object.fromEntries(CREDIT_TYPES.map((t) => [t, 0]));

// CreditsWallet — one wallet per user. Owns balance buckets, reserved credits,
// lifetime counters and expiration dates. All mutations go through here.
class CreditsWalletService {
  constructor() {
    this.state = { wallet: null, loading: true };
    this.listeners = new Set();
    this._ensuring = null;
  }

  subscribe(fn) { this.listeners.add(fn); fn({ ...this.state }); return () => this.listeners.delete(fn); }
  _set(patch) { this.state = { ...this.state, ...patch }; const s = { ...this.state }; this.listeners.forEach((fn) => fn(s)); }

  totalBalance(wallet = this.state.wallet) {
    if (!wallet) return 0;
    return CREDIT_TYPES.reduce((sum, t) => sum + (wallet.balances?.[t] || 0), 0);
  }

  available(wallet = this.state.wallet) {
    if (!wallet) return 0;
    return this.totalBalance(wallet) - (wallet.reserved || 0);
  }

  async ensure() {
    if (this.state.wallet) return this.state.wallet;
    if (!this._ensuring) this._ensuring = this._load().finally(() => { this._ensuring = null; });
    return this._ensuring;
  }

  async _load() {
    const user = await coreClient.auth.me();
    let [wallet] = await coreClient.entities.CreditsWallet.filter({ created_by_id: user.id });
    if (!wallet) {
      const balances = zeroBalances();
      balances[WELCOME_GRANT.credit_type] = WELCOME_GRANT.amount;
      wallet = await coreClient.entities.CreditsWallet.create({
        balances, reserved: 0,
        lifetime_spent: 0, lifetime_purchased: 0, lifetime_earned: WELCOME_GRANT.amount,
        expirations: [], welcome_granted: true,
      });
      await coreClient.entities.CreditTransaction.create({
        type: 'grant', credit_type: WELCOME_GRANT.credit_type, amount: WELCOME_GRANT.amount,
        status: 'completed', note: 'Welcome credits',
      });
    } else {
      wallet = await this._applyExpirations(wallet);
    }
    this._set({ wallet, loading: false });
    return wallet;
  }

  // Removes expired credit lots from balances and the expirations list.
  async _applyExpirations(wallet) {
    const now = Date.now();
    const expired = (wallet.expirations || []).filter((e) => e.expires_at && new Date(e.expires_at).getTime() < now);
    if (!expired.length) return wallet;

    const balances = { ...zeroBalances(), ...wallet.balances };
    for (const lot of expired) {
      const removable = Math.min(balances[lot.credit_type] || 0, lot.amount);
      balances[lot.credit_type] -= removable;
      if (removable > 0) {
        await coreClient.entities.CreditTransaction.create({
          type: 'release', credit_type: lot.credit_type, amount: removable,
          status: 'completed', reason: 'expired', note: 'Credits expired',
        });
      }
    }
    const remaining = (wallet.expirations || []).filter((e) => !expired.includes(e));
    return coreClient.entities.CreditsWallet.update(wallet.id, { balances, expirations: remaining });
  }

  async update(patch) {
    const updated = await coreClient.entities.CreditsWallet.update(this.state.wallet.id, patch);
    this._set({ wallet: updated });
    return updated;
  }
}

export const creditsWallet = new CreditsWalletService();