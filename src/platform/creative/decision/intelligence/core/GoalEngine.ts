import { clamp, immutable } from "./immutable";
import type { CreativeGoal, GoalCategory, GoalContext, GoalPriority } from "./types";

export interface GoalDependencies { readonly createId: () => string }
interface GoalRule { readonly category: GoalCategory; readonly name: string; readonly tokens: readonly string[]; readonly priority: GoalPriority; readonly quality: number }
const rules: readonly GoalRule[] = [
  { category: "LUXURY", name: "Luxury Brand", tokens: ["дорог", "luxury", "преми"], priority: "HIGH", quality: .95 },
  { category: "CATALOG", name: "Product Catalog", tokens: ["каталог", "catalog", "товар"], priority: "HIGH", quality: .9 },
  { category: "PORTRAIT", name: "Portrait Improvement", tokens: ["портрет", "лицо"], priority: "HIGH", quality: .88 },
  { category: "MARKETING", name: "Marketing Campaign", tokens: ["реклам", "marketing"], priority: "CRITICAL", quality: .92 },
  { category: "SOCIAL_MEDIA", name: "Social Media", tokens: ["instagram", "соцсет"], priority: "MEDIUM", quality: .8 },
  { category: "CREATIVE", name: "Creative Transformation", tokens: ["art", "творч", "cinema"], priority: "MEDIUM", quality: .85 },
];
export class GoalDetector {
  constructor(private readonly dependencies: GoalDependencies) {}
  detect(prompt: string): GoalContext {
    const normalized = prompt.toLocaleLowerCase(); const matches = rules.filter(({ tokens }) => tokens.some((token) => normalized.includes(token)));
    const selected = matches.length ? matches : [{ category: "ENHANCEMENT", name: "General Enhancement", priority: "MEDIUM", quality: .75, tokens: [] } as GoalRule];
    const goals: CreativeGoal[] = selected.map((rule, index) => ({ id: this.dependencies.createId(), category: rule.category,
      name: rule.name, priority: rule.priority, qualityTarget: rule.quality, budgetFlexibility: rule.category === "LUXURY" ? "FLEXIBLE" : "FIXED",
      confidence: clamp(.65 + matches.length * .1 - index * .04) }));
    return immutable({ prompt, goals, primaryGoal: goals[0] });
  }
}
