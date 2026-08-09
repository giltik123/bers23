import { immutable } from './immutable';
import type { CognitiveBudgetAllocation, CreativeSession, IntelligenceMetrics, IntelligenceState, KernelDependencies, KernelScope, TimelineEvent } from './types';

const zeroMetrics: IntelligenceMetrics = immutable({ reasoning: 0, memory: 0, planning: 0, debate: 0, learning: 0, reflection: 0, simulation: 0, director: 0, decision: 0, meta: 0 });
export class IntelligenceSessionManager {
  private readonly sessions = new Map<string, CreativeSession>();
  constructor(private readonly dependencies: KernelDependencies) {}
  create(scope: KernelScope, objective: string, workspace: Readonly<Record<string, unknown>>, budget: CognitiveBudgetAllocation): CreativeSession { if (!objective.trim()) throw new Error('Session objective is required'); const at = this.dependencies.now(); const session = immutable({ ...scope, id: this.dependencies.nextId(), objective, workspace: structuredClone(workspace), timeline: [], state: 'IDLE' as const, metrics: zeroMetrics, budget, createdAt: at, updatedAt: at }); this.sessions.set(session.id, session); return session; }
  update(session: CreativeSession, patch: { timeline?: readonly TimelineEvent[]; state?: IntelligenceState; metrics?: IntelligenceMetrics; budget?: CognitiveBudgetAllocation }): CreativeSession { this.assertScope(session.id, session); const next = immutable({ ...session, ...patch, updatedAt: this.dependencies.now() }); this.sessions.set(session.id, next); return next; }
  get(id: string, scope: KernelScope): CreativeSession { this.assertScope(id, scope); return immutable(structuredClone(this.sessions.get(id)!)); }
  private assertScope(id: string, scope: KernelScope) { const session = this.sessions.get(id); if (!session) throw new Error(`Unknown intelligence session ${id}`); if (session.tenantId !== scope.tenantId || session.projectId !== scope.projectId || session.userId !== scope.userId) throw new Error('Intelligence session scope violation'); }
}
