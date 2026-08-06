import { immutable } from "./immutable";
import type { ExplainabilityNode } from "./advancedTypes";

export interface ExplainabilityGraphInput {
  readonly prompt: string; readonly intent: string; readonly features: readonly string[]; readonly candidates: number;
  readonly ranking: string; readonly optimization: string; readonly decision: string; readonly confidence: number;
  readonly expectedQuality: number; readonly expectedCost: number; readonly expectedSatisfaction: number;
}
export class DecisionExplainabilityGraph {
  build(input: ExplainabilityGraphInput): ExplainabilityNode {
    const entries = [["intent", "Intent", input.intent], ["features", "Features", input.features.join(", ")],
      ["candidates", "Candidates", String(input.candidates)], ["ranking", "Ranking", input.ranking],
      ["optimization", "Optimization", input.optimization], ["decision", "Decision", input.decision],
      ["confidence", "Confidence", String(input.confidence)], ["quality", "Expected Quality", String(input.expectedQuality)],
      ["cost", "Expected Cost", String(input.expectedCost)], ["satisfaction", "Expected Satisfaction", String(input.expectedSatisfaction)]];
    let child: readonly ExplainabilityNode[] = [];
    for (const [id, label, value] of [...entries].reverse()) child = [{ id, label, value, children: child }];
    return immutable({ id: "prompt", label: "Prompt", value: input.prompt, children: child });
  }
}
