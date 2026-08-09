import { deepFreeze } from './immutable';
import type { ExecutionGraphSnapshot, ExecutionResourceAllocation, ExecutionResourceBudget } from './types';

const defaultBudget: ExecutionResourceBudget = { cpu: 100, gpu: 100, ai: 100, memory: 100, local: 100 };

export class ResourceAllocator {
  allocate(graph: ExecutionGraphSnapshot, available: Partial<ExecutionResourceBudget> = {}): ExecutionResourceAllocation {
    const budget = { ...defaultBudget, ...available };
    const nodeAllocations = graph.nodes.map((node) => ({
      nodeId: node.id, cpu: node.cpuTime, gpu: node.gpuTime, ai: node.aiCalls,
      memory: node.memory, local: node.mode === 'local' ? 1 : 0,
    }));
    const required = {
      cpu: nodeAllocations.reduce((sum, item) => sum + item.cpu, 0),
      gpu: nodeAllocations.reduce((sum, item) => sum + item.gpu, 0),
      ai: nodeAllocations.reduce((sum, item) => sum + item.ai, 0),
      memory: Math.max(0, ...nodeAllocations.map((item) => item.memory)),
      local: nodeAllocations.reduce((sum, item) => sum + item.local, 0),
    };
    const keys = Object.keys(required) as (keyof ExecutionResourceBudget)[];
    const shortages = keys.filter((key) => required[key] > budget[key]);
    return deepFreeze({ ...required, nodeAllocations, feasible: !shortages.length, shortages });
  }
}
