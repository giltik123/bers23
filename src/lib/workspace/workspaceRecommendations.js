import { getWorkspace } from '@/lib/workspace/workspaceProfiles';
import { recipeManager } from '@/lib/recipes/recipeManager';

// WorkspaceRecommendations — the workspace's recipe collection + a contextual tip.
// Recommendations only guide the user; execution always flows through the normal pipeline.
class WorkspaceRecommendations {
  recommend(workspaceId) {
    const ws = getWorkspace(workspaceId);
    const recipes = ws.recipeIds.map((id) => recipeManager.get(id)).filter(Boolean);
    return { recipes, tip: ws.tip };
  }
}

export const workspaceRecommendations = new WorkspaceRecommendations();