import { immutable } from './immutable';
import type { DependencyNode, PluginRegistration } from './types';
export class IntelligenceDependencyGraph {
  build(registrations: readonly PluginRegistration[]): readonly DependencyNode[] { const ids = new Set(registrations.map((item) => item.plugin.id)); const nodes = registrations.map((item) => ({ pluginId: item.plugin.id, dependencyIds: [...item.plugin.dependencies] })); for (const node of nodes) for (const dependency of node.dependencyIds) if (!ids.has(dependency)) throw new Error(`Unknown plugin dependency ${dependency}`); this.topological(nodes); return immutable(nodes); }
  topological(nodes: readonly DependencyNode[]): readonly string[] { const dependencies = new Map(nodes.map((node) => [node.pluginId, new Set(node.dependencyIds)])); const ordered: string[] = []; while (dependencies.size) { const ready = [...dependencies].filter(([, values]) => values.size === 0).map(([id]) => id).sort(); if (!ready.length) throw new Error('Intelligence dependency cycle detected'); for (const id of ready) { ordered.push(id); dependencies.delete(id); for (const values of dependencies.values()) values.delete(id); } } return immutable(ordered); }
}
