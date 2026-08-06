import { immutable } from "./immutable";
import type { AdvancedDecisionCandidate, StrategyTreeNode } from "./advancedTypes";
import type { CandidateMode } from "./types";

export class DecisionStrategySearcher {
  build(candidates: readonly AdvancedDecisionCandidate[]): StrategyTreeNode {
    const branch = (mode: CandidateMode): StrategyTreeNode => ({ id: `branch-${mode}`, label: mode, mode,
      children: candidates.filter((candidate) => candidate.mode === mode).map((candidate) => ({
        id: `node-${candidate.id}`, label: candidate.strategy, mode, candidateId: candidate.id, children: [],
      })) });
    return immutable({ id: "root", label: "ROOT", children: [branch("LOCAL"), branch("HYBRID"), branch("AI")] });
  }

  flatten(root: StrategyTreeNode): readonly string[] {
    return immutable([root.id, ...root.children.flatMap((node) => this.flatten(node))]);
  }
}
