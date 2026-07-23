// Job Model — the unit of work flowing through the queue system.
export const JOB_PRIORITIES = { high: 0, normal: 1, low: 2 };
export const JOB_TYPES = { IMAGE_EDITING: 'image_editing', VIRTUAL_TRYON: 'virtual_tryon', SEGMENTATION: 'segmentation', RECIPE_CHAIN: 'recipe_chain', AI_AGENT_CHAIN: 'ai_agent_chain', BATCH_EDITING: 'batch_editing', UPSCALING: 'upscaling' };
export const JOB_STATUSES = { QUEUED: 'queued', PREPARING: 'preparing', RUNNING: 'running', WAITING: 'waiting', COMPLETED: 'completed', CANCELLED: 'cancelled', FAILED: 'failed', RETRYING: 'retrying' };

export const priorityLabel = (p) => ({ high: 'High', normal: 'Normal', low: 'Low' }[p] || p);

export const createJob = ({ type, label, priority = 'normal', projectId = null, userId = null, provider = 'unknown', estimatedTime = 30000, creditsReserved = 0, payload = {}, metadata = {}, run, onCancel = null }) => {
  const createdAt = Date.now();
  return { id: `job_${createdAt.toString(36)}_${Math.random().toString(36).slice(2, 6)}`, type, label, priority, projectId, userId, provider, run, onCancel, status: 'queued', progress: 0, estimatedTime, creditsReserved, creditsConsumed: 0, createdAt, startedAt: null, completedAt: null, failedAt: null, retryCount: 0, payload, result: null, error: null, metadata, created_at: createdAt, started_at: null, completed_at: null, failed_at: null, retry_count: 0, finished_at: null };
};

export const setJobStatus = (job, status) => {
  const now = Date.now(); job.status = status;
  if (status === 'running') { job.startedAt = now; job.started_at = now; }
  if (status === 'completed') { job.completedAt = now; job.completed_at = now; job.finished_at = now; job.progress = 100; }
  if (status === 'failed') { job.failedAt = now; job.failed_at = now; job.finished_at = now; }
  if (status === 'cancelled') job.finished_at = now;
};

export const updateJobProgress = (job, progress, stage = null) => { job.progress = Math.max(0, Math.min(100, Math.round(progress))); job.metadata = { ...job.metadata, currentStage: stage || job.metadata?.currentStage }; };