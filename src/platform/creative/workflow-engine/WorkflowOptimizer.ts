import { immutableClone } from './immutable';
import type { CompiledWorkflow, WorkflowOperation } from './types';
export class WorkflowOptimizer {
  optimize(workflow: CompiledWorkflow, availableArtifacts: readonly string[] = []): CompiledWorkflow {
    const aliases = new Map<string, string>(); const signatures = new Map<string, string>(); const kept: WorkflowOperation[] = [];
    for (const operation of workflow.operations) { if (operation.reusableArtifactId && availableArtifacts.includes(operation.reusableArtifactId)) continue;
      const signature = JSON.stringify([operation.type, operation.input ?? {}, operation.providerId ?? '']); const duplicate = signatures.get(signature);
      if (duplicate) aliases.set(operation.id, duplicate); else { signatures.set(signature, operation.id); kept.push(operation); } }
    const operations = kept.map((operation) => ({ ...operation, dependencies: [...new Set((operation.dependencies ?? []).map((id) => aliases.get(id) ?? id).filter((id) => kept.some((candidate) => candidate.id === id)))] }));
    const depth = new Map<string, number>(); for (const operation of operations) depth.set(operation.id, Math.max(0, ...(operation.dependencies ?? []).map((id) => (depth.get(id) ?? 0) + 1)));
    const parallelGroups = [...new Set(depth.values())].map((level) => operations.filter((item) => depth.get(item.id) === level).map((item) => item.id)); return immutableClone({ ...workflow, operations, parallelGroups });
  }
}
