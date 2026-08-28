import { requireServerFinancialAuthority } from '@/lib/financial/clientFinancialAuthority';
import { CREDIT_TYPES } from '@/lib/credits/creditsPolicy';

// Read helpers remain pure for compatibility, but the browser has no authority to
// bootstrap, expire, grant or patch a wallet. Canonical balances are server-owned.
class CreditsWalletService {
  constructor() {
    this.state = { wallet: null, loading: false, authority: 'SERVER_REQUIRED' };
    this.listeners = new Set();
  }

  subscribe(fn) { this.listeners.add(fn); fn({ ...this.state }); return () => this.listeners.delete(fn); }

  totalBalance(wallet = this.state.wallet) {
    if (!wallet) return 0;
    return CREDIT_TYPES.reduce((sum, type) => sum + (wallet.balances?.[type] || 0), 0);
  }

  available(wallet = this.state.wallet) {
    if (!wallet) return 0;
    return this.totalBalance(wallet) - (wallet.reserved || 0);
  }

  async ensure() { return requireServerFinancialAuthority('creditsWallet.ensure'); }
  async update() { return requireServerFinancialAuthority('creditsWallet.update'); }
}

export const creditsWallet = new CreditsWalletService();
