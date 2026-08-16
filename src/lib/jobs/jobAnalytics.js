import { coreClient } from '@/api/coreClient';

class JobAnalytics {
  constructor() { this.completed = []; this.failures = 0; this.retries = 0; this.queueLengths = []; }
  record(event, job, queueLength = null) {
    if (event === 'completed') this.completed.push({ provider: job.provider, duration: job.completed_at - job.started_at, wait: job.started_at - job.created_at });
    if (event === 'failed') this.failures += 1;
    if (event === 'retried') this.retries += 1;
    if (queueLength !== null) this.queueLengths.push(queueLength);
    coreClient.analytics.track({ eventName: `job_${event}`, properties: { type: job.type, provider: job.provider || 'unknown', retry_count: job.retry_count || 0, duration_ms: event === 'completed' ? job.completed_at - job.started_at : null } });
  }
  snapshot() {
    const average = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
    const providerTotals = this.completed.reduce((all, item) => { const current = all[item.provider] || { duration: 0, jobs: 0 }; all[item.provider] = { duration: current.duration + item.duration, jobs: current.jobs + 1 }; return all; }, {});
    const providerPerformance = Object.fromEntries(Object.entries(providerTotals).map(([provider, data]) => [provider, { averageExecutionTime: Math.round(data.duration / data.jobs), jobs: data.jobs }]));
    return { averageExecutionTime: average(this.completed.map((item) => item.duration)), averageWaitingTime: average(this.completed.map((item) => item.wait)), providerPerformance, failureRate: this.completed.length + this.failures ? this.failures / (this.completed.length + this.failures) : 0, retryRate: this.completed.length ? this.retries / this.completed.length : 0, averageQueueLength: average(this.queueLengths) };
  }
}
export const jobAnalytics = new JobAnalytics();