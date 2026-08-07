import { pipelineDeepFreeze, samePipelineScope } from './PipelineImmutable';
import type { ImageState, PipelineCacheEntry, PipelineDependencies, PipelineScope } from './ImagePipelineTypes';

export class PipelineCache {
  private entries: readonly PipelineCacheEntry[] = [];
  constructor(private readonly dependencies: PipelineDependencies) {}

  put(scope: PipelineScope, operationId: string, inputHash: string, outputHash: string, state: ImageState): PipelineCacheEntry {
    if (!samePipelineScope(scope, state.scope)) throw new Error('Scope isolation violation');
    const entry = pipelineDeepFreeze({ id: this.dependencies.id(), scope: { ...scope }, operationId, inputHash, outputHash, state, createdAt: this.dependencies.now() }) as PipelineCacheEntry;
    this.entries = pipelineDeepFreeze([...this.entries.filter((item) => !(samePipelineScope(item.scope, scope) && item.operationId === operationId && item.inputHash === inputHash)), entry]);
    return entry;
  }
  get(scope: PipelineScope, operationId: string, inputHash: string): PipelineCacheEntry | undefined { return this.entries.find((item) => samePipelineScope(item.scope, scope) && item.operationId === operationId && item.inputHash === inputHash); }
  reuseCandidates(scope: PipelineScope, inputHash: string): readonly PipelineCacheEntry[] { return pipelineDeepFreeze(this.entries.filter((item) => samePipelineScope(item.scope, scope) && item.inputHash === inputHash)); }
  snapshot(scope: PipelineScope): readonly PipelineCacheEntry[] { return pipelineDeepFreeze(this.entries.filter((item) => samePipelineScope(item.scope, scope))); }
  hash(parts: readonly (string | number | boolean)[]): string { let value = 2166136261; for (const character of parts.join('|')) { value ^= character.codePointAt(0)!; value = Math.imul(value, 16777619); } return (value >>> 0).toString(16).padStart(8, '0'); }
}
