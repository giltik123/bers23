/** A discoverable capability and its routing relationships. */
export interface CapabilityNode {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly providers: readonly string[];
  readonly dependencies: readonly string[];
  readonly priority: number;
  /** Relative credit estimate used when comparing routes. */
  readonly cost: number;
  /** Whether this capability may currently be planned. */
  readonly availability: 'available' | 'degraded' | 'unavailable';
  readonly enabled: boolean;
}

/** Directed capability graph used to expand requirements and order execution. */
export class CapabilityGraph {
  private readonly nodes = new Map<string, CapabilityNode>();

  constructor(nodes: readonly CapabilityNode[] = []) { for (const node of nodes) this.add(node); }

  /** Adds or replaces one immutable capability node. */
  add(node: CapabilityNode): void {
    this.nodes.set(node.id, Object.freeze({ ...node, providers: Object.freeze([...node.providers]), dependencies: Object.freeze([...node.dependencies]) }));
  }

  /** Returns a capability node by ID. */
  get(id: string): CapabilityNode | undefined { return this.nodes.get(id); }

  /** Returns all graph nodes in priority order. */
  getAll(): readonly CapabilityNode[] { return [...this.nodes.values()].sort((left, right) => right.priority - left.priority); }

  /** Expands requested capabilities with enabled transitive dependencies. */
  expand(capabilities: readonly string[]): readonly string[] {
    const result: string[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      if (visiting.has(id)) throw new Error(`Circular capability dependency detected at "${id}".`);
      visiting.add(id);
      const node = this.nodes.get(id);
      if (!node || node.enabled) {
        result.push(id);
        for (const dependency of node?.dependencies ?? []) visit(dependency);
      }
      visiting.delete(id);
      visited.add(id);
    };
    for (const capability of capabilities) visit(capability);
    return result;
  }

  /** Returns dependency-first execution order for requested capabilities. */
  executionOrder(capabilities: readonly string[]): readonly string[] {
    const result: string[] = [];
    const visited = new Set<string>();
    const visit = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      const node = this.nodes.get(id);
      for (const dependency of node?.dependencies ?? []) visit(dependency);
      if (!node || node.enabled) result.push(id);
    };
    for (const capability of capabilities) visit(capability);
    return result;
  }
}

/** Creates the standard routing graph without importing business modules. */
export function createDefaultCapabilityGraph(): CapabilityGraph {
  const node = (id: string, name: string, category: string, priority: number, providers: readonly string[] = [], dependencies: readonly string[] = [], cost = 0): CapabilityNode => ({ id, name, category, priority, providers, dependencies, cost, availability: 'available', enabled: true });
  return new CapabilityGraph([
    node('virtual-try-on', 'Virtual Try On', 'fashion', 90, ['fashn'], ['garment-processing', 'person-analysis'], 20),
    node('garment-processing', 'Garment Processing', 'fashion', 80, ['fashn'], [], 8),
    node('person-analysis', 'Person Analysis', 'analysis', 80, ['sam3'], [], 2),
    node('face-editing', 'Face Editing', 'editing', 85, ['reve'], [], 12),
    node('identity-preservation', 'Identity Preservation', 'consistency', 85),
    node('scene-memory', 'Scene Memory', 'consistency', 80),
    node('image-edit', 'Image Edit', 'editing', 80, ['reve'], [], 10),
    node('background-edit', 'Background Edit', 'editing', 80, ['reve'], [], 10),
    node('scene-consistency', 'Scene Consistency', 'consistency', 75),
    node('person-preservation', 'Person Preservation', 'consistency', 75),
  ]);
}
