export interface WorkflowExperimentMetrics { readonly impressions?: number; readonly conversions?: number; readonly successRate?: number; readonly averageCost?: number; readonly quality?: number; }
export interface WorkflowExperimentDefinition { readonly experimentId: string; readonly workflowA: string; readonly workflowB: string; readonly allocation: number; readonly metrics: WorkflowExperimentMetrics; readonly status?: 'draft' | 'running' | 'paused' | 'completed'; }

export class WorkflowExperiment {
  private experiments = new Map<string, WorkflowExperimentDefinition>();

  register(definition: WorkflowExperimentDefinition): WorkflowExperimentDefinition {
    const normalized = Object.freeze({ ...definition, allocation: Math.max(0, Math.min(1, definition.allocation)), status: definition.status || 'draft' });
    this.experiments.set(definition.experimentId, normalized);
    return normalized;
  }

  assign(experimentId: string, subjectId: string): string | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;
    const bucket = Math.abs([...subjectId].reduce((hash, char) => ((hash << 5) - hash + char.charCodeAt(0)) | 0, 0) % 100) / 100;
    return bucket < experiment.allocation ? experiment.workflowB : experiment.workflowA;
  }

  get(experimentId: string): WorkflowExperimentDefinition | null { return this.experiments.get(experimentId) ?? null; }
}
