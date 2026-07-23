import { jobExecutor } from '@/lib/jobs/jobExecutor';
import { setJobStatus, updateJobProgress } from '@/lib/jobs/jobModel';

// Worker Pool — one worker implementation today, with capacity ready for future scaling.
class JobWorkerPool {
  constructor(maxWorkers = 1) { this.maxWorkers = maxWorkers; this.active = []; this.callbacks = null; }
  get current() { return this.active[0] || null; }

  start(queue, callbacks) {
    this.callbacks = callbacks;
    if (callbacks.isPaused?.()) return;
    while (this.active.length < this.maxWorkers && queue.size > 0) this._runNext(queue);
  }

  async _runNext(queue) {
    const job = queue.dequeue(); if (!job) return;
    this.active.push(job); setJobStatus(job, 'preparing'); updateJobProgress(job, 5, 'preparing');
    await Promise.resolve(this.callbacks.onJobUpdate(job)).catch(() => {});
    setJobStatus(job, 'running'); updateJobProgress(job, 10, 'running');
    await Promise.resolve(this.callbacks.onJobUpdate(job)).catch(() => {});
    try {
      const result = await jobExecutor.execute(job, (progress, stage) => { updateJobProgress(job, progress, stage); this.callbacks.onJobUpdate(job); });
      job.result = result; job.creditsConsumed = result?.credits_used || job.creditsReserved; setJobStatus(job, 'completed'); job._resolve(result);
    } catch (error) {
      job.error = error?.message || 'Job failed';
      const scheduled = await Promise.resolve(this.callbacks.onJobFailure?.(job, error)).catch(() => false);
      if (!scheduled) { setJobStatus(job, error?.code === 'cancelled' ? 'cancelled' : 'failed'); job._reject(error); }
    }
    this.active = this.active.filter((entry) => entry.id !== job.id);
    await Promise.resolve(this.callbacks.onJobUpdate(job)).catch(() => {});
    this.start(queue, this.callbacks);
  }

  cancelCurrent(jobId) { const job = this.active.find((entry) => entry.id === jobId); if (job?.onCancel) job.onCancel(); }
}
export const jobWorkerPool = new JobWorkerPool();