import { AIProjectSession, immutable, type AIProjectSessionSnapshot, type CreateAIProjectSessionInput } from './AIProjectSession';
import { AIActionHistory, type AIActionRecord, type AssetVersionRecord, type ExperienceRecoveryRecord, type SessionPersistenceSnapshot } from './AIActionHistory';

export interface RestoreSessionInput { readonly tenantId: string; readonly userId: string; readonly projectId: string; }
export interface SessionDebugSnapshot {
  readonly project: AIProjectSessionSnapshot;
  readonly commands: readonly unknown[];
  readonly experiences: readonly ExperienceRecoveryRecord[];
  readonly workflows: readonly unknown[];
  readonly executions: readonly string[];
  readonly assets: readonly string[];
  readonly versions: readonly AssetVersionRecord[];
}

export class ProductSessionManager {
  private readonly sessions = new Map<string, AIProjectSession>();
  private readonly actionHistory: AIActionHistory;
  private readonly versions: AssetVersionRecord[] = [];
  private readonly experiences = new Map<string, ExperienceRecoveryRecord>();
  private readonly undoStacks = new Map<string, string[]>();
  private readonly redoStacks = new Map<string, string[]>();

  constructor(snapshot?: SessionPersistenceSnapshot) {
    this.actionHistory = new AIActionHistory(snapshot?.actions ?? []);
    for (const session of snapshot?.sessions ?? []) this.sessions.set(session.id, new AIProjectSession(session));
    this.versions.push(...(snapshot?.versions ?? []).map((version) => immutable(version)));
    for (const experience of snapshot?.experiences ?? []) this.experiences.set(experience.experienceId, immutable(experience));
    for (const [sessionId, stack] of snapshot?.undoStacks ?? []) this.undoStacks.set(sessionId, [...stack]);
    for (const [sessionId, stack] of snapshot?.redoStacks ?? []) this.redoStacks.set(sessionId, [...stack]);
  }

  create(input: CreateAIProjectSessionInput): AIProjectSessionSnapshot {
    this.assertUniqueActiveProject(input.tenantId, input.userId, input.projectId);
    const projectSession = new AIProjectSession(input);
    this.sessions.set(projectSession.inspect().id, projectSession);
    this.undoStacks.set(projectSession.inspect().id, []);
    this.redoStacks.set(projectSession.inspect().id, []);
    return projectSession.inspect();
  }

  restore(input: RestoreSessionInput): AIProjectSessionSnapshot | null {
    const found = [...this.sessions.values()].map((item) => item.inspect()).find((item) => item.tenantId === input.tenantId && item.userId === input.userId && item.projectId === input.projectId && item.status === 'ACTIVE');
    return found ? immutable(found) : null;
  }

  setExperience(sessionId: string, recovery: Omit<ExperienceRecoveryRecord, 'updatedAt'> & { readonly updatedAt?: string }): AIProjectSessionSnapshot {
    this.getSession(sessionId).setExperience(recovery.experienceId);
    this.experiences.set(recovery.experienceId, immutable({ ...recovery, updatedAt: recovery.updatedAt ?? new Date().toISOString() }));
    return this.inspect(sessionId);
  }

  recordAction(action: Omit<AIActionRecord, 'id' | 'timestamp'> & { readonly id?: string; readonly timestamp?: string }): AIActionRecord {
    this.ensureSession(action.sessionId);
    const stored = this.actionHistory.record(action);
    this.undoStacks.set(action.sessionId, [...(this.undoStacks.get(action.sessionId) ?? []), stored.id]);
    this.redoStacks.set(action.sessionId, []);
    return stored;
  }

  addVersion(version: AssetVersionRecord): AssetVersionRecord {
    const stored = immutable(version);
    this.versions.push(stored);
    return immutable(stored);
  }

  versionChain(assetId: string): readonly AssetVersionRecord[] {
    const byAsset = new Map(this.versions.map((version) => [version.assetId, version]));
    const chain: AssetVersionRecord[] = [];
    let current = byAsset.get(assetId);
    while (current) {
      chain.unshift(current);
      current = current.parentAssetId ? byAsset.get(current.parentAssetId) : undefined;
    }
    return immutable(chain);
  }

  undo(sessionId: string): AIActionRecord | null {
    this.ensureSession(sessionId);
    const undoStack = [...(this.undoStacks.get(sessionId) ?? [])];
    const actionId = undoStack.pop();
    if (!actionId) return null;
    this.undoStacks.set(sessionId, undoStack);
    this.redoStacks.set(sessionId, [...(this.redoStacks.get(sessionId) ?? []), actionId]);
    return this.findAction(sessionId, actionId);
  }

  redo(sessionId: string): AIActionRecord | null {
    this.ensureSession(sessionId);
    const redoStack = [...(this.redoStacks.get(sessionId) ?? [])];
    const actionId = redoStack.pop();
    if (!actionId) return null;
    this.redoStacks.set(sessionId, redoStack);
    this.undoStacks.set(sessionId, [...(this.undoStacks.get(sessionId) ?? []), actionId]);
    return this.findAction(sessionId, actionId);
  }

  history(sessionId: string): readonly AIActionRecord[] {
    this.ensureSession(sessionId);
    return this.actionHistory.forSession(sessionId);
  }

  inspect(sessionId: string): AIProjectSessionSnapshot { return this.getSession(sessionId).inspect(); }

  debug(sessionId: string): SessionDebugSnapshot {
    const project = this.inspect(sessionId);
    const actions = this.history(sessionId);
    const experiences = [...this.experiences.values()].filter((experience) => experience.experienceId === project.currentExperienceId);
    const assetIds = new Set<string>();
    for (const version of this.versions) {
      assetIds.add(version.assetId);
      if (version.parentAssetId) assetIds.add(version.parentAssetId);
    }
    return immutable({
      project,
      commands: actions.map((action) => action.command),
      experiences,
      workflows: actions.map((action) => action.workflow),
      executions: actions.map((action) => action.executionId),
      assets: [...assetIds],
      versions: this.versions,
    });
  }

  persist(): SessionPersistenceSnapshot {
    return immutable({
      sessions: [...this.sessions.values()].map((session) => session.inspect()),
      actions: this.actionHistory.all(),
      versions: this.versions,
      experiences: [...this.experiences.values()],
      undoStacks: [...this.undoStacks.entries()],
      redoStacks: [...this.redoStacks.entries()],
    });
  }

  private assertUniqueActiveProject(tenantId: string, userId: string, projectId: string): void {
    if (this.restore({ tenantId, userId, projectId })) throw new Error(`Active project session already exists for project: ${projectId}`);
  }

  private ensureSession(sessionId: string): void { this.getSession(sessionId); }
  private getSession(sessionId: string): AIProjectSession { const found = this.sessions.get(sessionId); if (!found) throw new Error(`AI project session not found: ${sessionId}`); return found; }
  private findAction(sessionId: string, actionId: string): AIActionRecord | null { return this.history(sessionId).find((action) => action.id === actionId) ?? null; }
}
