class JobEvents {
  constructor() { this.listeners = new Set(); }
  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  emit(type, job) { this.listeners.forEach((listener) => listener({ type, job: { ...job }, at: Date.now() })); }
}
export const jobEvents = new JobEvents();
export const JOB_EVENTS = { CREATED: 'JobCreated', STARTED: 'JobStarted', PROGRESS: 'ProgressChanged', COMPLETED: 'JobCompleted', FAILED: 'JobFailed', CANCELLED: 'JobCancelled', RETRIED: 'JobRetried' };