export type InteractionAction =
  | 'CREATE_IMAGE'
  | 'EDIT_IMAGE'
  | 'CHANGE_STYLE'
  | 'CHANGE_BACKGROUND'
  | 'TRY_ON'
  | 'REVIEW_RESULT'
  | 'APPROVE'
  | 'REJECT'
  | 'CONTINUE'
  | 'UNDO'
  | 'REDO';

export type InteractionResponseStatus = 'RECEIVED' | 'PROCESSING' | 'WAITING_USER' | 'COMPLETED' | 'REJECTED' | 'FAILED';

export interface InteractionSecurityScope {
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
}

export interface InteractionCurrentState {
  readonly id: string;
  readonly workspaceId?: string | null;
  readonly sessionId?: string | null;
  readonly experienceId?: string | null;
  readonly currentCommand?: string | null;
  readonly currentWorkflow?: string | null;
  readonly currentExecution?: string | null;
  readonly activeAssets?: readonly string[];
  readonly pendingDecisions?: readonly { readonly id: string; readonly status: string; readonly reason?: string }[];
  readonly status?: string;
}

export interface InteractionRequest extends InteractionSecurityScope {
  readonly id: string;
  readonly type: InteractionAction;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly currentState: InteractionCurrentState;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface InteractionContext extends InteractionSecurityScope {
  readonly stateId: string;
  readonly workspaceId: string | null;
  readonly sessionId: string | null;
  readonly experienceId: string | null;
  readonly memory: readonly string[];
  readonly workflowHistory: readonly string[];
  readonly intelligence: Readonly<Record<string, unknown>>;
}

export interface InteractionSuggestion {
  readonly id: string;
  readonly title: string;
  readonly action: InteractionAction;
  readonly reason: string;
}

export interface InteractionResponse {
  readonly id: string;
  readonly requestId: string;
  readonly status: InteractionResponseStatus;
  readonly action: InteractionAction;
  readonly detectedIntent: string;
  readonly selectedWorkflow: string | null;
  readonly requiredDecisions: readonly string[];
  readonly executionStatus: string;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly suggestions: readonly InteractionSuggestion[];
  readonly message: string;
  readonly createdAt: string;
}

export interface InteractionDebugTree {
  readonly userRequest: InteractionRequest;
  readonly detectedIntent: string;
  readonly selectedWorkflow: string | null;
  readonly requiredDecisions: readonly string[];
  readonly executionStatus: string;
  readonly result: Readonly<Record<string, unknown>> | null;
}

export const createInteractionResponseId = () => `interaction_response_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
export const createSuggestionId = () => `suggestion_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function assertInteractionAccess(request: InteractionSecurityScope, scope: InteractionSecurityScope): void {
  if (request.userId !== scope.userId || request.tenantId !== scope.tenantId || request.projectId !== scope.projectId) {
    throw new Error('Interaction access denied: userId, tenantId and projectId are required to match.');
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
