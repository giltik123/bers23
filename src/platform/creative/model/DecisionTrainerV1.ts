import { DecisionModelEvaluator } from './DecisionModelEvaluator';
import { TabularDecisionModelV1 } from './TabularDecisionModelV1';
import { immutable } from './immutable';
import type { DatasetSplit, DecisionDatasetRecord } from './types';
export class DecisionTrainerV1 {
  constructor(private readonly evaluator = new DecisionModelEvaluator()) {}
  validate(records: readonly DecisionDatasetRecord[]) { const ids = new Set<string>(); const errors: string[] = []; for (const record of records) { if (ids.has(record.id)) errors.push(`Duplicate id ${record.id}`); ids.add(record.id); if (!Number.isFinite(record.reward)) errors.push(`Invalid reward ${record.id}`); if (!record.projectId || !record.deviceId) errors.push(`Missing split group ${record.id}`); } return immutable({ valid: errors.length === 0, errors }); }
  split(records: readonly DecisionDatasetRecord[]): DatasetSplit {
    const ordered = [...records].sort((a, b) => a.timestamp - b.timestamp || a.projectId.localeCompare(b.projectId)); const projects = [...new Set(ordered.map(record => record.projectId))]; const trainProjects = new Set(projects.slice(0, Math.max(1, Math.floor(projects.length * .6)))), validationProjects = new Set(projects.slice(trainProjects.size, Math.max(trainProjects.size + 1, Math.floor(projects.length * .8))));
    const train = ordered.filter(record => trainProjects.has(record.projectId)), validation = ordered.filter(record => validationProjects.has(record.projectId)), test = ordered.filter(record => !trainProjects.has(record.projectId) && !validationProjects.has(record.projectId));
    return immutable({ train, validation, test });
  }
  train(records: readonly DecisionDatasetRecord[], config: { modelVersion?: string; trees?: number; learningRate?: number } = {}) { const validation = this.validate(records); if (!validation.valid) throw new Error(validation.errors.join('; ')); const split = this.split(records); const model = TabularDecisionModelV1.train(split.train, config); const metrics = this.evaluator.evaluate(model, split.test.length ? split.test : split.validation.length ? split.validation : split.train); return immutable({ model, split, metrics, calibration: { sampleCount: split.validation.length, method: 'held-out-absolute-error' }, stages: ['dataset', 'validate', 'split', 'train', 'evaluate', 'calibrate', 'benchmark', 'register'] as const }); }
}
