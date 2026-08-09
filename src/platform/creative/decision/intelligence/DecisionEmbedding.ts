import { immutable } from "./immutable";
import type { DecisionFeatures, DecisionVector } from "./advancedTypes";

export class DecisionEmbedding {
  embed(features: DecisionFeatures): DecisionVector {
    const keys = Object.keys(features.values).sort();
    const active = Math.max(features.labels.length, 1);
    return immutable({ dimensions: keys.map((key, index) => Math.min(1, features.values[key] * .75 + ((index + 1) % 5) * .05 / active)) });
  }
  similarity(left: DecisionVector, right: DecisionVector): number {
    const size = Math.min(left.dimensions.length, right.dimensions.length);
    let dot = 0; let leftNorm = 0; let rightNorm = 0;
    for (let index = 0; index < size; index += 1) { dot += left.dimensions[index] * right.dimensions[index]; leftNorm += left.dimensions[index] ** 2; rightNorm += right.dimensions[index] ** 2; }
    return leftNorm && rightNorm ? dot / Math.sqrt(leftNorm * rightNorm) : 0;
  }
}
