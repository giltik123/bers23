import { immutableClone } from '../immutable';
import type { CompiledWorkflow, ResourceBudget, Scope, WorkflowOperation, WorkflowSources } from '../types';
export const UNLIMITED_BUDGET: ResourceBudget = Object.freeze({ credits: Number.MAX_SAFE_INTEGER, latencyMs: Number.MAX_SAFE_INTEGER, ramMb: Number.MAX_SAFE_INTEGER, gpuMs: Number.MAX_SAFE_INTEGER, aiCalls: Number.MAX_SAFE_INTEGER, retries: 0 });
export class WorkflowCompiler {
  compile(input: Readonly<{ id: string; prompt: string; scope: Scope; sources: WorkflowSources; budget?: Partial<ResourceBudget>; compiledAt?: number }>): CompiledWorkflow {
    if (!input.scope.tenantId || !input.scope.projectId || !input.scope.userId) throw new Error('tenantId, projectId and userId are required');
    const selected = input.sources.providerSelection ?? {}; const byId = new Map<string, WorkflowOperation>();
    for (const operation of [input.sources.creativePlan, input.sources.executionGraph, input.sources.pipelineGraph].flatMap((source) => source?.operations ?? [])) {
      if (!operation.id || !operation.type) throw new Error('Every workflow operation requires id and type');
      const current = byId.get(operation.id); byId.set(operation.id, { ...current, ...operation, providerId: selected[operation.id] ?? operation.providerId ?? current?.providerId });
    }
    for (const operation of byId.values()) for (const dependency of operation.dependencies ?? []) if (!byId.has(dependency)) throw new Error(`Unknown dependency ${dependency} for ${operation.id}`);
    const operations = topological([...byId.values()]); const depth = new Map<string, number>();
    for (const operation of operations) depth.set(operation.id, Math.max(0, ...(operation.dependencies ?? []).map((id) => (depth.get(id) ?? 0) + 1)));
    const parallelGroups = [...new Set(depth.values())].map((level) => operations.filter((item) => depth.get(item.id) === level).map((item) => item.id));
    return immutableClone({ id: input.id, version: 1 as const, prompt: input.prompt, scope: input.scope, operations, parallelGroups, budget: { ...UNLIMITED_BUDGET, ...input.budget }, compiledAt: input.compiledAt ?? 0 });
  }
}
function topological(operations: WorkflowOperation[]): WorkflowOperation[] {
  const output: WorkflowOperation[] = []; const pending = new Map(operations.map((operation) => [operation.id, operation]));
  while (pending.size) { const ready = [...pending.values()].filter((operation) => (operation.dependencies ?? []).every((id) => output.some((item) => item.id === id)));
    if (!ready.length) throw new Error('Workflow contains a dependency cycle');
    ready.sort((a, b) => operations.indexOf(a) - operations.indexOf(b)); for (const operation of ready) { output.push(operation); pending.delete(operation.id); } }
  return output;
}
