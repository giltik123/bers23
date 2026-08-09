import { deepFreeze } from './immutable';
import type { ExecutionExplanation, ExecutionGraphSnapshot } from './types';

export class ExecutionExplainability {
  explain(graph: ExecutionGraphSnapshot): ExecutionExplanation {
    const operations = graph.nodes.map((node) => {
      const before = graph.edges.filter((edge) => edge.target === node.id).map((edge) => graph.nodes.find((item) => item.id === edge.source)!.operation);
      const after = graph.edges.filter((edge) => edge.source === node.id).map((edge) => graph.nodes.find((item) => item.id === edge.target)!.operation);
      const group = graph.stages.flatMap((stage) => stage.groups).find((item) => item.nodeIds.includes(node.id));
      return {
        nodeId: node.id, whyHere: `Operation implements plan node ${node.planNodeId}`,
        whyBefore: after, whyAfter: before,
        whyParallel: group?.parallel ? 'No dependency between operations in this group' : 'Dependencies require sequential placement',
        whyMode: node.mode === 'ai' ? 'Plan operation requires AI capability' : 'Operation is locally executable',
      };
    });
    const narrative = operations.map((item) => `${item.nodeId}: ${item.whyHere}; ${item.whyParallel}; ${item.whyMode}`).join('\n');
    return deepFreeze({ graphId: graph.id, operations, narrative });
  }
}
