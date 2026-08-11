import { clamp, immutable } from "./immutable";
import type { CognitionDependencies, IntelligenceScope } from "./CreativeCognitionV4";

export interface CreativeDecisionSignal extends IntelligenceScope {
  readonly id: string;
  readonly intents: Readonly<Record<string, number>>;
  readonly operations: readonly string[];
  readonly quality: number;
  readonly accepted: boolean;
  readonly createdAt: number;
}

export interface CreativeCluster extends IntelligenceScope {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly centroid: Readonly<Record<string, number>>;
  readonly typicalOperations: readonly string[];
  readonly acceptanceRate: number;
  readonly averageQuality: number;
  readonly firstSeenAt: number;
  readonly lastSeenAt: number;
}

const sameScope = (left: IntelligenceScope, right: IntelligenceScope) => left.userId === right.userId &&
  left.tenantId === right.tenantId && left.projectId === right.projectId;
const average = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export class CreativeMemoryCompression {
  constructor(private readonly dependencies: Pick<CognitionDependencies, "createId">) {}

  compress(scope: IntelligenceScope, signals: readonly CreativeDecisionSignal[]): readonly CreativeCluster[] {
    const scoped = signals.filter((signal) => sameScope(signal, scope));
    const groups = new Map<string, CreativeDecisionSignal[]>();
    scoped.forEach((signal) => {
      const label = Object.entries(signal.intents).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? "Unknown";
      groups.set(label, [...(groups.get(label) ?? []), signal]);
    });
    return immutable([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, entries]) => {
      const dimensions = [...new Set(entries.flatMap(({ intents }) => Object.keys(intents)))].sort();
      const operationFrequency = new Map<string, number>();
      entries.flatMap(({ operations }) => operations).forEach((operation) => operationFrequency.set(operation, (operationFrequency.get(operation) ?? 0) + 1));
      return immutable({ ...structuredClone(scope), id: this.dependencies.createId(), label,
        count: entries.length, centroid: Object.fromEntries(dimensions.map((key) => [key, average(entries.map(({ intents }) => intents[key] ?? 0))])),
        typicalOperations: [...operationFrequency].filter(([, frequency]) => frequency >= entries.length / 2).map(([operation]) => operation).sort(),
        acceptanceRate: entries.filter(({ accepted }) => accepted).length / entries.length, averageQuality: average(entries.map(({ quality }) => quality)),
        firstSeenAt: Math.min(...entries.map(({ createdAt }) => createdAt)), lastSeenAt: Math.max(...entries.map(({ createdAt }) => createdAt)) });
    }));
  }
}

export interface CreativeDrift {
  readonly detected: boolean;
  readonly from: string;
  readonly to: string;
  readonly magnitude: number;
  readonly confidence: number;
  readonly explanation: string;
}

export class DecisionDriftDetector {
  detect(scope: IntelligenceScope, signals: readonly CreativeDecisionSignal[], splitAt: number): CreativeDrift {
    const scoped = signals.filter((signal) => sameScope(signal, scope));
    const dominant = (items: readonly CreativeDecisionSignal[]) => {
      const totals = new Map<string, number>();
      items.forEach(({ intents }) => Object.entries(intents).forEach(([key, value]) => totals.set(key, (totals.get(key) ?? 0) + value)));
      return [...totals].map(([key, total]) => [key, total / Math.max(1, items.length)] as const).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? ["Unknown", 0] as const;
    };
    const before = dominant(scoped.filter(({ createdAt }) => createdAt < splitAt));
    const after = dominant(scoped.filter(({ createdAt }) => createdAt >= splitAt));
    const magnitude = before[0] === after[0] ? Math.abs(after[1] - before[1]) : clamp((before[1] + after[1]) / 2);
    return immutable({ detected: before[0] !== after[0] && magnitude >= 0.4, from: before[0], to: after[0], magnitude,
      confidence: clamp(Math.min(scoped.length / 20, 1) * magnitude), explanation: `${before[0]} → ${after[0]}` });
  }
}

export interface ConsistencyConstraint {
  readonly id: string;
  readonly objective: "COST" | "QUALITY" | "SPEED" | "VARIETY" | "RISK";
  readonly direction: "MINIMIZE" | "MAXIMIZE";
  readonly intensity: number;
}
export interface DecisionConflictV4 {
  readonly leftId: string;
  readonly rightId: string;
  readonly severity: "WARNING" | "BLOCKING";
  readonly explanation: string;
}

export class DecisionConsistencyAnalyzer {
  analyze(constraints: readonly ConsistencyConstraint[]): readonly DecisionConflictV4[] {
    const conflicts: DecisionConflictV4[] = [];
    const pairs: readonly [ConsistencyConstraint["objective"], ConsistencyConstraint["objective"], string][] = [
      ["COST", "QUALITY", "Minimum cost conflicts with maximum quality"],
      ["COST", "VARIETY", "Minimum cost conflicts with maximum variant count"],
      ["SPEED", "QUALITY", "Maximum speed can conflict with maximum quality"],
      ["RISK", "VARIETY", "Minimum risk conflicts with broad exploration"],
    ];
    pairs.forEach(([leftObjective, rightObjective, explanation]) => {
      const left = constraints.find(({ objective, direction }) => objective === leftObjective && direction === "MINIMIZE");
      const right = constraints.find(({ objective, direction }) => objective === rightObjective && direction === "MAXIMIZE");
      if (left && right) conflicts.push(immutable({ leftId: left.id, rightId: right.id,
        severity: left.intensity + right.intensity >= 1.5 ? "BLOCKING" : "WARNING", explanation }));
    });
    return immutable(conflicts);
  }
}

export interface DecisionEvolutionNode extends IntelligenceScope {
  readonly id: string;
  readonly parentId?: string;
  readonly idea: string;
  readonly operation: string;
  readonly createdAt: number;
  readonly generation: number;
}

export class DecisionEvolutionTreeV4 {
  private nodes: readonly DecisionEvolutionNode[] = immutable([]);
  constructor(private readonly dependencies: CognitionDependencies) {}

  add(scope: IntelligenceScope, idea: string, operation: string, parentId?: string): DecisionEvolutionNode {
    const parent = parentId ? this.nodes.find((node) => node.id === parentId && sameScope(node, scope)) : undefined;
    if (parentId && !parent) throw new Error("Parent does not exist in this scope");
    const node = immutable({ ...structuredClone(scope), id: this.dependencies.createId(), parentId, idea, operation,
      createdAt: this.dependencies.now(), generation: parent ? parent.generation + 1 : 1 });
    this.nodes = immutable([...this.nodes, node]);
    return node;
  }

  lineage(id: string, scope: IntelligenceScope): readonly DecisionEvolutionNode[] {
    const result: DecisionEvolutionNode[] = [];
    let cursor = this.nodes.find((node) => node.id === id && sameScope(node, scope));
    while (cursor) {
      result.unshift(cursor);
      cursor = cursor.parentId ? this.nodes.find((node) => node.id === cursor!.parentId && sameScope(node, scope)) : undefined;
    }
    return immutable(structuredClone(result));
  }
}

export interface MetaKnowledgeRule {
  readonly id: string;
  readonly antecedent: string;
  readonly consequent: string;
  readonly confidence: number;
  readonly evidence: number;
}

export class CreativeMetaKnowledge {
  private rules: readonly MetaKnowledgeRule[] = immutable([]);

  learn(rule: MetaKnowledgeRule): MetaKnowledgeRule {
    const current = this.rules.find(({ antecedent, consequent }) => antecedent === rule.antecedent && consequent === rule.consequent);
    const next = current ? immutable({ ...rule, id: current.id, evidence: current.evidence + rule.evidence,
      confidence: clamp((current.confidence * current.evidence + rule.confidence * rule.evidence) / (current.evidence + rule.evidence)) }) : immutable(structuredClone(rule));
    this.rules = immutable([...this.rules.filter((item) => item !== current), next]
      .sort((a, b) => a.antecedent.localeCompare(b.antecedent) || b.confidence - a.confidence || a.consequent.localeCompare(b.consequent)));
    return next;
  }

  infer(concept: string, depth = 4): readonly MetaKnowledgeRule[] {
    const result: MetaKnowledgeRule[] = [];
    let frontier = [concept];
    const visited = new Set(frontier);
    for (let index = 0; index < depth; index += 1) {
      const next: string[] = [];
      this.rules.filter(({ antecedent }) => frontier.includes(antecedent)).forEach((rule) => {
        result.push(rule);
        if (!visited.has(rule.consequent)) { visited.add(rule.consequent); next.push(rule.consequent); }
      });
      frontier = next;
    }
    return immutable(structuredClone(result));
  }
}

export class DecisionSelfReflection {
  reflect(input: { readonly selected: { readonly id: string; readonly quality: number; readonly cost: number; readonly latency: number };
    readonly alternatives: readonly { readonly id: string; readonly quality: number; readonly cost: number; readonly latency: number }[];
    readonly predictionError: number; readonly unexpected: readonly string[] }) {
    const cheaper = [...input.alternatives].filter(({ cost }) => cost < input.selected.cost).sort((a, b) => a.cost - b.cost)[0];
    const faster = [...input.alternatives].filter(({ latency }) => latency < input.selected.latency).sort((a, b) => a.latency - b.latency)[0];
    return immutable({ decisionId: input.selected.id,
      weakestPoint: input.predictionError > 0.2 ? "PREDICTION_ACCURACY" : input.selected.quality < 0.7 ? "QUALITY" : "NONE",
      cheaperAlternative: cheaper?.id, fasterAlternative: faster?.id, unexpected: [...input.unexpected],
      remember: input.unexpected.length ? `Unexpected: ${input.unexpected.join(", ")}` : `Prediction error: ${input.predictionError.toFixed(3)}` });
  }
}
