export type AIApplicationStateStatus =
  | 'INITIALIZING'
  | 'READY'
  | 'PROCESSING'
  | 'WAITING_USER'
  | 'PAUSED'
  | 'COMPLETED'
  | 'FAILED';

export type DecisionStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApplicationSecurityScope {
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
}

export interface ApplicationDecision {
  readonly id: string;
  readonly reason: string;
  readonly status: DecisionStatus;
  readonly requestedAt: string;
  readonly resolvedAt: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ApplicationProgress {
  readonly step: string;
  readonly percent: number;
  readonly message?: string;
}

export interface ApplicationNotification {
  readonly id: string;
  readonly level: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly createdAt: string;
}

export interface AIApplicationState {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
  readonly experienceId: string | null;
  readonly currentCommand: string | null;
  readonly currentWorkflow: string | null;
  readonly currentExecution: string | null;
  readonly activeAssets: readonly string[];
  readonly pendingDecisions: readonly ApplicationDecision[];
  readonly progress: ApplicationProgress;
  readonly notifications: readonly ApplicationNotification[];
  readonly status: AIApplicationStateStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateApplicationStateInput extends ApplicationSecurityScope {
  readonly id?: string;
  readonly workspaceId?: string | null;
  readonly sessionId?: string | null;
  readonly experienceId?: string | null;
}

export interface UpdateApplicationStateInput {
  readonly workspaceId?: string | null;
  readonly sessionId?: string | null;
  readonly experienceId?: string | null;
  readonly currentCommand?: string | null;
  readonly currentWorkflow?: string | null;
  readonly currentExecution?: string | null;
  readonly activeAssets?: readonly string[];
  readonly progress?: Partial<ApplicationProgress>;
  readonly notifications?: readonly ApplicationNotification[];
}

export const createApplicationStateId = () => `app_state_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const createDecisionId = () => `decision_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function assertApplicationStateAccess(
  state: Pick<AIApplicationState, 'userId' | 'tenantId' | 'projectId'>,
  scope: ApplicationSecurityScope,
): void {
  if (state.userId !== scope.userId || state.tenantId !== scope.tenantId || state.projectId !== scope.projectId) {
    throw new Error('Application state access denied: userId, tenantId and projectId are required to match.');
  }
}

export function immutable<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    immutable((value as Record<string, unknown>)[key]);
  }

  return Object.freeze(value);
}
