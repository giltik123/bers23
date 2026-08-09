import { immutable } from "./immutable";
import type { KnowledgeEdge } from "./advancedTypes";

export class DecisionKnowledgeGraph {
  private edges: readonly KnowledgeEdge[] = immutable([]);
  addPath(nodes: readonly string[], success: boolean): readonly KnowledgeEdge[] {
    let next = [...this.edges];
    for (let index = 0; index < nodes.length - 1; index += 1) {
      const from = nodes[index]; const to = nodes[index + 1]; const found = next.find((edge) => edge.from === from && edge.to === to);
      next = found ? next.map((edge) => edge === found ? { ...edge, occurrences: edge.occurrences + 1, successes: edge.successes + Number(success) } : edge)
        : [...next, { from, to, occurrences: 1, successes: Number(success) }];
    }
    this.edges = immutable(next);
    return this.snapshot();
  }
  snapshot(): readonly KnowledgeEdge[] { return immutable(this.edges.map((edge) => ({ ...edge }))); }
}
