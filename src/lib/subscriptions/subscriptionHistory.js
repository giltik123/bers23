import { base44 } from '@/api/base44Client';

class SubscriptionHistoryService {
  record(data) { return base44.entities.SubscriptionHistory.create({ source: 'subscription_engine', ...data }); }
  async list(limit = 50) {
    const user = await base44.auth.me();
    return base44.entities.SubscriptionHistory.filter({ created_by_id: user.id }, '-created_date', limit);
  }
}
export const subscriptionHistory = new SubscriptionHistoryService();