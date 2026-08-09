import { immutable } from "./immutable";
import type { MLTrainingExample, TrainingFeatureExtractor, TrainingRecord } from "./refinementTypes";

export class DecisionTrainingExporter {
  constructor(private readonly extractor: TrainingFeatureExtractor) {}
  export(records: readonly TrainingRecord[]): readonly MLTrainingExample[] {
    return immutable(records.map((record) => ({ features: this.extractor.extract(record.prompt, record.intent), decision: record.decision,
      outcome: { accepted: record.accepted, rejected: record.rejected, undo: record.undo, quality: record.quality,
        credits: record.credits, executionTimeMs: record.executionTimeMs } })));
  }
}
