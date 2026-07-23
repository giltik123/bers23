class JobScheduler {
  constructor() { this.timers = new Map(); }
  schedule(job, delay, callback) {
    this.cancel(job.id);
    this.timers.set(job.id, window.setTimeout(() => { this.timers.delete(job.id); callback(job); }, delay));
  }
  cancel(jobId) { const timer = this.timers.get(jobId); if (timer) window.clearTimeout(timer); this.timers.delete(jobId); }
}
export const jobScheduler = new JobScheduler();