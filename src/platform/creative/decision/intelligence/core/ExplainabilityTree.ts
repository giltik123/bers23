import { immutable } from "./immutable";
import type { CoreDebugSnapshot, ExplainabilityNode } from "./types";

export class ExplainabilityTree {
  build(snapshot: CoreDebugSnapshot): ExplainabilityNode {
    const entries = [["goal", "Goal", snapshot.goal.primaryGoal.name], ["constraints", "Constraints", String(snapshot.constraints.nodes.length)],
      ["features", "Features", snapshot.extractedFeatures.join(", ")], ["candidates", "Candidates", String(snapshot.candidates.length)],
      ["pareto", "Pareto", String(snapshot.paretoFrontier.length)], ["utility", "Utility", String(snapshot.utilityScores.length)],
      ["tournament", "Tournament", String(snapshot.tournament.rounds.length)], ["selected", "Selected Decision", snapshot.selectedDecision.id],
      ["confidence", "Confidence", String(snapshot.confidence.mean)], ["risk", "Risk", String(snapshot.risk.total)],
      ["quality", "Expected Quality", String(snapshot.expectedQuality)], ["cost", "Expected Cost", String(snapshot.expectedCost)],
      ["satisfaction", "Expected Satisfaction", String(snapshot.expectedSatisfaction)]];
    let children: readonly ExplainabilityNode[] = [];
    for (const [id, label, value] of [...entries].reverse()) children = [{ id, label, value, children }];
    return immutable({ id: "root", label: "Decision Intelligence", value: snapshot.prompt, children });
  }
}
