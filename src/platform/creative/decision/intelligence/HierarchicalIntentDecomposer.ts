import { immutable } from "./immutable";
import type { DecomposedIntent } from "./refinementTypes";

interface IntentRule { readonly tokens: readonly string[]; readonly primary: string; readonly secondary: string; readonly goals: readonly string[]; readonly operations: readonly string[] }
const rules: readonly IntentRule[] = [
  { tokens: ["дорог", "luxury", "преми"], primary: "LUXURY", secondary: "BRAND_PRESENTATION", goals: ["premium_lighting", "brand_consistency"], operations: ["lighting", "contrast", "color_balance"] },
  { tokens: ["каталог", "catalog"], primary: "COMMERCIAL", secondary: "CATALOG", goals: ["product_clarity", "clean_composition"], operations: ["exposure", "white_balance", "background"] },
  { tokens: ["одежд", "try-on", "fashion"], primary: "FASHION", secondary: "TRY_ON", goals: ["garment_realism"], operations: ["segmentation", "ai:try-on"] },
  { tokens: ["портрет", "portrait"], primary: "PORTRAIT", secondary: "RETOUCH", goals: ["natural_skin", "face_clarity"], operations: ["skin_correction", "lighting"] },
];

export class HierarchicalIntentDecomposer {
  decompose(prompt: string): DecomposedIntent {
    const normalized = prompt.toLocaleLowerCase();
    const matches = rules.filter(({ tokens }) => tokens.some((token) => normalized.includes(token)));
    const primary = matches[0]?.primary ?? "GENERAL_ENHANCEMENT";
    return immutable({ primaryIntent: primary, secondaryIntents: [...new Set(matches.map(({ secondary }) => secondary))],
      creativeGoals: [...new Set(matches.flatMap(({ goals }) => goals))], operations: [...new Set(matches.flatMap(({ operations }) => operations))],
      confidence: Math.min(.96, matches.length ? .68 + matches.length * .09 : .42) });
  }
}
