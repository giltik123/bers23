import { JOB_PRIORITIES } from '@/lib/jobs/jobModel';

class JobPriorityManager {
  rank(priority) { return JOB_PRIORITIES[priority] ?? JOB_PRIORITIES.normal; }
  normalize(priority) { return Object.hasOwn(JOB_PRIORITIES, priority) ? priority : 'normal'; }
  sort(jobs) { return [...jobs].sort((a, b) => this.rank(a.priority) - this.rank(b.priority) || a.created_at - b.created_at); }
}
export const jobPriorityManager = new JobPriorityManager();