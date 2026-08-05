import { immutable } from './AIProjectSession';

export interface AIActionRecord {
  readonly id: string;
  readonly sessionId: string;
  readonly command: unknown;
  readonly workflow: unknown;
  readonly executionId: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly timestamp: string;
}

export interface AssetVersionRecord {
  readonly assetId: string;
  readonly parentAssetId: string | null;
  readonly operation: string;
  readonly createdAt: string;
}

export interface ExperienceRecoveryRecord {
  readonly experienceId: string;
  readonly state: unknown;
  readonly pendingDecisions: readonly unknown[];
  readonly executionReference: unknown;
  readonly updatedAt: string;
}

export interface SessionPersistenceSnapshot {
  readonly sessions: readonly import('./AIProjectSession').AIProjectSessionSnapshot[];
  readonly actions: readonly AIActionRecord[];
  readonly versions: readonly AssetVersionRecord[];
  readonly experiences: readonly ExperienceRecoveryRecord[];
  readonly undoStacks: readonly [string, readonly string[]][];
  readonly redoStacks: readonly [string, readonly string[]][];
}

export const createActionId = () => `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export class AIActionHistory {
  private readonly actions: AIActionRecord[];

  constructor(actions: readonly AIActionRecord[] = []) {
    this.actions = actions.map((action) => immutable(action));
  }

  record(action: Omit<AIActionRecord, 'id' | 'timestamp'> & { readonly id?: string; readonly timestamp?: string }): AIActionRecord {
    const stored = immutable({ ...action, id: action.id ?? createActionId(), timestamp: action.timestamp ?? new Date().toISOString() });
    this.actions.push(stored);
    return immutable(stored);
  }

  forSession(sessionId: string): readonly AIActionRecord[] {
    return immutable(this.actions.filter((action) => action.sessionId === sessionId));
  }

  all(): readonly AIActionRecord[] { return immutable(this.actions); }
}
