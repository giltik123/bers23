import { requireServerFinancialAuthority } from '@/lib/financial/clientFinancialAuthority';

// Reservation/settlement/release are owned by the canonical server transaction
// service. This legacy browser facade remains only to fail closed for old callers.
class CreditsReservation {
  async reserve() { return requireServerFinancialAuthority('creditsReservation.reserve'); }
  async settle() { return requireServerFinancialAuthority('creditsReservation.settle'); }
  async release() { return requireServerFinancialAuthority('creditsReservation.release'); }
}

export const creditsReservation = new CreditsReservation();
