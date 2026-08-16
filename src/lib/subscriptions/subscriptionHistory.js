import { coreClient } from '@/api/coreClient';

class SubscriptionHistoryService {
  record(data) { return coreClient.entities.SubscriptionHistory.create({ source: 'subscription_engine', ...data }); }
  async list(limit = 50) {
    const user = await coreClient.auth.me();
    return coreClient.entities.SubscriptionHistory.filter({ created_by_id: user.id }, '-created_date', limit);
  }
}
export const subscriptionHistory = new SubscriptionHistoryService();