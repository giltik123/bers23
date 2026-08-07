import type { ExecutionGraphSnapshot } from '../execution';
import { clamp, deepFreeze } from './immutable';
import type { ExecutionProgress, WorkflowExecutionPlan, WorkflowResult } from './types';

export class ProgressModel {
  calculate(graph: ExecutionGraphSnapshot, workflow: WorkflowExecutionPlan, result?: WorkflowResult): ExecutionProgress {
    const completedSteps = new Set(result?.operations.filter((item) => item.status === 'completed').map((item) => item.stepId) ?? []);
    const completedNodes = workflow.steps.filter((step) => completedSteps.has(step.id)).map((step) => step.executionNodeId).sort();
    const remainingNodes = graph.nodes.map((node) => node.id).filter((id) => !completedNodes.includes(id)).sort();
    const currentStage = workflow.stages.find((stage) => stage.stepIds.some((id) => !completedSteps.has(id)))?.id;
    const estimatedRemainingTime = workflow.steps.filter((step) => !completedSteps.has(step.id)).reduce((sum, step) => sum + step.estimatedLatency, 0);
    return deepFreeze({ overall: clamp(completedNodes.length / Math.max(1, graph.nodes.length)) * 100, currentStage, estimatedRemainingTime, completedNodes, remainingNodes });
  }
}
