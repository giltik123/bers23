import { coreClient } from '@/api/coreClient';

const fields = (job) => ({ job_id: job.id, project_id: job.projectId, user_id: job.userId, type: job.type, provider: job.provider, status: job.status, priority: job.priority, progress: job.progress, estimated_time: job.estimatedTime, credits_reserved: job.creditsReserved, credits_consumed: job.creditsConsumed, created_at: job.created_at, started_at: job.started_at, completed_at: job.completed_at, failed_at: job.failed_at, retry_count: job.retry_count, payload: job.payload || {}, result: job.result || {}, error: job.error, metadata: job.metadata || {} });
class JobStorage {
  async save(job) {
    const data = fields(job);
    if (job.storageId) return coreClient.entities.JobRecord.update(job.storageId, data);
    const record = await coreClient.entities.JobRecord.create(data); job.storageId = record.id; return record;
  }
  async list(projectId = null) { return coreClient.entities.JobRecord.filter(projectId ? { project_id: projectId } : {}, '-created_date', 50); }
}
export const jobStorage = new JobStorage();