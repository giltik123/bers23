import { deepFreeze } from './immutable';
import type { ExecutionGraphSnapshot, RetryAction, RetryPlan } from './types';

export class RetryPlanner {
  plan(graph: ExecutionGraphSnapshot, failedNodeId: string, action?: RetryAction): RetryPlan {
    const failed = graph.nodes.find((node) => node.id === failedNodeId);
    if (!failed) throw new Error('Failed execution node is missing');
    const selected = action ?? (failed.mode === 'ai' ? 'fallback-local' : failed.risk > 0.5 ? 'replace-operation' : 'rebuild-partial-graph');
    const affected = new Set([failedNodeId]);
    const queue = [failedNodeId];
    while (queue.length) {
      const current = queue.shift()!;
      for (const edge of graph.edges.filter((item) => item.source === current)) if (!affected.has(edge.target)) { affected.add(edge.target); queue.push(edge.target); }
    }
    const replacement = selected === 'fallback-local' ? `local ${failed.operation}` : selected === 'fallback-ai' ? `AI ${failed.operation}` : selected === 'replace-operation' ? `alternative ${failed.operation}` : undefined;
    return deepFreeze({ failedNodeId, action: selected, affectedNodeIds: [...affected].sort(), replacement, reason: `Selected ${selected} from mode, risk and dependency impact` });
  }
}
