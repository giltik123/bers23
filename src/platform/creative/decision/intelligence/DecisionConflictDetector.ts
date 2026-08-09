import { immutable } from "./immutable";
import type { DecisionConflict } from "./refinementTypes";

const rules = [{ goals: ["luxury", "low_cost", "fast"], severity: "WARNING" as const, message: "Премиальное качество конфликтует с минимальной стоимостью и скоростью." },
  { goals: ["minimal_editing", "generative_background"], severity: "BLOCKING" as const, message: "Генеративный фон несовместим с минимальным редактированием." }];
export class DecisionConflictDetector {
  detect(goals: readonly string[]): readonly DecisionConflict[] {
    return immutable(rules.filter(({ goals: required }) => required.every((goal) => goals.includes(goal)))
      .map((rule, index) => ({ id: `conflict-${index + 1}`, ...rule })));
  }
}
