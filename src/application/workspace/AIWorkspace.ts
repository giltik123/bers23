export type AIWorkspaceStatus = 'CREATED' | 'ACTIVE' | 'PAUSED' | 'ARCHIVED' | 'FAILED';

export interface WorkspaceSecurityScope {
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
}

export interface WorkspaceAssetVersion {
  readonly id: string;
  readonly assetId: string;
  readonly number: number;
  readonly createdAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WorkspaceAsset {
  readonly id: string;
  readonly type: string;
  readonly workflowId?: string;
  readonly executionId?: string;
  readonly versions: readonly WorkspaceAssetVersion[];
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface WorkspaceExperience { readonly id: string; readonly status?: string; readonly createdAt?: string; readonly metadata?: Readonly<Record<string, unknown>>; }
export interface WorkspaceWorkflow { readonly id: string; readonly status?: string; readonly createdAt?: string; readonly metadata?: Readonly<Record<string, unknown>>; }
export interface WorkspaceExecution { readonly id: string; readonly workflowId?: string; readonly status?: string; readonly createdAt?: string; readonly completedAt?: string; readonly metadata?: Readonly<Record<string, unknown>>; }

export interface AIWorkspace {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly name: string;
  readonly description: string;
  readonly sessionId: string | null;
  readonly assets: readonly WorkspaceAsset[];
  readonly experiences: readonly WorkspaceExperience[];
  readonly workflows: readonly WorkspaceWorkflow[];
  readonly executions: readonly WorkspaceExecution[];
  readonly preferences: Readonly<Record<string, unknown>>;
  readonly status: AIWorkspaceStatus;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateWorkspaceInput extends WorkspaceSecurityScope {
  readonly id?: string;
  readonly name: string;
  readonly description?: string;
  readonly sessionId?: string | null;
  readonly preferences?: Readonly<Record<string, unknown>>;
}

export const createWorkspaceId = () => `workspace_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

export function assertWorkspaceAccess(workspace: Pick<AIWorkspace, 'userId' | 'tenantId' | 'projectId'>, scope: WorkspaceSecurityScope): void {
  if (workspace.tenantId !== scope.tenantId || workspace.projectId !== scope.projectId || workspace.userId !== scope.userId) {
    throw new Error('Workspace access denied: userId, tenantId and projectId are required to match.');
  }
}

export function immutable<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const key of Object.keys(value as Record<string, unknown>)) immutable((value as Record<string, unknown>)[key]);
  return Object.freeze(value);
}
