import type { ExecutionGraphSnapshot } from '../execution';
import { deepFreeze } from './immutable';
import type { RecoveryDirective, VerificationComparison, WorkflowResult, WorkflowExecutionPlan } from './types';

export class RollbackBridge {
  decide(graph: ExecutionGraphSnapshot, workflow: WorkflowExecutionPlan, result: WorkflowResult, verification: readonly VerificationComparison[]): readonly RecoveryDirective[] {
    const directives: RecoveryDirective[] = [];
    for (const operation of result.operations.filter((item) => item.status === 'failed')) {
      const step = workflow.steps.find((item) => item.id === operation.stepId);
      if (!step) continue;
      const node = graph.nodes.find((item) => item.id === step.executionNodeId)!;
      directives.push({ action: node.rollbackPoint ? 'rollback' : 'retry', executionNodeId: node.id, reason: operation.error ?? 'Workflow operation failed', preserveNodeIds: graph.topologicalOrder.slice(0, Math.max(0, graph.topologicalOrder.indexOf(node.id))) });
    }
    for (const comparison of verification.filter((item) => !item.passed)) {
      if (directives.some((item) => item.executionNodeId === comparison.executionNodeId)) continue;
      directives.push({ action: comparison.difference < -0.25 ? 'replan' : 'retry', executionNodeId: comparison.executionNodeId, reason: `Verification difference ${comparison.difference}`, preserveNodeIds: graph.topologicalOrder.filter((id) => id !== comparison.executionNodeId) });
    }
    if (!directives.length) directives.push({ action: 'none', reason: 'Workflow and verification succeeded', preserveNodeIds: graph.topologicalOrder });
    return deepFreeze(directives);
  }
}
