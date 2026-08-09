import { immutable } from './immutable';
import type { CognitiveScope } from './types';
import type { V2Dependencies, WorkspaceData, WorkspaceDiff, WorkspaceSnapshot } from './v2-types';

const keys = Object.freeze(['goals', 'intentSpace', 'thoughts', 'evidence', 'hypotheses', 'attention', 'workingThoughtIds', 'openQuestions', 'unknowns', 'contradictionIds', 'experiments', 'insights', 'plans', 'decisionCandidates'] as const);
const scoped = (a: CognitiveScope, b: CognitiveScope) => a.tenantId === b.tenantId && a.projectId === b.projectId && a.userId === b.userId;

export class CognitiveWorkspace {
  private readonly revisions = new Map<string, readonly WorkspaceSnapshot[]>();
  constructor(private readonly dependencies: V2Dependencies) {}

  create(scope: CognitiveScope, data: WorkspaceData): WorkspaceSnapshot {
    const snapshot = immutable({ ...scope, id: this.dependencies.nextId(), revision: 0, createdAt: this.dependencies.now(), data: structuredClone(data) });
    this.revisions.set(snapshot.id, immutable([snapshot]));
    return snapshot;
  }
  revise(snapshot: WorkspaceSnapshot, scope: CognitiveScope, patch: Partial<WorkspaceData>): WorkspaceSnapshot {
    this.assertScope(snapshot, scope); const history = this.requireHistory(snapshot.id); const latest = history.at(-1)!;
    if (latest.revision !== snapshot.revision) throw new Error('Workspace revision conflict');
    const next = immutable({ ...scope, id: snapshot.id, revision: snapshot.revision + 1, createdAt: this.dependencies.now(), data: { ...structuredClone(snapshot.data), ...structuredClone(patch) } });
    this.revisions.set(snapshot.id, immutable([...history, next])); return next;
  }
  snapshot(id: string, revision: number, scope: CognitiveScope): WorkspaceSnapshot { const item = this.requireHistory(id).find((entry) => entry.revision === revision); if (!item) throw new Error(`Unknown workspace revision ${revision}`); this.assertScope(item, scope); return immutable(structuredClone(item)); }
  replay(id: string, scope: CognitiveScope): readonly WorkspaceSnapshot[] { const history = this.requireHistory(id); this.assertScope(history[0], scope); return immutable(structuredClone(history)); }
  diff(left: WorkspaceSnapshot, right: WorkspaceSnapshot, scope: CognitiveScope): WorkspaceDiff { this.assertScope(left, scope); this.assertScope(right, scope); if (left.id !== right.id) throw new Error('Cannot diff different workspaces'); const changed = keys.filter((key) => JSON.stringify(left.data[key]) !== JSON.stringify(right.data[key])); return immutable({ fromRevision: left.revision, toRevision: right.revision, changed }); }
  private requireHistory(id: string) { const history = this.revisions.get(id); if (!history) throw new Error(`Unknown workspace ${id}`); return history; }
  private assertScope(value: CognitiveScope, scope: CognitiveScope) { if (!scoped(value, scope)) throw new Error('Cognitive workspace scope violation'); }
}
