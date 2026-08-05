import type { MemoryRecord } from './MemoryRecord';
import type { MemoryRetriever } from './MemoryRetriever';
import type { MemoryAccessContext } from './MemoryTypes';

export interface ContextBuildRequest extends MemoryAccessContext { readonly request?: string; readonly namespace?: string; readonly executionHistory?: readonly unknown[]; }
export interface PlatformMemoryContext {
  readonly user: readonly MemoryRecord[]; readonly project: readonly MemoryRecord[]; readonly preferences: readonly MemoryRecord[];
  readonly execution: readonly MemoryRecord[]; readonly workflows: readonly MemoryRecord[]; readonly relevant: readonly MemoryRecord[];
  readonly executionHistory: readonly unknown[]; readonly builtAt: string;
}

/** Combines privacy-filtered user, project, execution, workflow, and preference context. */
export class ContextBuilder {
  constructor(private readonly retriever: MemoryRetriever, private readonly clock = () => new Date()) {}
  build(request: ContextBuildRequest): PlatformMemoryContext {
    const access: MemoryAccessContext = { tenantId: request.tenantId, userId: request.userId, projectId: request.projectId };
    const byCategory = (categories: Parameters<MemoryRetriever['relevant']>[0]['categories']): readonly MemoryRecord[] => this.retriever.relevant({ namespace: request.namespace, categories, limit: 100 }, access);
    return Object.freeze({
      user: byCategory(['USER_PREFERENCE', 'STYLE_MEMORY']), project: byCategory(['PROJECT_CONTEXT']), preferences: byCategory(['USER_PREFERENCE']),
      execution: byCategory(['EXECUTION_PATTERN']), workflows: byCategory(['WORKFLOW_MEMORY']),
      relevant: request.request ? this.retriever.relevant({ text: request.request, namespace: request.namespace, limit: 20 }, access) : Object.freeze([]),
      executionHistory: deepFreeze(structuredClone(request.executionHistory ?? [])), builtAt: this.clock().toISOString(),
    });
  }
}
function deepFreeze<Value>(value: Value, seen = new WeakSet<object>()): Value { if (value && typeof value === 'object' && !seen.has(value)) { seen.add(value); Object.freeze(value); for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child, seen); } return value; }
