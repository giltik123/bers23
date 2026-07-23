import { base44 } from '@/api/base44Client';
import { createJob, setJobStatus, updateJobProgress } from '@/lib/jobs/jobModel';
import { jobQueue } from '@/lib/jobs/jobQueue';
import { jobWorkerPool } from '@/lib/jobs/jobWorker';
import { notificationCenter } from '@/lib/notifications/notificationCenter';
import { jobScheduler } from '@/lib/jobs/jobScheduler';
import { jobRetryManager } from '@/lib/jobs/jobRetryManager';
import { jobStorage } from '@/lib/jobs/jobStorage';
import { jobHistory } from '@/lib/jobs/jobHistory';
import { jobEvents, JOB_EVENTS } from '@/lib/jobs/jobEvents';
import { jobAnalytics } from '@/lib/jobs/jobAnalytics';
import { subscriptionValidator } from '@/lib/subscriptions/subscriptionValidator';
import { subscriptionUsage } from '@/lib/subscriptions/subscriptionUsage';
import { FEATURES } from '@/lib/subscriptions/subscriptionPolicy';

class JobManager {
  constructor() { this.listeners = new Set(); this.recent = []; this.jobs = new Map(); this.paused = false; }
  subscribe(fn) { this.listeners.add(fn); fn(this.snapshot()); return () => this.listeners.delete(fn); }
  _notify() { const state = this.snapshot(); this.listeners.forEach((fn) => fn(state)); }
  snapshot() { return { running: jobWorkerPool.active.map((job) => ({ ...job })), queued: jobQueue.list().map((job) => ({ ...job })), recent: this.recent.slice(0, 20), paused: this.paused }; }
  _feature(type) { return type === 'chain' ? FEATURES.RECIPE_CHAINS : FEATURES.AI_EDITING; }
  _persist(job) { return jobStorage.save(job).catch(() => null); }
  _remember(job) { this.jobs.set(job.id, job); if (['completed', 'failed', 'cancelled'].includes(job.status)) this.recent = [{ ...job }, ...this.recent.filter((item) => item.id !== job.id)].slice(0, 20); }
  _emit(type, job) { jobEvents.emit(type, job); }

  async submit({ type, label, priority, projectId, run, onCancel, notifyOnComplete = false, provider = 'unknown', estimatedTime = 30000, creditsReserved = 0, payload = {}, metadata = {} }) {
    const feature = this._feature(type); await subscriptionValidator.validateOperation({ feature });
    await subscriptionValidator.validateQueue(jobQueue.size + jobWorkerPool.active.length);
    const user = await base44.auth.me();
    const job = createJob({ type, label, priority, projectId, userId: user.id, provider, estimatedTime, creditsReserved, payload, metadata: { ...metadata, feature }, run, onCancel });
    job.notifyOnComplete = notifyOnComplete;
    const promise = new Promise((resolve, reject) => { job._resolve = resolve; job._reject = reject; });
    this.jobs.set(job.id, job); await jobStorage.save(job); jobQueue.enqueue(job);
    this._emit(JOB_EVENTS.CREATED, job); jobAnalytics.record('created', job, jobQueue.size); this._notify(); this._kick(); return promise;
  }

  _kick() {
    jobWorkerPool.start(jobQueue, { isPaused: () => this.paused, onJobUpdate: (job) => this._onJobUpdate(job), onJobFailure: (job, error) => this._onJobFailure(job, error) });
  }

  async _onJobUpdate(job) {
    if (job.status === 'running' && !job.startedEmitted) { job.startedEmitted = true; this._emit(JOB_EVENTS.STARTED, job); jobAnalytics.record('started', job); }
    if (job.progress !== job.lastReportedProgress) { job.lastReportedProgress = job.progress; this._emit(JOB_EVENTS.PROGRESS, job); }
    if (job.status === 'completed' && !job.completedRecorded) {
      job.completedRecorded = true; const historyEntry = jobHistory.record(job); job.metadata = { ...job.metadata, historyEntry, versionSnapshot: historyEntry.versionSnapshot }; this._emit(JOB_EVENTS.COMPLETED, job); jobAnalytics.record('completed', job, jobQueue.size);
      await subscriptionUsage.track({ aiGenerations: job.type === 'edit' ? 1 : 0, recipes: job.type === 'chain' ? 1 : 0, credits: job.creditsConsumed || 0, feature: job.metadata.feature });
      if (job.notifyOnComplete) notificationCenter.push({ title: 'Generation complete', message: `${job.label} has been added to history.`, type: 'success', jobId: job.id, projectId: job.projectId }).catch(() => {});
    }
    if (job.status === 'failed' && !job.failedRecorded) { job.failedRecorded = true; this._emit(JOB_EVENTS.FAILED, job); jobAnalytics.record('failed', job); notificationCenter.push({ title: 'Generation failed', message: job.error || job.label, type: 'error', jobId: job.id, projectId: job.projectId }).catch(() => {}); }
    if (job.status === 'cancelled' && !job.cancelledRecorded) { job.cancelledRecorded = true; this._emit(JOB_EVENTS.CANCELLED, job); jobAnalytics.record('cancelled', job); }
    this._remember(job); await this._persist(job); this._notify();
  }

  async _onJobFailure(job, error) {
    if (!jobRetryManager.canRetry(job, error)) return false;
    job.retryCount += 1; job.retry_count += 1; setJobStatus(job, 'retrying');
    this._emit(JOB_EVENTS.RETRIED, job); jobAnalytics.record('retried', job); await this._persist(job); this._notify();
    jobScheduler.schedule(job, jobRetryManager.delay(job), (scheduledJob) => { setJobStatus(scheduledJob, 'queued'); jobQueue.enqueue(scheduledJob); this._emit(JOB_EVENTS.RETRIED, scheduledJob); this._persist(scheduledJob); this._notify(); this._kick(); });
    return true;
  }

  updateProgress(jobId, progress, stage) { const job = this.jobs.get(jobId); if (!job) return; updateJobProgress(job, progress, stage); this._onJobUpdate(job); }
  markWaiting(jobId) { const job = this.jobs.get(jobId); if (!job) return; setJobStatus(job, 'waiting'); this._onJobUpdate(job); }
  pause() { this.paused = true; this._notify(); }
  resume() { this.paused = false; this._notify(); this._kick(); }
  reorder(jobId, index) { const job = jobQueue.reorder(jobId, index); if (job) { this._persist(job); this._notify(); } return job; }

  cancel(jobId) {
    const queued = jobQueue.remove(jobId); jobScheduler.cancel(jobId);
    if (queued) { setJobStatus(queued, 'cancelled'); queued._reject(Object.assign(new Error('Job cancelled'), { code: 'cancelled' })); this._onJobUpdate(queued); return; }
    jobWorkerPool.cancelCurrent(jobId);
  }

  duplicate(jobId) {
    const job = this.jobs.get(jobId); if (!job) return Promise.reject(new Error('Job not found'));
    return this.submit({ type: job.type, label: job.label, priority: job.priority, projectId: job.projectId, run: job.run, onCancel: job.onCancel, notifyOnComplete: job.notifyOnComplete, provider: job.provider, estimatedTime: job.estimatedTime, creditsReserved: job.creditsReserved, payload: job.payload, metadata: job.metadata });
  }
  retry(jobId) { return this.duplicate(jobId); }
}

export const jobManager = new JobManager();