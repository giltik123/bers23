import { assertWorkspaceAccess, immutable, type AIWorkspace, type WorkspaceAsset, type WorkspaceSecurityScope } from './AIWorkspace';

export class AssetIndex {
  readonly #loadWorkspace: (workspaceId: string) => AIWorkspace;

  constructor(loadWorkspace: (workspaceId: string) => AIWorkspace) {
    this.#loadWorkspace = loadWorkspace;
  }

  all(workspaceId: string, scope: WorkspaceSecurityScope): readonly WorkspaceAsset[] {
    const workspace = this.#loadWorkspace(workspaceId);
    assertWorkspaceAccess(workspace, scope);
    return immutable([...workspace.assets]);
  }

  findByWorkflow(workspaceId: string, workflowId: string, scope: WorkspaceSecurityScope): readonly WorkspaceAsset[] {
    return immutable(this.all(workspaceId, scope).filter((asset) => asset.workflowId === workflowId));
  }

  findByExecution(workspaceId: string, executionId: string, scope: WorkspaceSecurityScope): readonly WorkspaceAsset[] {
    return immutable(this.all(workspaceId, scope).filter((asset) => asset.executionId === executionId));
  }

  findByType(workspaceId: string, type: string, scope: WorkspaceSecurityScope): readonly WorkspaceAsset[] {
    return immutable(this.all(workspaceId, scope).filter((asset) => asset.type === type));
  }

  latest(workspaceId: string, scope: WorkspaceSecurityScope): WorkspaceAsset | null {
    return this.all(workspaceId, scope).reduce<WorkspaceAsset | null>((latest, asset) => {
      if (!latest) return asset;
      return asset.updatedAt >= latest.updatedAt ? asset : latest;
    }, null);
  }

  history(workspaceId: string, assetId: string, scope: WorkspaceSecurityScope) {
    const asset = this.all(workspaceId, scope).find((candidate) => candidate.id === assetId);
    return immutable([...(asset?.versions || [])]);
  }
}
