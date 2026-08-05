import type { WorkflowDefinition } from './WorkflowDefinition';
import type { WorkflowStep } from './WorkflowStep';

export interface WorkflowGraphEdge { readonly from: string; readonly to: string; }
export interface WorkflowGraph { readonly nodes: readonly string[]; readonly edges: readonly WorkflowGraphEdge[]; readonly order: readonly string[]; }

export class WorkflowGraphBuilder {
  build(definition: WorkflowDefinition): WorkflowGraph {
    const nodes = definition.steps.map((step) => step.id);
    const edges = definition.steps.flatMap((step) => step.dependsOn.map((dependency) => ({ from: dependency, to: step.id })));
    return Object.freeze({ nodes: Object.freeze(nodes), edges: Object.freeze(edges), order: Object.freeze(this.order(definition.steps)) });
  }

  order(steps: readonly WorkflowStep[]): string[] {
    const byId = new Map(steps.map((step) => [step.id, step]));
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const ordered: string[] = [];
    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Workflow dependency cycle detected at ${id}.`);
      const step = byId.get(id);
      if (!step) throw new Error(`Workflow dependency does not exist: ${id}.`);
      visiting.add(id);
      step.dependsOn.forEach(visit);
      visiting.delete(id);
      visited.add(id);
      ordered.push(id);
    };
    steps.forEach((step) => visit(step.id));
    return ordered;
  }
}
