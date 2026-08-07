import { immutable, rounded } from './immutable';
import type { BlackboardSnapshot, CreativeSession, IntelligenceHealth, IntelligenceMetrics, KernelDependencies, KernelMessage, KernelScope, KernelSnapshot, ReplayFrame, StateTransition } from './types';

export class IntelligenceHealthMonitor {
  evaluate(metrics: IntelligenceMetrics): IntelligenceHealth { const values = Object.values(metrics); const overall = rounded(values.reduce((sum, value) => sum + value, 0) / values.length); return immutable({ dimensions: structuredClone(metrics), overall, status: overall >= .7 ? 'HEALTHY' : overall >= .4 ? 'WATCH' : 'CRITICAL' }); }
}
export class SnapshotEngine {
  private readonly snapshots = new Map<string, KernelSnapshot[]>();
  constructor(private readonly dependencies: KernelDependencies) {}
  capture(session: CreativeSession, blackboard: BlackboardSnapshot, messages: readonly KernelMessage[], stateTransitions: readonly StateTransition[]): KernelSnapshot { const history = this.snapshots.get(session.id) ?? []; const snapshot = immutable({ tenantId: session.tenantId, projectId: session.projectId, userId: session.userId, id: this.dependencies.nextId(), sessionId: session.id, sequence: history.length, session: structuredClone(session), blackboard: structuredClone(blackboard), messages: structuredClone(messages), stateTransitions: structuredClone(stateTransitions), createdAt: this.dependencies.now() }); this.snapshots.set(session.id, [...history, snapshot]); return snapshot; }
  restore(sessionId: string, sequence: number, scope: KernelScope): KernelSnapshot { const snapshot = this.snapshots.get(sessionId)?.find((item) => item.sequence === sequence); if (!snapshot) throw new Error(`Unknown kernel snapshot ${sequence}`); this.assertScope(snapshot, scope); return immutable(structuredClone(snapshot)); }
  history(sessionId: string, scope: KernelScope): readonly KernelSnapshot[] { const snapshots = this.snapshots.get(sessionId) ?? []; if (snapshots.length) this.assertScope(snapshots[0], scope); return immutable(structuredClone(snapshots)); }
  private assertScope(value: KernelScope, scope: KernelScope) { if (value.tenantId !== scope.tenantId || value.projectId !== scope.projectId || value.userId !== scope.userId) throw new Error('Kernel snapshot scope violation'); }
}
export class ReplayKernel {
  frames(snapshot: KernelSnapshot, scope: KernelScope): readonly ReplayFrame[] { if (snapshot.tenantId !== scope.tenantId || snapshot.projectId !== scope.projectId || snapshot.userId !== scope.userId) throw new Error('Kernel replay scope violation'); const frames: ReplayFrame[] = []; snapshot.messages.forEach((message) => frames.push({ sequence: 0, message })); snapshot.blackboard.entries.forEach((blackboard) => frames.push({ sequence: 0, blackboard })); snapshot.session.timeline.forEach((event) => frames.push({ sequence: 0, event })); snapshot.stateTransitions.forEach((state) => frames.push({ sequence: 0, state })); frames.push({ sequence: 0, snapshotId: snapshot.id }); return immutable(frames.map((frame, sequence) => ({ ...frame, sequence }))); }
}
