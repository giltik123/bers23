import { immutableClone } from '../immutable';
import type { InferenceContext, Scope } from '../types';
const forbidden = /api.?key|secret|billing|database|credential|tenant.?registry|filesystem|network|runtime.?state/i;
export class LocalAISandbox {
  create(input: Readonly<{ prompt: string; operation: string; artifacts: readonly Readonly<{ id: string; value: unknown; scope: Scope }>[]; constraints: Readonly<Record<string, unknown>>; capabilities: readonly string[]; parameters: Readonly<Record<string, unknown>>; scope: Scope }>): InferenceContext {
    const artifacts = input.artifacts.filter((item) => sameScope(item.scope, input.scope)).map(({ id, value }) => ({ id, value }));
    if (artifacts.length !== input.artifacts.length) throw new Error('Cross-scope artifact access denied');
    const sanitize = (values: Readonly<Record<string, unknown>>) => Object.fromEntries(Object.entries(values).filter(([key]) => !forbidden.test(key)));
    return immutableClone({ prompt: input.prompt, operation: input.operation, allowedArtifacts: artifacts, sanitizedConstraints: sanitize(input.constraints), allowedCapabilities: input.capabilities, modelParameters: sanitize(input.parameters), scope: input.scope });
  }
  runtimePermissions(networkAllowed = false) { return Object.freeze({ filesystem: false, arbitraryNetwork: false, network: networkAllowed, secrets: false }); }
}
const sameScope = (a: Scope, b: Scope) => a.tenantId === b.tenantId && a.projectId === b.projectId && a.userId === b.userId;
