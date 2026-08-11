import { clamp, immutable } from "./immutable";
import type { CognitionDependencies, CreativeGap, CreativeWorldState, IntelligenceScope, WorldAttribute } from "./CreativeCognitionV4";

export interface CreativeHypothesis {
  readonly id: string;
  readonly intervention: string;
  readonly consequence: string;
  readonly confidence: number;
  readonly probability: number;
  readonly expectedGain: number;
  readonly evidence: readonly string[];
}

export class CreativeHypothesisEngine {
  constructor(private readonly dependencies: Pick<CognitionDependencies, "createId">) {}

  generate(gaps: readonly CreativeGap[]): readonly CreativeHypothesis[] {
    return immutable(gaps.map((gap) => immutable({
      id: this.dependencies.createId(),
      intervention: `improve_${gap.attribute}`,
      consequence: `${gap.attribute}_gap_reduced`,
      confidence: clamp((gap.current?.confidence ?? 0.4) * 0.4 + gap.desired.confidence * 0.6),
      probability: clamp(0.45 + gap.magnitude * 0.45),
      expectedGain: clamp(gap.magnitude * gap.desired.confidence),
      evidence: [gap.explanation],
    })).sort((a, b) => b.expectedGain - a.expectedGain || a.id.localeCompare(b.id)));
  }
}

export interface VirtualExperiment {
  readonly id: string;
  readonly label: string;
  readonly strategy: readonly string[];
  readonly hypothesisIds: readonly string[];
  readonly predictedQuality: number;
  readonly predictedCost: number;
  readonly predictedLatency: number;
  readonly utility: number;
}

export class DecisionExperimentEngine {
  constructor(private readonly dependencies: Pick<CognitionDependencies, "createId">) {}

  design(hypotheses: readonly CreativeHypothesis[], count = 4): readonly VirtualExperiment[] {
    const size = Math.max(4, count);
    return immutable(Array.from({ length: size }, (_, index) => {
      const selected = hypotheses.filter((_, hypothesisIndex) => hypothesisIndex % size <= index);
      const quality = clamp(0.5 + selected.reduce((sum, item) => sum + item.expectedGain, 0) / Math.max(2, selected.length + 1));
      const cost = selected.length * (index % 2);
      return immutable({
        id: this.dependencies.createId(), label: String.fromCharCode(65 + index),
        strategy: selected.map(({ intervention }) => intervention),
        hypothesisIds: selected.map(({ id }) => id), predictedQuality: quality,
        predictedCost: cost, predictedLatency: selected.length * 100,
        utility: clamp(quality - cost * 0.02 - selected.length * 0.005),
      });
    }).sort((a, b) => b.utility - a.utility || a.label.localeCompare(b.label)));
  }
}

export interface CreativeOpportunity {
  readonly id: string;
  readonly attribute: WorldAttribute;
  readonly action: string;
  readonly reason: string;
  readonly local: boolean;
  readonly avoidedCost: number;
  readonly confidence: number;
}

export class CreativeOpportunityDetectorV4 {
  constructor(private readonly dependencies: Pick<CognitionDependencies, "createId">) {}

  detect(state: CreativeWorldState): readonly CreativeOpportunity[] {
    const result: CreativeOpportunity[] = [];
    const add = (attribute: WorldAttribute, action: string, reason: string, avoidedCost: number, confidence: number) => {
      result.push(immutable({ id: this.dependencies.createId(), attribute, action, reason, local: true, avoidedCost, confidence }));
    };
    if (state.attributes.face?.value === "dark") add("face", "local_face_exposure", "Face can be corrected locally", 3, state.attributes.face.confidence);
    if (state.attributes.colorBalance?.value === "cold_skin") add("colorBalance", "local_warmth", "Cold skin tone supports a local correction", 2, state.attributes.colorBalance.confidence);
    if (state.attributes.background?.value === "good") add("background", "preserve_background", "Existing background does not require AI", 6, state.attributes.background.confidence);
    if (typeof state.attributes.noise?.value === "number" && state.attributes.noise.value > 0.5) add("noise", "local_denoise", "Noise can be reduced before escalation", 2, state.attributes.noise.confidence);
    return immutable(result.sort((a, b) => b.avoidedCost - a.avoidedCost || a.id.localeCompare(b.id)));
  }
}

export interface DecisionConfidenceProfile {
  readonly technical: number;
  readonly creative: number;
  readonly goal: number;
  readonly economic: number;
  readonly historical: number;
  readonly preference: number;
  readonly aggregate: number;
  readonly weakest: Exclude<keyof DecisionConfidenceProfile, "aggregate" | "weakest">;
}

export class DecisionConfidenceDecomposer {
  decompose(input: Omit<DecisionConfidenceProfile, "aggregate" | "weakest">): DecisionConfidenceProfile {
    const dimensions = Object.entries(input) as [DecisionConfidenceProfile["weakest"], number][];
    const normalized = Object.fromEntries(dimensions.map(([key, value]) => [key, clamp(value)])) as Omit<DecisionConfidenceProfile, "aggregate" | "weakest">;
    const aggregate = dimensions.reduce((sum, [key]) => sum + normalized[key], 0) / dimensions.length;
    const weakest = dimensions.sort(([leftKey], [rightKey]) => normalized[leftKey] - normalized[rightKey] || leftKey.localeCompare(rightKey))[0][0];
    return immutable({ ...normalized, aggregate, weakest });
  }
}

export type UncertaintyLevel = "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH";
export interface CreativeUncertainty {
  readonly attribute: WorldAttribute;
  readonly score: number;
  readonly level: UncertaintyLevel;
  readonly reason: string;
}

export class CreativeUncertaintyMap {
  build(state: CreativeWorldState): readonly CreativeUncertainty[] {
    const attributes: readonly WorldAttribute[] = ["background", "face", "lighting", "objects", "style", "camera", "quality", "noise", "composition", "colorBalance", "visualHierarchy"];
    return immutable(attributes.map((attribute) => {
      const observation = state.attributes[attribute];
      const score = clamp(1 - (observation?.confidence ?? 0));
      const level: UncertaintyLevel = score >= 0.75 ? "VERY_HIGH" : score >= 0.5 ? "HIGH" : score >= 0.25 ? "MEDIUM" : "LOW";
      return immutable({ attribute, score, level, reason: observation ? `Observation confidence is ${observation.confidence}` : "No observation" });
    }).sort((a, b) => b.score - a.score || a.attribute.localeCompare(b.attribute)));
  }
}

export interface DecisionQuestion {
  readonly id: string;
  readonly text: string;
  readonly attribute?: WorldAttribute;
  readonly choices: readonly string[];
  readonly priority: number;
  readonly reason: string;
}

export class DecisionQuestionGenerator {
  constructor(private readonly dependencies: Pick<CognitionDependencies, "createId">) {}

  generate(uncertainty: readonly CreativeUncertainty[], intents: readonly { readonly intent: string; readonly confidence: number }[]): readonly DecisionQuestion[] {
    const questions: DecisionQuestion[] = uncertainty.filter(({ level }) => level === "HIGH" || level === "VERY_HIGH").slice(0, 3).map((item) => immutable({
      id: this.dependencies.createId(), text: `Please clarify the desired ${item.attribute}.`, attribute: item.attribute,
      choices: ["Preserve", "Improve", "Replace"], priority: item.score, reason: item.reason,
    }));
    const closeIntents = [...intents].sort((a, b) => b.confidence - a.confidence).slice(0, 2);
    if (closeIntents.length === 2 && Math.abs(closeIntents[0].confidence - closeIntents[1].confidence) < 0.2) {
      questions.unshift(immutable({ id: this.dependencies.createId(), text: `Do you prefer ${closeIntents[0].intent} or ${closeIntents[1].intent}?`,
        choices: closeIntents.map(({ intent }) => intent), priority: 1 - Math.abs(closeIntents[0].confidence - closeIntents[1].confidence), reason: "Intent ambiguity" }));
    }
    return immutable(questions);
  }
}

export class CreativeValuePredictor {
  predict(input: { readonly quality: number; readonly goalCompletion: number; readonly audienceFit: number; readonly economicFit: number }, contexts: readonly string[]) {
    const base = clamp(input.quality * 0.3 + input.goalCompletion * 0.3 + input.audienceFit * 0.25 + input.economicFit * 0.15);
    const values = Object.fromEntries([...contexts].sort().map((context) => {
      const multiplier = context.toLowerCase().includes("luxury") ? 1.08 : context.toLowerCase().includes("catalog") ? 1.03 : 1;
      return [context, Math.round(clamp(base * multiplier) * 100)];
    }));
    return immutable({ base: Math.round(base * 100), contexts: values });
  }
}

export type CreativityLevel = "CONSERVATIVE" | "BALANCED" | "CREATIVE" | "EXPERIMENTAL" | "WILD";
export class AdaptiveCreativityLevel {
  select(input: { readonly riskTolerance: number; readonly uncertainty: number; readonly experience: number; readonly exploration: number }): CreativityLevel {
    const score = clamp(input.riskTolerance * 0.35 + input.experience * 0.2 + input.exploration * 0.45 - input.uncertainty * 0.25);
    return score < 0.2 ? "CONSERVATIVE" : score < 0.4 ? "BALANCED" : score < 0.6 ? "CREATIVE" : score < 0.8 ? "EXPERIMENTAL" : "WILD";
  }
}
