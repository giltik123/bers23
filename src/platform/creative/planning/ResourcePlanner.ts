import { deepFreeze } from './immutable';
import type { PlanGraphSnapshot, ResourceAllocation, ResourceBudget } from './types';

const defaults: ResourceBudget = { credits: 100, ai: 10, local: 100, memory: 100, thinking: 100, runtime: 100 };

export class ResourcePlanner {
  allocate(graph: PlanGraphSnapshot, available: Partial<ResourceBudget> = {}): ResourceAllocation {
    const budget = { ...defaults, ...available };
    const required: ResourceBudget = {
      credits: graph.nodes.reduce((sum, node) => sum + node.cost, 0),
      ai: graph.nodes.filter((node) => node.ai).length,
      local: graph.nodes.filter((node) => node.local && node.type === 'operation').length,
      memory: graph.nodes.length,
      thinking: graph.nodes.length + graph.edges.length,
      runtime: graph.nodes.reduce((sum, node) => sum + node.latency, 0),
    };
    const keys = Object.keys(required) as (keyof ResourceBudget)[];
    const shortages = keys.filter((key) => required[key] > budget[key]);
    return deepFreeze({ ...required, feasible: shortages.length === 0, shortages });
  }
}
