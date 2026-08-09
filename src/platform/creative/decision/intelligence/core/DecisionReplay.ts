import type { DecisionEpisode } from "./types";
import type { DecisionScope } from "./DecisionMemory";

export interface DecisionEpisodeReader { replay(id: string, scope: DecisionScope): DecisionEpisode | undefined }
export class DecisionReplay {
  constructor(private readonly episodes: DecisionEpisodeReader) {}
  replay(id: string, scope: DecisionScope): DecisionEpisode | undefined { return this.episodes.replay(id, scope); }
}
