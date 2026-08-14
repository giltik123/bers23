import { immutableClone } from '../immutable';
import type { Scope } from '../types';
const scopeKey = (scope: Scope) => `${scope.tenantId}\u0000${scope.projectId}\u0000${scope.userId}`;
export class LocalInferenceCache {
  readonly #entries = new Map<string, Readonly<{ kind: string; value: unknown; expiresAt: number }>>();
  constructor(private readonly clock: () => number) {}
  set(scope: Scope, key: string, kind: 'embedding' | 'mask' | 'segmentation' | 'analysis' | 'tensor', value: unknown, ttlMs: number): void { this.#entries.set(`${scopeKey(scope)}\u0000${key}`, immutableClone({ kind, value, expiresAt: this.clock() + ttlMs })); }
  get(scope: Scope, key: string): unknown { const entry = this.#entries.get(`${scopeKey(scope)}\u0000${key}`); if (!entry) return undefined; if (entry.expiresAt <= this.clock()) { this.delete(scope, key); return undefined; } return entry.value; }
  delete(scope: Scope, key: string): void { this.#entries.delete(`${scopeKey(scope)}\u0000${key}`); }
  clearScope(scope: Scope): void { const prefix = `${scopeKey(scope)}\u0000`; for (const key of this.#entries.keys()) if (key.startsWith(prefix)) this.#entries.delete(key); }
}
