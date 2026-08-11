import { clamp, immutable } from "./immutable";

export interface IntelligenceScope {
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
}

export interface IntentEvidence {
  readonly intent: string;
  readonly confidence: number;
  readonly evidence: readonly string[];
}

const TOKENS: Readonly<Record<string, readonly string[]>> = immutable({
  Luxury: ["luxury", "premium", "люкс", "премиум"],
  Catalog: ["catalog", "product", "каталог", "товар"],
  Minimal: ["minimal", "clean", "минимал", "чист"],
  Instagram: ["instagram", "social", "инстаграм", "соцсет"],
  Portrait: ["portrait", "face", "портрет", "лицо"],
});

export class CreativeIntentSpace {
  analyze(prompt: string): readonly IntentEvidence[] {
    const normalized = prompt.toLowerCase();
    const distribution = Object.entries(TOKENS).map(([intent, tokens]) => {
      const matches = tokens.filter((token) => normalized.includes(token));
      return immutable({
        intent,
        confidence: clamp(matches.length ? 0.35 + matches.length * 0.28 : 0.05),
        evidence: matches,
      });
    });
    return immutable(distribution.sort((a, b) => b.confidence - a.confidence || a.intent.localeCompare(b.intent)));
  }
}

export interface CreativeGoalNode {
  readonly id: string;
  readonly goal: string;
  readonly level: "BUSINESS" | "USER" | "CREATIVE" | "VISUAL" | "OPERATIONAL";
  readonly importance: number;
  readonly children: readonly CreativeGoalNode[];
}

export class CreativeGoalHierarchy {
  constructor(private readonly dependencies: Pick<CognitionDependencies, "createId">) {}

  build(path: readonly { readonly goal: string; readonly level: CreativeGoalNode["level"]; readonly importance?: number }[]): CreativeGoalNode {
    if (!path.length) throw new Error("A goal hierarchy requires at least one goal");
    let child: CreativeGoalNode | undefined;
    for (let index = path.length - 1; index >= 0; index -= 1) {
      const item = path[index];
      child = immutable({
        id: this.dependencies.createId(),
        goal: item.goal,
        level: item.level,
        importance: clamp(item.importance ?? 1 - index * 0.1),
        children: child ? [child] : [],
      });
    }
    return child!;
  }

  flatten(root: CreativeGoalNode): readonly CreativeGoalNode[] {
    const result: CreativeGoalNode[] = [];
    const visit = (node: CreativeGoalNode) => {
      result.push(node);
      node.children.forEach(visit);
    };
    visit(root);
    return immutable(structuredClone(result));
  }
}

export type WorldAttribute = "background" | "face" | "lighting" | "objects" | "style" | "camera" |
  "quality" | "noise" | "composition" | "colorBalance" | "visualHierarchy";
export interface WorldObservation {
  readonly value: string | number | boolean;
  readonly confidence: number;
  readonly source: "OBSERVATION" | "USER" | "KNOWLEDGE" | "INFERENCE";
}
export interface CreativeWorldState extends IntelligenceScope {
  readonly id: string;
  readonly attributes: Readonly<Partial<Record<WorldAttribute, WorldObservation>>>;
  readonly createdAt: number;
}

export interface CognitionDependencies {
  readonly createId: () => string;
  readonly now: () => number;
}

export class CreativeWorldStateFactory {
  constructor(private readonly dependencies: CognitionDependencies) {}

  create(scope: IntelligenceScope, attributes: CreativeWorldState["attributes"]): CreativeWorldState {
    return immutable({
      ...structuredClone(scope),
      id: this.dependencies.createId(),
      attributes: structuredClone(attributes),
      createdAt: this.dependencies.now(),
    });
  }

  update(state: CreativeWorldState, changes: CreativeWorldState["attributes"]): CreativeWorldState {
    return immutable({
      ...structuredClone(state),
      id: this.dependencies.createId(),
      attributes: { ...structuredClone(state.attributes), ...structuredClone(changes) },
      createdAt: this.dependencies.now(),
    });
  }
}

export interface CreativeGap {
  readonly attribute: WorldAttribute;
  readonly current?: WorldObservation;
  readonly desired: WorldObservation;
  readonly magnitude: number;
  readonly explanation: string;
}

export class CreativeGapAnalyzer {
  analyze(current: CreativeWorldState, desired: CreativeWorldState): readonly CreativeGap[] {
    if (current.userId !== desired.userId || current.tenantId !== desired.tenantId || current.projectId !== desired.projectId) {
      throw new Error("World states must belong to the same scope");
    }
    return immutable((Object.entries(desired.attributes) as [WorldAttribute, WorldObservation][])
      .map(([attribute, target]) => {
        const source = current.attributes[attribute];
        const magnitude = source?.value === target.value ? 0 : clamp(target.confidence * (source ? 0.75 : 1));
        return immutable({ attribute, current: source, desired: target, magnitude,
          explanation: source ? `${attribute}: ${String(source.value)} → ${String(target.value)}` : `${attribute}: unknown → ${String(target.value)}` });
      })
      .filter(({ magnitude }) => magnitude > 0)
      .sort((a, b) => b.magnitude - a.magnitude || a.attribute.localeCompare(b.attribute)));
  }
}

export interface CreativePlanStep {
  readonly id: string;
  readonly operation: string;
  readonly kind: "OPERATION" | "QUALITY_CHECK" | "CONDITION" | "FINISH";
  readonly dependsOn: readonly string[];
  readonly children: readonly CreativePlanStep[];
  readonly localOnly: boolean;
  readonly explanation: string;
}
export interface CreativeExecutionPlan extends IntelligenceScope {
  readonly id: string;
  readonly goalId: string;
  readonly steps: readonly CreativePlanStep[];
  readonly createdAt: number;
}

export class CreativePlanBuilder {
  constructor(private readonly dependencies: CognitionDependencies) {}

  build(scope: IntelligenceScope, goalId: string, gaps: readonly CreativeGap[]): CreativeExecutionPlan {
    const steps: CreativePlanStep[] = [];
    gaps.forEach((gap) => {
      steps.push(immutable({
        id: this.dependencies.createId(), operation: gap.attribute, kind: "OPERATION", localOnly: true,
        dependsOn: steps.length ? [steps.at(-1)!.id] : [], children: [], explanation: gap.explanation,
      }));
    });
    const qualityCheckId = this.dependencies.createId();
    steps.push(immutable({ id: qualityCheckId, operation: "quality_check", kind: "QUALITY_CHECK", localOnly: true,
      dependsOn: steps.length ? [steps.at(-1)!.id] : [], children: [], explanation: "Validate desired world state" }));
    steps.push(immutable({ id: this.dependencies.createId(), operation: "ai_if_gap_remains", kind: "CONDITION", localOnly: false,
      dependsOn: [qualityCheckId], children: [], explanation: "AI is optional and only justified by a remaining gap" }));
    steps.push(immutable({ id: this.dependencies.createId(), operation: "finish", kind: "FINISH", localOnly: true,
      dependsOn: [steps.at(-1)!.id], children: [], explanation: "Finish after validation" }));
    return immutable({ ...structuredClone(scope), id: this.dependencies.createId(), goalId, steps, createdAt: this.dependencies.now() });
  }
}
