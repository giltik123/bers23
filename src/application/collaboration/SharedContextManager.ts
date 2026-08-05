import { CollaborationHistory } from './CollaborationHistory';

export type SharedRecord = Readonly<{ readonly id: string; readonly actorId: string; readonly at: number; readonly value: unknown }>;

export interface SharedContextSnapshot {
  readonly workflowHistory: readonly SharedRecord[];
  readonly assets: readonly SharedRecord[];
  readonly decisions: readonly SharedRecord[];
  readonly activity: readonly unknown[];
}

function freezeValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(freezeValue)) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, freezeValue(item)]))) as T;
}

export class SharedContextManager {
  private contexts = new Map<string, { workflowHistory: SharedRecord[]; assets: SharedRecord[]; decisions: SharedRecord[] }>();
  private sequence = 0;
  constructor(private readonly history: CollaborationHistory, private readonly clock: () => number = Date.now) {}

  shareWorkflow(tenantId: string, projectId: string, actorId: string, workflow: unknown): SharedRecord {
    return this.addRecord(tenantId, projectId, actorId, 'workflowHistory', 'workflow.shared', workflow);
  }

  shareAsset(tenantId: string, projectId: string, actorId: string, asset: unknown): SharedRecord {
    return this.addRecord(tenantId, projectId, actorId, 'assets', 'asset.shared', asset);
  }

  createDecision(tenantId: string, projectId: string, actorId: string, decision: unknown): SharedRecord {
    return this.addRecord(tenantId, projectId, actorId, 'decisions', 'decision.created', { ...this.asObject(decision), approved: false });
  }

  approveDecision(tenantId: string, projectId: string, actorId: string, decisionId: string): SharedRecord {
    const context = this.ensure(tenantId, projectId);
    const existing = context.decisions.find((decision) => decision.id === decisionId);
    if (!existing) throw new Error('Decision not found');
    const approved = Object.freeze({ id: existing.id, actorId, at: this.clock(), value: freezeValue({ ...this.asObject(existing.value), approved: true, approvedBy: actorId }) });
    context.decisions = context.decisions.map((decision) => (decision.id === decisionId ? approved : decision));
    this.history.record({ tenantId, projectId, type: 'decision.approved', actorId, snapshot: approved });
    return approved;
  }

  inspect(tenantId: string, projectId: string): SharedContextSnapshot {
    const context = this.ensure(tenantId, projectId);
    return Object.freeze({ workflowHistory: Object.freeze([...context.workflowHistory]), assets: Object.freeze([...context.assets]), decisions: Object.freeze([...context.decisions]), activity: this.history.list(tenantId, projectId) });
  }

  private addRecord(tenantId: string, projectId: string, actorId: string, bucket: 'workflowHistory' | 'assets' | 'decisions', type: 'workflow.shared' | 'asset.shared' | 'decision.created', value: unknown): SharedRecord {
    const context = this.ensure(tenantId, projectId);
    const record = Object.freeze({ id: `shared-${++this.sequence}`, actorId, at: this.clock(), value: freezeValue(value) });
    context[bucket].push(record);
    this.history.record({ tenantId, projectId, type, actorId, snapshot: record });
    return record;
  }

  private ensure(tenantId: string, projectId: string) {
    const key = `${tenantId}:${projectId}`;
    if (!this.contexts.has(key)) this.contexts.set(key, { workflowHistory: [], assets: [], decisions: [] });
    return this.contexts.get(key)!;
  }

  private asObject(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : { value }; }
}
