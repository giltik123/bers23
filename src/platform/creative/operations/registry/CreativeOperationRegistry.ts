import { canonicalOperationDescriptors } from '../descriptors/canonicalDescriptors';
import { immutableOperationClone } from '../immutable';
import type { OperationDescriptor, OperationScope } from '../types';

function scopeKey(scope: OperationScope): string {
  assertScope(scope);
  return `${scope.tenantId}\u0000${scope.projectId}\u0000${scope.userId}`;
}

export class CreativeOperationRegistry {
  readonly #canonical = new Map<string, OperationDescriptor>();
  readonly #scoped = new Map<string, Map<string, OperationDescriptor>>();

  constructor(descriptors: readonly OperationDescriptor[] = canonicalOperationDescriptors) {
    for (const descriptor of descriptors) {
      this.#registerInto(this.#canonical, descriptor);
    }
  }

  register(descriptor: OperationDescriptor, scope: OperationScope): OperationDescriptor {
    const key = scopeKey(scope);
    const entries = this.#scoped.get(key) ?? new Map<string, OperationDescriptor>();
    const registered = this.#registerInto(entries, descriptor);
    this.#scoped.set(key, entries);
    return registered;
  }

  get(operationId: string, scope?: OperationScope): OperationDescriptor | undefined {
    const scoped = scope ? this.#scoped.get(scopeKey(scope))?.get(operationId) : undefined;
    return scoped ?? this.#canonical.get(operationId);
  }

  has(operationId: string, scope?: OperationScope): boolean {
    return this.get(operationId, scope) !== undefined;
  }

  list(scope?: OperationScope): readonly OperationDescriptor[] {
    const combined = new Map(this.#canonical);
    if (scope) {
      for (const [id, descriptor] of this.#scoped.get(scopeKey(scope)) ?? []) {
        combined.set(id, descriptor);
      }
    }
    return Object.freeze([...combined.values()].sort((left, right) => left.operationId.localeCompare(right.operationId)));
  }

  byFamily(category: OperationDescriptor['category'], scope?: OperationScope): readonly OperationDescriptor[] {
    return Object.freeze(this.list(scope).filter((descriptor) => descriptor.category === category));
  }

  #registerInto(target: Map<string, OperationDescriptor>, descriptor: OperationDescriptor): OperationDescriptor {
    if (!descriptor.operationId || !descriptor.version) {
      throw new Error('Operation descriptor requires operationId and version');
    }
    if (target.has(descriptor.operationId)) {
      throw new Error(`Duplicate operation: ${descriptor.operationId}`);
    }
    const immutable = immutableOperationClone(descriptor) as OperationDescriptor;
    target.set(immutable.operationId, immutable);
    return immutable;
  }
}

function assertScope(scope: OperationScope): void {
  if (!scope.tenantId || !scope.projectId || !scope.userId) {
    throw new Error('tenantId, projectId and userId are required');
  }
}
