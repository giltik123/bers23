class JobRetryManager {
  constructor(maxRetries = 2) { this.maxRetries = maxRetries; }
  isRetryable(error) {
    if (error?.code === 'cancelled') return false;
    const message = (error?.message || '').toLowerCase();
    return !message.includes('validation') && !message.includes('rejected') && !message.includes('unauthorized');
  }
  canRetry(job, error) { return this.isRetryable(error) && job.retry_count < this.maxRetries; }
  delay(job) { return Math.min(30000, 1000 * 2 ** job.retry_count); }
}
export const jobRetryManager = new JobRetryManager();