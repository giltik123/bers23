import { immutable } from "./immutable";
import type { SemanticOperationGraph as Graph, SemanticOperationNode } from "./refinementTypes";

const dependencies: Readonly<Record<string, readonly string[]>> = { exposure: ["lighting"], contrast: ["exposure"],
  white_balance: ["lighting"], color_balance: ["white_balance"], background: ["segmentation"], "ai:try-on": ["segmentation"], sharpness: ["contrast"] };

export class SemanticOperationGraphBuilder {
  build(operations: readonly string[]): Graph {
    const expanded = new Set(operations);
    const includeDependencies = (operation: string) => (dependencies[operation] ?? []).forEach((dependency) => { if (!expanded.has(dependency)) { expanded.add(dependency); includeDependencies(dependency); } });
    operations.forEach(includeDependencies);
    const order: string[] = []; const visiting = new Set<string>();
    const visit = (operation: string) => { if (order.includes(operation) || visiting.has(operation)) return; visiting.add(operation);
      (dependencies[operation] ?? []).filter((item) => expanded.has(item)).forEach(visit); visiting.delete(operation); order.push(operation); };
    expanded.forEach(visit);
    const nodes: SemanticOperationNode[] = order.map((operation) => ({ operation,
      dependsOn: (dependencies[operation] ?? []).filter((item) => expanded.has(item)),
      affects: order.filter((item) => (dependencies[item] ?? []).includes(operation)) }));
    return immutable({ nodes, executionOrder: order });
  }
}
