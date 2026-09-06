class JobScheduler {
  schedule() {
    throw Object.assign(new Error('Generic JobManager retry scheduling is disabled; the owning adapter must define retry semantics'), {
      code: 'job_retry_scheduling_disabled',
    });
  }
  cancel() { return false; }
}

export const jobScheduler = Object.freeze(new JobScheduler());
