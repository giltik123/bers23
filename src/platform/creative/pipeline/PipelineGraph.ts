import { pipelineDeepFreeze, samePipelineScope } from './PipelineImmutable';
import type { PipelineDependencies, PipelineGraphSnapshot, PipelineOperationNode, PipelineScope, PipelineStage } from './ImagePipelineTypes';

export class PipelineGraph {
  private readonly operations = new Map<string, PipelineOperationNode>();
  private readonly dependencies: { source: string; target: string }[] = [];
  private stages: readonly PipelineStage[] = [];
  constructor(private readonly injections: PipelineDependencies) {}

  addOperation(operation: PipelineOperationNode): PipelineOperationNode {
    if (this.operations.has(operation.id)) throw new Error(`Duplicate pipeline operation: ${operation.id}`);
    const value = pipelineDeepFreeze({ ...operation, scope: { ...operation.scope }, dependencies: [...new Set(operation.dependencies)].sort(), resources: { ...operation.resources } }) as PipelineOperationNode;
    this.operations.set(value.id, value);
    return value;
  }

  addDependency(source: string, target: string, scope: PipelineScope): void {
    const before = this.operations.get(source);
    const after = this.operations.get(target);
    if (!before || !after) throw new Error('Broken pipeline dependency');
    if (!samePipelineScope(before.scope, scope) || !samePipelineScope(after.scope, scope)) throw new Error('Scope isolation violation');
    if (source === target || this.hasPath(target, source)) throw new Error('Pipeline graph must remain acyclic');
    this.dependencies.push(pipelineDeepFreeze({ source, target }));
  }

  setStages(stages: readonly PipelineStage[]): void {
    const ids = new Set(this.operations.keys());
    if (stages.some((stage) => stage.operationIds.some((id) => !ids.has(id)))) throw new Error('Stage references missing operation');
    this.stages = pipelineDeepFreeze(stages.map((stage) => ({ ...stage, operationIds: [...stage.operationIds] })));
  }

  snapshot(scope: PipelineScope, workflowPlanId: string): PipelineGraphSnapshot {
    const operations = [...this.operations.values()].filter((item) => samePipelineScope(item.scope, scope)).sort((a, b) => a.id.localeCompare(b.id));
    const ids = new Set(operations.map((item) => item.id));
    const dependencies = this.dependencies.filter((item) => ids.has(item.source) && ids.has(item.target)).slice().sort((a, b) => `${a.source}:${a.target}`.localeCompare(`${b.source}:${b.target}`));
    return pipelineDeepFreeze({ id: this.injections.id(), scope: { ...scope }, workflowPlanId, stages: this.stages, operations, dependencies, rollbackPoints: operations.filter((item) => item.rollbackPoint).map((item) => item.id).sort(), createdAt: this.injections.now() });
  }

  private hasPath(from: string, to: string): boolean {
    const queue = [from];
    const seen = new Set<string>();
    while (queue.length) {
      const current = queue.shift()!;
      if (current === to) return true;
      if (seen.has(current)) continue;
      seen.add(current);
      queue.push(...this.dependencies.filter((item) => item.source === current).map((item) => item.target));
    }
    return false;
  }
}
