import { immutable } from "./immutable";
import type { DecisionFeatures } from "./advancedTypes";

const vocabulary = ["portrait", "catalog", "try-on", "luxury", "background", "professional", "dark", "studio", "fashion"] as const;
const aliases: Record<string, readonly string[]> = { portrait: ["портрет"], catalog: ["каталог"], "try-on": ["одежд", "пример"],
  luxury: ["luxury", "дорог", "преми"], background: ["фон"], professional: ["профессион"], dark: ["тёмн", "темн"], studio: ["студи"], fashion: ["fashion", "мод"] };

export class DecisionFeatureExtractor {
  extract(prompt: string, intent = ""): DecisionFeatures {
    const source = `${prompt} ${intent}`.toLocaleLowerCase();
    const values = Object.fromEntries(vocabulary.map((feature) => [feature,
      [feature, ...(aliases[feature] ?? [])].some((token) => source.includes(token)) ? 1 : 0]));
    return immutable({ labels: vocabulary.filter((feature) => values[feature] === 1), values });
  }
}
