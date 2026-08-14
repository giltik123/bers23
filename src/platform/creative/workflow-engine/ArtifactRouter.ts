import { immutableClone } from './immutable'; import type { Artifact, Scope } from './types';
const scopeKey = (scope: Scope) => `${scope.tenantId}\u0000${scope.projectId}\u0000${scope.userId}`;
export class ArtifactRouter {
  readonly #artifacts = new Map<string, Map<string, Artifact>>();
  put(artifact: Artifact): Artifact { const frozen = immutableClone(artifact) as Artifact; const bucket = this.#artifacts.get(scopeKey(artifact.scope)) ?? new Map<string, Artifact>(); bucket.set(artifact.id, frozen); this.#artifacts.set(scopeKey(artifact.scope), bucket); return frozen; }
  get(id: string, scope: Scope): Artifact | undefined { return this.#artifacts.get(scopeKey(scope))?.get(id); }
  route(ids: readonly string[], scope: Scope): readonly Artifact[] { return Object.freeze(ids.map((id) => this.get(id, scope)).filter(Boolean) as Artifact[]); }
  list(scope: Scope): readonly Artifact[] { return immutableClone([...(this.#artifacts.get(scopeKey(scope))?.values() ?? [])]); }
}
