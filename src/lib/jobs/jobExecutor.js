class JobExecutor {
  async execute(job, reportProgress) {
    if (!job.run) throw new Error(`No executor registered for ${job.type}`);
    return job.run({ job, reportProgress });
  }
}
export const jobExecutor = new JobExecutor();