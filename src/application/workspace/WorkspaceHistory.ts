import { immutable } from './AIWorkspace';

export type WorkspaceEventType = 'workspace.created' | 'asset.added' | 'experience.started' | 'workflow.executed' | 'execution.completed' | 'workspace.archived' | 'workspace.restored' | 'workspace.opened' | 'workspace.closed' | 'workspace.recovered';

export interface WorkspaceHistoryEvent {
  readonly id: string;
  readonly workspaceId: string;
  readonly type: WorkspaceEventType;
  readonly at: string;
  readonly payload: Readonly<Record<string, unknown>>;
}

export class WorkspaceHistory {
  readonly #events = new Map<string, WorkspaceHistoryEvent[]>();

  record(workspaceId: string, type: WorkspaceEventType, payload: Readonly<Record<string, unknown>> = {}): WorkspaceHistoryEvent {
    const event = immutable({ id: `event_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, workspaceId, type, at: new Date().toISOString(), payload: { ...payload } });
    this.#events.set(workspaceId, [...(this.#events.get(workspaceId) || []), event]);
    return event;
  }

  list(workspaceId: string): readonly WorkspaceHistoryEvent[] {
    return immutable([...(this.#events.get(workspaceId) || [])]);
  }
}
