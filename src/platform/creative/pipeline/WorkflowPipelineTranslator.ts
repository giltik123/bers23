import type { WorkflowExecutionPlan } from '../integration';
import { PipelineGraph } from './PipelineGraph';
import { PipelineOperationRegistry } from './PipelineOperationRegistry';
import type { PipelineDependencies, PipelineGraphSnapshot, PipelineOperationNode } from './ImagePipelineTypes';

export class WorkflowPipelineTranslator {
  constructor(private readonly dependencies: PipelineDependencies, private readonly registry: PipelineOperationRegistry) {}

  translate(workflow: WorkflowExecutionPlan): PipelineGraphSnapshot {
    const graph = new PipelineGraph(this.dependencies);
    const byStep = new Map<string, PipelineOperationNode>();
    for (const step of workflow.steps) {
      const definition = this.registry.resolve(step.operation);
      if (!definition) throw new Error(`Unsupported workflow operation: ${step.operation}`);
      const stage = workflow.stages.find((item) => item.stepIds.includes(step.id))?.order ?? 1;
      const operation = graph.addOperation({
        id: this.dependencies.id(), scope: { ...workflow.scope }, workflowStepId: step.id,
        operation: step.operation, implementation: definition.implementation, capability: definition.capability,
        dependencies: [], resources: definition.resources, verificationRequired: step.verificationRequired,
        rollbackPoint: true, stage,
      });
      byStep.set(step.id, operation);
    }
    for (const step of workflow.steps) {
      for (const dependency of step.dependencies) graph.addDependency(byStep.get(dependency)!.id, byStep.get(step.id)!.id, workflow.scope);
    }
    graph.setStages(workflow.stages.map((stage) => ({ id: this.dependencies.id(), order: stage.order, operationIds: stage.stepIds.map((id) => byStep.get(id)!.id).sort(), parallel: stage.stepIds.length > 1 })));
    return graph.snapshot(workflow.scope, workflow.id);
  }
}
