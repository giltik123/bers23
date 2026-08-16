import { coreClient } from '@/api/coreClient';

// CreditsHistory — the transaction ledger. Every credit operation is recorded
// as a CreditTransaction; this module reads it back.
class CreditsHistory {
  async list({ type = null, projectId = null, limit = 100 } = {}) {
    const user = await coreClient.auth.me();
    const query = { created_by_id: user.id };
    if (type) query.type = type;
    if (projectId) query.project_id = projectId;
    return coreClient.entities.CreditTransaction.filter(query, '-created_date', limit);
  }

  async forProject(projectId, limit = 50) { return this.list({ projectId, limit }); }
  async spends(limit = 100) { return this.list({ type: 'spend', limit }); }
  async refunds(limit = 100) { return this.list({ type: 'refund', limit }); }
}

export const creditsHistory = new CreditsHistory();