import { immutable, round } from './immutable';
import type { DecisionRepresentation, DistilledModelArtifact, NeuralDecisionRanker } from './v2-types';

export interface DistillationDependencies { readonly now?: () => number }

export class DecisionModelDistiller {
  constructor(private readonly dependencies: DistillationDependencies = {}) {}

  distill(teacher: NeuralDecisionRanker, representations: readonly DecisionRepresentation[], studentVersion = 'compact-student-v1'): DistilledModelArtifact {
    if (!representations.length) throw new Error('Distillation requires representations');
    const size = representations[0].values.length;
    if (representations.some((item) => item.values.length !== size)) throw new Error('Representation size mismatch');
    const weights = Array(size).fill(0) as number[];
    let bias = 0;
    const learningRate = 0.01;
    for (let epoch = 0; epoch < 80; epoch++) for (const representation of representations) {
      const target = teacher.score(representation);
      const prediction = weights.reduce((sum, weight, index) => sum + weight * representation.values[index], bias);
      const error = prediction - target;
      weights.forEach((weight, index) => { weights[index] = weight - learningRate * error * representation.values[index]; });
      bias -= learningRate * error;
    }
    const error = representations.reduce((sum, representation) => {
      const predicted = weights.reduce((value, weight, index) => value + weight * representation.values[index], bias);
      return sum + Math.abs(predicted - teacher.score(representation));
    }, 0) / representations.length;
    return immutable({ teacherVersion: teacher.version(), studentVersion, samples: representations.length,
      fidelity: round(Math.max(0, 1 - error)), weights: immutable([...weights, bias].map(round)), createdAt: this.dependencies.now?.() ?? 0 });
  }
}
