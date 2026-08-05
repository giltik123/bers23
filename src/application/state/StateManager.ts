import {
  assertApplicationStateAccess,
  createApplicationStateId,
  createDecisionId,
  immutable,
  type AIApplicationState,
  type AIApplicationStateStatus,
  type ApplicationDecision,
  type ApplicationProgress,
  type ApplicationSecurityScope,
  type CreateApplicationStateInput,
  type UpdateApplicationStateInput,
} from './AIApplicationState';
import { ApplicationTimeline } from './ApplicationTimeline';
import { StateTransitionEngine } from './StateTransitionEngine';

export interface ApplicationSnapshot {
  readonly state: AIApplicationState;
  readonly workspace: Readonly<{ id: string | null }>;
  readonly session: Readonly<{ id: string | null }>;
  readonly experience: Readonly<{ id: string | null }>;
  readonly command: Readonly<{ id: string | null }>;
  readonly workflow: Readonly<{ id: string | null }>;
  readonly execution: Readonly<{ id: string | null }>;
  readonly assets: readonly string[];
  readonly decisions: readonly ApplicationDecision[];
  readonly progress: ApplicationProgress;
  readonly timeline: ReturnType<ApplicationTimeline['list']>;
  readonly createdAt: string;
}

export interface ApplicationDebugTree {
  readonly applicationState: AIApplicationState;
  readonly user: Readonly<{ id: string }>;
  readonly project: Readonly<{ id: string }>;
  readonly workspace: Readonly<{ id: string | null }>;
  readonly session: Readonly<{ id: string | null }>;
  readonly command: Readonly<{ id: string | null }>;
  readonly experience: Readonly<{ id: string | null }>;
  readonly workflow: Readonly<{ id: string | null }>;
  readonly execution: Readonly<{ id: string | null }>;
  readonly assets: readonly string[];
  readonly decisions: readonly ApplicationDecision[];
  readonly timeline: ReturnType<ApplicationTimeline['list']>;
}

export class StateManager {
  readonly #states = new Map<string, AIApplicationState>();
  readonly #snapshots = new Map<string, ApplicationSnapshot>();
  readonly #timeline = new ApplicationTimeline();
  readonly #transitions = new StateTransitionEngine();

  create(input: CreateApplicationStateInput): AIApplicationState {
    const now = this.#now();
    const state = immutable({
      id: input.id || createApplicationStateId(),
      userId: input.userId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      workspaceId: input.workspaceId || null,
      sessionId: input.sessionId || null,
      experienceId: input.experienceId || null,
      currentCommand: null,
      currentWorkflow: null,
      currentExecution: null,
      activeAssets: [],
      pendingDecisions: [],
      progress: { step: 'initializing', percent: 0 },
      notifications: [],
      status: 'INITIALIZING' as const,
      createdAt: now,
      updatedAt: now,
    });

    this.#states.set(state.id, state);
    this.#timeline.record(state.id, 'state.created', {
      userId: state.userId,
      tenantId: state.tenantId,
      projectId: state.projectId,
      workspaceId: state.workspaceId,
    });

    return state;
  }

  load(id: string, scope: ApplicationSecurityScope): AIApplicationState {
    return this.#secure(id, scope);
  }

  update(id: string, update: UpdateApplicationStateInput, scope: ApplicationSecurityScope): AIApplicationState {
    const state = this.#secure(id, scope);
    const nextState = this.#replace({
      ...state,
      ...update,
      activeAssets: update.activeAssets ? [...update.activeAssets] : state.activeAssets,
      progress: update.progress ? { ...state.progress, ...update.progress } : state.progress,
      notifications: update.notifications ? [...update.notifications] : state.notifications,
      updatedAt: this.#now(),
    });

    this.#recordUpdateEvents(state, nextState);
    return nextState;
  }

  transition(id: string, status: AIApplicationStateStatus, scope: ApplicationSecurityScope): AIApplicationState {
    const state = this.#secure(id, scope);
    this.#transitions.assertTransition(state.status, status);

    const nextState = this.#replace({ ...state, status, updatedAt: this.#now() });
    this.#timeline.record(id, status === 'FAILED' ? 'state.failed' : 'state.transitioned', {
      from: state.status,
      to: status,
    });

    return nextState;
  }

  inspect(id: string, scope: ApplicationSecurityScope): AIApplicationState {
    return this.#secure(id, scope);
  }

  debug(id: string, scope: ApplicationSecurityScope): ApplicationDebugTree {
    const state = this.#secure(id, scope);

    return immutable({
      applicationState: state,
      user: { id: state.userId },
      project: { id: state.projectId },
      workspace: { id: state.workspaceId },
      session: { id: state.sessionId },
      command: { id: state.currentCommand },
      experience: { id: state.experienceId },
      workflow: { id: state.currentWorkflow },
      execution: { id: state.currentExecution },
      assets: [...state.activeAssets],
      decisions: [...state.pendingDecisions],
      timeline: this.#timeline.list(id),
    });
  }

  snapshot(id: string, scope: ApplicationSecurityScope): ApplicationSnapshot {
    const state = this.#secure(id, scope);
    const snapshot = immutable({
      state,
      workspace: { id: state.workspaceId },
      session: { id: state.sessionId },
      experience: { id: state.experienceId },
      command: { id: state.currentCommand },
      workflow: { id: state.currentWorkflow },
      execution: { id: state.currentExecution },
      assets: [...state.activeAssets],
      decisions: [...state.pendingDecisions],
      progress: { ...state.progress },
      timeline: this.#timeline.list(id),
      createdAt: this.#now(),
    });

    this.#snapshots.set(id, snapshot);
    return snapshot;
  }

  restore(id: string, scope: ApplicationSecurityScope): AIApplicationState {
    return this.#restoreSnapshot(id, scope, 'state.restored');
  }

  recover(id: string, scope: ApplicationSecurityScope): AIApplicationState {
    return this.#restoreSnapshot(id, scope, 'state.recovered');
  }

  requestDecision(
    id: string,
    reason: string,
    scope: ApplicationSecurityScope,
    metadata: Readonly<Record<string, unknown>> = {},
  ): ApplicationDecision {
    const state = this.#secure(id, scope);
    const now = this.#now();
    const decision = immutable({
      id: createDecisionId(),
      reason,
      status: 'pending' as const,
      requestedAt: now,
      resolvedAt: null,
      metadata: { ...metadata },
    });

    this.#replace({
      ...state,
      pendingDecisions: [...state.pendingDecisions, decision],
      status: state.status === 'PROCESSING' ? 'WAITING_USER' : state.status,
      updatedAt: now,
    });
    this.#timeline.record(id, 'decision.requested', { decisionId: decision.id, reason });

    return decision;
  }

  approveDecision(id: string, decisionId: string, scope: ApplicationSecurityScope): ApplicationDecision {
    return this.#completeDecision(id, decisionId, scope, 'approved');
  }

  rejectDecision(id: string, decisionId: string, scope: ApplicationSecurityScope): ApplicationDecision {
    return this.#completeDecision(id, decisionId, scope, 'rejected');
  }

  expireDecision(id: string, decisionId: string, scope: ApplicationSecurityScope): ApplicationDecision {
    return this.#completeDecision(id, decisionId, scope, 'expired');
  }

  listPending(id: string, scope: ApplicationSecurityScope): readonly ApplicationDecision[] {
    const state = this.#secure(id, scope);
    return immutable(state.pendingDecisions.filter((decision) => decision.status === 'pending'));
  }

  #completeDecision(
    id: string,
    decisionId: string,
    scope: ApplicationSecurityScope,
    status: 'approved' | 'rejected' | 'expired',
  ): ApplicationDecision {
    const state = this.#secure(id, scope);
    const decision = state.pendingDecisions.find((candidate) => candidate.id === decisionId);

    if (!decision) {
      throw new Error('Application decision not found.');
    }

    if (decision.status !== 'pending') {
      throw new Error(`Application decision is already ${decision.status}.`);
    }

    const completedDecision = immutable({ ...decision, status, resolvedAt: this.#now() });
    const nextDecisions = state.pendingDecisions.map((candidate) => (candidate.id === decisionId ? completedDecision : candidate));

    this.#replace({ ...state, pendingDecisions: nextDecisions, updatedAt: this.#now() });
    this.#timeline.record(id, 'decision.completed', { decisionId, status });

    return completedDecision;
  }

  #restoreSnapshot(id: string, scope: ApplicationSecurityScope, eventType: 'state.restored' | 'state.recovered'): AIApplicationState {
    this.#secure(id, scope);
    const snapshot = this.#snapshots.get(id);

    if (!snapshot) {
      throw new Error('Application state snapshot not found.');
    }

    assertApplicationStateAccess(snapshot.state, scope);
    this.#states.set(id, snapshot.state);
    this.#timeline.record(id, eventType, {
      workflowId: snapshot.workflow.id,
      executionId: snapshot.execution.id,
      assetCount: snapshot.assets.length,
      pendingDecisionCount: snapshot.decisions.filter((decision) => decision.status === 'pending').length,
    });

    return snapshot.state;
  }

  #recordUpdateEvents(previous: AIApplicationState, next: AIApplicationState): void {
    if (previous.currentCommand !== next.currentCommand && next.currentCommand) {
      this.#timeline.record(next.id, 'command.received', { commandId: next.currentCommand });
    }

    if (previous.currentWorkflow !== next.currentWorkflow && next.currentWorkflow) {
      this.#timeline.record(next.id, 'workflow.started', { workflowId: next.currentWorkflow });
    }

    if (previous.currentExecution !== next.currentExecution && next.currentExecution) {
      this.#timeline.record(next.id, 'execution.started', { executionId: next.currentExecution });
    }

    for (const assetId of next.activeAssets) {
      if (!previous.activeAssets.includes(assetId)) {
        this.#timeline.record(next.id, 'asset.created', { assetId });
      }
    }

    if (previous.status !== 'COMPLETED' && next.status === 'COMPLETED' && next.currentExecution) {
      this.#timeline.record(next.id, 'execution.completed', { executionId: next.currentExecution });
    }
  }

  #get(id: string): AIApplicationState {
    const state = this.#states.get(id);

    if (!state) {
      throw new Error('Application state not found.');
    }

    return state;
  }

  #secure(id: string, scope: ApplicationSecurityScope): AIApplicationState {
    const state = this.#get(id);
    assertApplicationStateAccess(state, scope);
    return state;
  }

  #replace(state: AIApplicationState): AIApplicationState {
    const frozen = immutable(state);
    this.#states.set(state.id, frozen);
    return frozen;
  }

  #now(): string {
    return new Date().toISOString();
  }
}
