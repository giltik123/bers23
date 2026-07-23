import { JOB_PRIORITIES } from '@/lib/jobs/jobModel';

// Priority Queue — jobs ordered by priority (high first), FIFO within a priority.
class JobQueue {
  constructor() { this.items = []; }

  enqueue(job) {
    const rank = JOB_PRIORITIES[job.priority] ?? JOB_PRIORITIES.normal;
    const index = this.items.findIndex((j) => (JOB_PRIORITIES[j.priority] ?? 1) > rank);
    if (index === -1) this.items.push(job);
    else this.items.splice(index, 0, job);
  }

  dequeue() { return this.items.shift() || null; }
  reorder(jobId, index) {
    const job = this.remove(jobId); if (!job) return null;
    this.items.splice(Math.max(0, Math.min(index, this.items.length)), 0, job); return job;
  }
  setPriority(jobId, priority) {
    const job = this.remove(jobId); if (!job) return null;
    job.priority = priority; this.enqueue(job); return job;
  }
  remove(jobId) {
    const index = this.items.findIndex((j) => j.id === jobId);
    return index === -1 ? null : this.items.splice(index, 1)[0];
  }
  get size() { return this.items.length; }
  list() { return [...this.items]; }
}

export const jobQueue = new JobQueue();