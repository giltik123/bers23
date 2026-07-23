class JobHistory {
  constructor() { this.entries = []; }
  record(job) {
    const entry = { jobId: job.id, projectId: job.projectId, type: job.type, result: job.result, completedAt: job.completed_at, versionSnapshot: job.result?.image_url ? { imageUrl: job.result.image_url, createdAt: Date.now() } : null };
    this.entries = [entry, ...this.entries].slice(0, 50); return entry;
  }
  list(projectId) { return this.entries.filter((entry) => !projectId || entry.projectId === projectId); }
}
export const jobHistory = new JobHistory();