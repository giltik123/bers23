class JobRetryManager {
  isRetryable() { return false; }
  canRetry() { return false; }
  delay() {
    throw Object.assign(new Error('Generic JobManager automatic retry is disabled; the owning adapter must define retry semantics'), {
      code: 'job_retry_disabled',
    });
  }
}

export const jobRetryManager = Object.freeze(new JobRetryManager());
