import { immutable } from './immutable';
import type { IntelligencePlugin } from '../kernel';
import type { ExecutionNode, RuntimeDependencies, RuntimeExecutionGraph } from './types';

export class RuntimeExecutionGraphBuilder {
  constructor(private readonly dependencies: RuntimeDependencies) {}
  build(plugins: readonly IntelligencePlugin[]): RuntimeExecutionGraph {
    const core: ExecutionNode[] = [
      this.node('GOAL', [], [], 'goal'), this.node('INTENT', ['goal'], [], 'intent'), this.node('HYPOTHESIS', ['intent'], [], 'hypothesis'),
      this.node('DEBATE', ['hypothesis'], ['DEBATE'], 'debate'), this.node('SIMULATION', ['hypothesis'], ['SIMULATION'], 'simulation'),
      this.node('REFLECTION', ['debate', 'simulation'], ['REFLECTION'], 'reflection'), this.node('DECISION', ['reflection'], ['RANKING'], 'decision'), this.node('COMMIT', ['decision'], [], 'commit'),
    ];
    const pluginNodes = plugins.map((plugin) => {
      const inputKeys = plugin.capabilities.includes('COST') ? ['budget'] : plugin.capabilities.includes('SIMULATION') ? ['hypothesis', 'budget'] : ['intent'];
      return immutable({ id: `plugin:${plugin.id}`, kind: 'PLUGIN' as const, pluginId: plugin.id, dependencyIds: plugin.dependencies.map((id) => `plugin:${id}`), requiredCapabilities: [...plugin.capabilities], inputKeys, outputKey: `plugin.${plugin.id}`, status: 'PENDING' as const });
    });
    return immutable({ id: this.dependencies.nextId(), nodes: [...core, ...pluginNodes] });
  }
  private node(kind: ExecutionNode['kind'], dependencies: readonly string[], capabilities: readonly string[], outputKey: string): ExecutionNode { return immutable({ id: kind.toLowerCase(), kind, dependencyIds: dependencies, requiredCapabilities: capabilities, inputKeys: dependencies, outputKey, status: 'PENDING' }); }
}
export class RuntimeInvariantValidator {
  validateGraph(graph: RuntimeExecutionGraph): void { const ids = new Set(graph.nodes.map((node) => node.id)); if (ids.size !== graph.nodes.length) throw new Error('Duplicated execution node'); for (const node of graph.nodes) for (const dependency of node.dependencyIds) if (!ids.has(dependency)) throw new Error(`Orphan execution dependency ${dependency}`); this.topological(graph); }
  topological(graph: RuntimeExecutionGraph): readonly string[] { const pending = new Map(graph.nodes.map((node) => [node.id, new Set(node.dependencyIds)])); const order: string[] = []; while (pending.size) { const ready = [...pending].filter(([, dependencies]) => dependencies.size === 0).map(([id]) => id).sort(); if (!ready.length) throw new Error('Runtime execution graph contains a cycle'); for (const id of ready) { pending.delete(id); order.push(id); for (const dependencies of pending.values()) dependencies.delete(id); } } return immutable(order); }
  validateEvents(events: readonly { id: string; sequence: number }[]): void { const ids = new Set(events.map((event) => event.id)); if (ids.size !== events.length) throw new Error('Duplicated runtime event'); if (events.some((event, index) => event.sequence !== index)) throw new Error('Invalid runtime event sequence'); }
  validateBlackboard(entries: readonly { revision: number; key: string }[]): void { if (entries.some((entry, index) => entry.revision !== index + 1 || !entry.key)) throw new Error('Invalid runtime blackboard state'); }
}
