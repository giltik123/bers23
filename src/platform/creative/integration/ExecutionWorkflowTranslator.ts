import type { ExecutionGraphSnapshot } from '../execution';
import { deepFreeze } from './immutable';
import { OperationRegistry } from './OperationRegistry';
import type { IntegrationDependencies, WorkflowExecutionPlan, WorkflowStep } from './types';

export class ExecutionWorkflowTranslator {
  constructor(
    private readonly dependencies: IntegrationDependencies,
    private readonly registry: OperationRegistry,
  ) {}

  translate(graph: ExecutionGraphSnapshot): WorkflowExecutionPlan {
    const stepByNode = new Map<string, WorkflowStep>();
    for (const node of graph.nodes) {
      const mapping = this.registry.resolve(node.operation);
      if (!mapping) throw new Error(`Unsupported execution operation: ${node.operation}`);
      stepByNode.set(node.id, deepFreeze({
        id: this.dependencies.id(), executionNodeId: node.id, capability: mapping.capability,
        operation: mapping.workflowStep, dependencies: [], parameters: mapping.parameters,
        verificationRequired: node.verificationRequired, estimatedLatency: node.latency,
      }) as WorkflowStep);
    }
    const steps = [...stepByNode.values()].map((step) => ({
      ...step,
      dependencies: graph.edges.filter((edge) => edge.target === step.executionNodeId).map((edge) => stepByNode.get(edge.source)!.id).sort(),
    }));
    const stages = graph.stages.map((stage) => ({
      id: this.dependencies.id(), order: stage.order,
      stepIds: stage.groups.flatMap((group) => group.nodeIds.map((nodeId) => stepByNode.get(nodeId)!.id)).sort(),
    }));
    return deepFreeze({
      id: this.dependencies.id(), scope: { ...graph.scope }, executionGraphId: graph.id,
      steps, stages, createdAt: this.dependencies.now(),
    });
  }
}
