import { AssetIndex } from './AssetIndex';
import {
  assertWorkspaceAccess,
  createWorkspaceId,
  immutable,
  type AIWorkspace,
  type CreateWorkspaceInput,
  type WorkspaceAsset,
  type WorkspaceExecution,
  type WorkspaceExperience,
  type WorkspaceSecurityScope,
  type WorkspaceWorkflow,
} from './AIWorkspace';
import { WorkspaceHistory } from './WorkspaceHistory';

export interface WorkspaceContext {
  readonly user: Readonly<{ id: string }>;
  readonly tenant: Readonly<{ id: string }>;
  readonly project: Readonly<{ id: string }>;
  readonly session: Readonly<{ id: string | null }>;
  readonly assets: readonly WorkspaceAsset[];
  readonly experiences: readonly WorkspaceExperience[];
  readonly workflows: readonly WorkspaceWorkflow[];
  readonly executions: readonly WorkspaceExecution[];
}

export interface WorkspaceRecoverySnapshot {
  readonly workspace: AIWorkspace;
  readonly activeSession: string | null;
  readonly activeExperience: WorkspaceExperience | null;
  readonly unfinishedExecution: WorkspaceExecution | null;
  readonly assetReferences: readonly string[];
  readonly lastWorkflow: WorkspaceWorkflow | null;
  readonly createdAt: string;
}

export interface WorkspaceDebugTree {
  readonly workspace: AIWorkspace;
  readonly project: Readonly<{ id: string }>;
  readonly session: Readonly<{ id: string | null }>;
  readonly commands: readonly unknown[];
  readonly experiences: readonly WorkspaceExperience[];
  readonly workflows: readonly WorkspaceWorkflow[];
  readonly executions: readonly WorkspaceExecution[];
  readonly assets: readonly WorkspaceAsset[];
  readonly timeline: ReturnType<WorkspaceHistory['list']>;
}

export type WorkspaceAssetInput = Omit<WorkspaceAsset, 'createdAt' | 'updatedAt' | 'versions'> &
  Partial<Pick<WorkspaceAsset, 'createdAt' | 'updatedAt' | 'versions'>>;

export class WorkspaceManager {
  readonly #workspaces = new Map<string, AIWorkspace>();
  readonly #snapshots = new Map<string, WorkspaceRecoverySnapshot>();
  readonly #history = new WorkspaceHistory();
  readonly assets = new AssetIndex((workspaceId) => this.#get(workspaceId));

  create(input: CreateWorkspaceInput): AIWorkspace {
    const now = new Date().toISOString();
    const workspace = immutable({
      id: input.id || createWorkspaceId(),
      userId: input.userId,
      tenantId: input.tenantId,
      projectId: input.projectId,
      name: input.name,
      description: input.description || '',
      sessionId: input.sessionId || null,
      assets: [],
      experiences: [],
      workflows: [],
      executions: [],
      preferences: { ...(input.preferences || {}) },
      status: 'CREATED' as const,
      createdAt: now,
      updatedAt: now,
    });

    this.#workspaces.set(workspace.id, workspace);
    this.#history.record(workspace.id, 'workspace.created', {
      userId: workspace.userId,
      tenantId: workspace.tenantId,
      projectId: workspace.projectId,
    });

    return workspace;
  }

  open(id: string, scope: WorkspaceSecurityScope): WorkspaceContext {
    const workspace = this.#secure(id, scope);

    if (workspace.status !== 'ARCHIVED') {
      this.#replace({ ...workspace, status: 'ACTIVE', updatedAt: this.#now() });
    }

    this.#history.record(id, 'workspace.opened');
    return this.inspect(id, scope);
  }

  close(id: string, scope: WorkspaceSecurityScope): AIWorkspace {
    const workspace = this.#secure(id, scope);
    const closed = this.#replace({ ...workspace, status: 'PAUSED', updatedAt: this.#now() });

    this.#history.record(id, 'workspace.closed');
    return closed;
  }

  archive(id: string, scope: WorkspaceSecurityScope): AIWorkspace {
    const workspace = this.#secure(id, scope);
    const archived = this.#replace({ ...workspace, status: 'ARCHIVED', updatedAt: this.#now() });

    this.#history.record(id, 'workspace.archived');
    return archived;
  }

  restore(id: string, scope: WorkspaceSecurityScope): AIWorkspace {
    const workspace = this.#secure(id, scope);
    const restored = this.#replace({ ...workspace, status: 'ACTIVE', updatedAt: this.#now() });

    this.#history.record(id, 'workspace.restored');
    return restored;
  }

  inspect(id: string, scope: WorkspaceSecurityScope): WorkspaceContext {
    const workspace = this.#secure(id, scope);

    return immutable({
      user: { id: workspace.userId },
      tenant: { id: workspace.tenantId },
      project: { id: workspace.projectId },
      session: { id: workspace.sessionId },
      assets: [...workspace.assets],
      experiences: [...workspace.experiences],
      workflows: [...workspace.workflows],
      executions: [...workspace.executions],
    });
  }

  debug(id: string, scope: WorkspaceSecurityScope): WorkspaceDebugTree {
    const workspace = this.#secure(id, scope);

    return immutable({
      workspace,
      project: { id: workspace.projectId },
      session: { id: workspace.sessionId },
      commands: [],
      experiences: [...workspace.experiences],
      workflows: [...workspace.workflows],
      executions: [...workspace.executions],
      assets: workspace.assets.map((asset) => ({ ...asset, versions: [...asset.versions] })),
      timeline: this.#history.list(id),
    });
  }

  history(id: string, scope: WorkspaceSecurityScope) {
    this.#secure(id, scope);
    return this.#history.list(id);
  }

  snapshot(id: string, scope: WorkspaceSecurityScope): WorkspaceRecoverySnapshot {
    const workspace = this.#secure(id, scope);
    const snapshot = immutable({
      workspace,
      activeSession: workspace.sessionId,
      activeExperience: workspace.experiences.find((item) => item.status === 'ACTIVE') || null,
      unfinishedExecution: workspace.executions.find((item) => item.status !== 'COMPLETED' && item.status !== 'FAILED') || null,
      assetReferences: workspace.assets.map((asset) => asset.id),
      lastWorkflow: workspace.workflows.at(-1) || null,
      createdAt: this.#now(),
    });

    this.#snapshots.set(id, snapshot);
    return snapshot;
  }

  restoreSnapshot(id: string, scope: WorkspaceSecurityScope): AIWorkspace {
    return this.#restoreFromSnapshot(id, scope, 'workspace.restored');
  }

  recover(id: string, scope: WorkspaceSecurityScope): AIWorkspace {
    return this.#restoreFromSnapshot(id, scope, 'workspace.recovered');
  }

  attachSession(id: string, sessionId: string, scope: WorkspaceSecurityScope): AIWorkspace {
    const workspace = this.#secure(id, scope);
    return this.#replace({ ...workspace, sessionId, updatedAt: this.#now() });
  }

  addAsset(id: string, asset: WorkspaceAssetInput, scope: WorkspaceSecurityScope): WorkspaceAsset {
    const workspace = this.#secure(id, scope);
    const now = this.#now();
    const nextAsset = immutable({
      ...asset,
      versions: asset.versions || [{ id: `${asset.id}:v1`, assetId: asset.id, number: 1, createdAt: now }],
      createdAt: asset.createdAt || now,
      updatedAt: asset.updatedAt || now,
    });

    this.#replace({ ...workspace, assets: [...workspace.assets, nextAsset], updatedAt: now });
    this.#history.record(id, 'asset.added', {
      assetId: asset.id,
      workflowId: asset.workflowId,
      executionId: asset.executionId,
    });

    return nextAsset;
  }

  addExperience(id: string, experience: WorkspaceExperience, scope: WorkspaceSecurityScope): WorkspaceExperience {
    const workspace = this.#secure(id, scope);

    this.#replace({ ...workspace, experiences: [...workspace.experiences, experience], updatedAt: this.#now() });
    this.#history.record(id, 'experience.started', { experienceId: experience.id });

    return immutable(experience);
  }

  addWorkflow(id: string, workflow: WorkspaceWorkflow, scope: WorkspaceSecurityScope): WorkspaceWorkflow {
    const workspace = this.#secure(id, scope);

    this.#replace({ ...workspace, workflows: [...workspace.workflows, workflow], updatedAt: this.#now() });
    this.#history.record(id, 'workflow.executed', { workflowId: workflow.id });

    return immutable(workflow);
  }

  addExecution(id: string, execution: WorkspaceExecution, scope: WorkspaceSecurityScope): WorkspaceExecution {
    const workspace = this.#secure(id, scope);

    this.#replace({ ...workspace, executions: [...workspace.executions, execution], updatedAt: this.#now() });

    if (execution.status === 'COMPLETED') {
      this.#history.record(id, 'execution.completed', {
        executionId: execution.id,
        workflowId: execution.workflowId,
      });
    }

    return immutable(execution);
  }

  #restoreFromSnapshot(id: string, scope: WorkspaceSecurityScope, eventType: 'workspace.restored' | 'workspace.recovered'): AIWorkspace {
    const snapshot = this.#snapshots.get(id);

    if (!snapshot) {
      throw new Error('Workspace recovery snapshot not found.');
    }

    assertWorkspaceAccess(snapshot.workspace, scope);
    this.#workspaces.set(id, snapshot.workspace);
    this.#history.record(id, eventType);

    return snapshot.workspace;
  }

  #get(id: string): AIWorkspace {
    const workspace = this.#workspaces.get(id);

    if (!workspace) {
      throw new Error('Workspace not found.');
    }

    return workspace;
  }

  #secure(id: string, scope: WorkspaceSecurityScope): AIWorkspace {
    const workspace = this.#get(id);
    assertWorkspaceAccess(workspace, scope);
    return workspace;
  }

  #replace(workspace: AIWorkspace): AIWorkspace {
    const frozen = immutable(workspace);
    this.#workspaces.set(workspace.id, frozen);
    return frozen;
  }

  #now(): string {
    return new Date().toISOString();
  }
}
