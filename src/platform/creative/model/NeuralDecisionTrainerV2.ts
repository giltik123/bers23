import { CompactNeuralDecisionRankerV2 } from './CompactNeuralDecisionRankerV2';
import { DecisionRankingDatasetBuilderV2 } from './DecisionRankingDatasetBuilderV2';
import { immutable } from './immutable';
import type { DecisionDatasetRecord } from './types';
export class NeuralDecisionTrainerV2 {
  constructor(private readonly builder = new DecisionRankingDatasetBuilderV2()) {}
  train(records: readonly DecisionDatasetRecord[], config: { version?: string; epochs?: number; learningRate?: number } = {}) { if (records.length < 2) throw new Error('Neural ranking training requires at least two records'); const pairwise = this.builder.pairwise(records), listwise = this.builder.listwise(records); const model = CompactNeuralDecisionRankerV2.train(pairwise, listwise, { ...config, records }); return immutable({ model, examples: { absolute: records.length, pairwise: pairwise.length, listwise: listwise.length }, objective: ['multitask', 'pairwise', 'listwise'] as const }); }
}
