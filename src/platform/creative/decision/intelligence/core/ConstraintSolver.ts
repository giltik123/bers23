import { immutable } from "./immutable";
import type { ConstraintGraph, CoreCandidate, DecisionConstraint } from "./types";

export class ConstraintSolver {
  solve(constraints: readonly DecisionConstraint[]): ConstraintGraph {
    const budget = constraints.filter(({ kind }) => kind === "BUDGET").map(({ value }) => Number(value));
    const latency = constraints.filter(({ kind }) => kind === "LATENCY").map(({ value }) => Number(value));
    const conflicts = [...(budget.some((value) => value < 0) ? ["Budget cannot be negative"] : []),
      ...(latency.some((value) => value <= 0) ? ["Latency must be positive"] : []),
      ...(constraints.some(({ kind, value }) => kind === "AI_AVAILABILITY" && value === false)
        && constraints.some(({ kind, value }) => kind === "WORKFLOW_RESTRICTION" && value === "AI_REQUIRED") ? ["AI is required but unavailable"] : [])];
    const nodes = constraints.map((constraint) => ({ constraint,
      dependsOn: constraint.kind === "PROVIDER_AVAILABILITY" ? constraints.filter(({ kind }) => kind === "AI_AVAILABILITY").map(({ id }) => id) : [] }));
    return immutable({ nodes, conflicts, feasible: conflicts.length === 0 });
  }

  allows(candidate: CoreCandidate, graph: ConstraintGraph): boolean {
    return graph.feasible && graph.nodes.every(({ constraint }) => {
      if (constraint.kind === "BUDGET") return candidate.estimatedCost <= Number(constraint.value);
      if (constraint.kind === "LATENCY") return candidate.estimatedLatencyMs <= Number(constraint.value);
      if (constraint.kind === "RISK") return candidate.risk <= Number(constraint.value);
      if (constraint.kind === "AI_AVAILABILITY" && constraint.value === false) return candidate.mode === "LOCAL";
      if (constraint.kind === "PROVIDER_AVAILABILITY" && constraint.value === false) return candidate.mode === "LOCAL";
      if (constraint.kind === "PRIVACY" && constraint.operator === "DISALLOW") return !candidate.operations.includes(String(constraint.value));
      if (constraint.kind === "WORKFLOW_RESTRICTION" && constraint.operator === "DISALLOW") return !candidate.operations.includes(String(constraint.value));
      return true;
    });
  }
}
