import type { EditOperation, QualityEstimate } from './types';

export class CreativeQualityEstimator {
  estimate(beforeQuality: number, operations: EditOperation[], threshold = 0.75): QualityEstimate {
    const localGain = operations.filter((operation) => operation.mode === 'LOCAL').length * 0.065;
    const aiGain = operations.filter((operation) => operation.mode === 'AI').length * 0.12;
    const afterQuality = Math.min(1, Number((beforeQuality + localGain + aiGain).toFixed(2)));
    return {
      beforeQuality,
      afterQuality,
      confidence: operations.some((operation) => operation.mode === 'AI') ? 0.82 : 0.76,
      recommendation: afterQuality >= threshold ? 'SKIP_AI' : 'ESCALATE_TO_AI',
    };
  }
}
