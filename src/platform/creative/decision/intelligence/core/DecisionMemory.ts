import { immutable } from "./immutable";
import type { DecisionEpisode, DecisionStatistics } from "./types";

export interface DecisionScope { readonly userId: string; readonly tenantId: string; readonly projectId: string }
export class DecisionMemory {
  private episodes: readonly DecisionEpisode[] = immutable([]);
  remember(episode: DecisionEpisode): DecisionEpisode { const snapshot = immutable(structuredClone(episode)); this.episodes = immutable([...this.episodes, snapshot]); return snapshot; }
  history(scope: DecisionScope): readonly DecisionEpisode[] { return immutable(this.episodes.filter((item) => item.userId === scope.userId
    && item.tenantId === scope.tenantId && item.projectId === scope.projectId).map((item) => structuredClone(item))); }
  replay(id: string, scope: DecisionScope): DecisionEpisode | undefined { return this.history(scope).find((episode) => episode.id === id); }
  statistics(scope: DecisionScope): DecisionStatistics {
    const episodes = this.history(scope); const average = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return immutable({ episodes: episodes.length, acceptanceRate: episodes.length ? episodes.filter(({ userReaction }) => userReaction === "ACCEPTED").length / episodes.length : 0,
      averageCost: average(episodes.map(({ actualCost }) => actualCost ?? 0)), averageLatencyMs: average(episodes.map(({ actualLatencyMs }) => actualLatencyMs ?? 0)),
      averageQuality: average(episodes.map(({ actualQuality }) => actualQuality ?? 0)) });
  }
}
