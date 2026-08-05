export interface WorkflowVersion { readonly workflowId: string; readonly version: string; readonly createdAt: number; readonly parentVersion?: string; readonly changeReason: string; readonly metadata?: Record<string, unknown>; }

export class WorkflowVersioning {
  private versions = new Map<string, WorkflowVersion[]>();

  create(workflowId: string, version: string, changeReason: string, options: { readonly parentVersion?: string; readonly metadata?: Record<string, unknown>; readonly createdAt?: number } = {}): WorkflowVersion {
    const record = Object.freeze({ workflowId, version, createdAt: options.createdAt ?? Date.now(), parentVersion: options.parentVersion, changeReason, metadata: Object.freeze({ ...(options.metadata || {}) }) });
    this.versions.set(workflowId, [...(this.versions.get(workflowId) || []), record]);
    return record;
  }

  lineage(workflowId: string): WorkflowVersion[] { return [...(this.versions.get(workflowId) || [])].sort((left, right) => left.createdAt - right.createdAt); }
  latest(workflowId: string): WorkflowVersion | null { return this.lineage(workflowId).at(-1) ?? null; }
}
