import { immutable } from "./immutable";
import type { DecisionDatasetRecord, DecisionVector, SimilarDecision } from "./advancedTypes";

export interface RecordVectorizer { vectorize(record: DecisionDatasetRecord): DecisionVector }
export interface VectorSimilarity { similarity(left: DecisionVector, right: DecisionVector): number }

export class NearestDecisionSearch {
  constructor(private readonly vectorizer: RecordVectorizer, private readonly comparison: VectorSimilarity) {}
  search(target: DecisionVector, records: readonly DecisionDatasetRecord[], limit = 5): readonly SimilarDecision[] {
    return immutable(records.map((record) => ({ record, similarity: this.comparison.similarity(target, this.vectorizer.vectorize(record)) }))
      .sort((left, right) => right.similarity - left.similarity).slice(0, limit));
  }
  summarize(matches: readonly SimilarDecision[]): { readonly acceptanceRate: number; readonly averageCredits: number } {
    if (!matches.length) return immutable({ acceptanceRate: 0, averageCredits: 0 });
    return immutable({ acceptanceRate: matches.filter(({ record }) => record.accepted).length / matches.length,
      averageCredits: matches.reduce((sum, { record }) => sum + record.credits, 0) / matches.length });
  }
}
