import { mean, immutable } from './immutable';
import { decisionRegret } from './reward';
import type { DecisionDatasetRecord, DecisionModelV1, ModelMetrics } from './types';
export class DecisionModelEvaluator {
  evaluate(model: DecisionModelV1, records: readonly DecisionDatasetRecord[]): ModelMetrics {
    if (!records.length) return immutable({ rankingQuality: 0, predictionError: 0, acceptancePredictionError: 0, qualityPredictionError: 0, costPredictionError: 0, latencyPredictionError: 0, decisionRegret: 0, cloudSavings: 0, localSuccess: 0, stability: 1 });
    const rows = records.map(record => ({ record, prediction: model.predict(record.features) }));
    const quality = mean(rows.map(row => Math.abs(row.prediction.quality - row.record.actualOutcome.quality)));
    const acceptance = mean(rows.map(row => Math.abs(row.prediction.acceptanceProbability - Number(row.record.actualOutcome.accepted))));
    const cost = mean(rows.map(row => Math.abs(row.prediction.cost - row.record.actualOutcome.cost)));
    const latency = mean(rows.map(row => Math.abs(row.prediction.latency - row.record.actualOutcome.latency)));
    const grouped = new Map<string, typeof rows>(); for (const row of rows) { const group = grouped.get(row.record.projectId) ?? []; group.push(row); grouped.set(row.record.projectId, group); }
    const rankingQuality = mean([...grouped.values()].map(group => { const predicted = [...group].sort((a, b) => b.prediction.expectedUtility - a.prediction.expectedUtility)[0], actual = [...group].sort((a, b) => b.record.reward - a.record.reward)[0]; return Number(predicted.record.id === actual.record.id); }));
    const regret = mean([...grouped.values()].map(group => { const chosen = [...group].sort((a, b) => b.prediction.expectedUtility - a.prediction.expectedUtility)[0]; return decisionRegret(chosen.record.reward, Math.max(...group.map(row => row.record.reward))); }));
    const utilities = rows.map(row => row.prediction.expectedUtility);
    return immutable({ rankingQuality, predictionError: mean([quality, acceptance, cost / 100, latency / 60_000]), acceptancePredictionError: acceptance, qualityPredictionError: quality, costPredictionError: cost, latencyPredictionError: latency, decisionRegret: regret, cloudSavings: mean(rows.map(row => row.record.candidate.executionTarget === 'LOCAL' ? row.record.actualOutcome.cost : 0)), localSuccess: mean(rows.filter(row => row.record.candidate.executionTarget === 'LOCAL').map(row => Number(row.record.actualOutcome.success))), stability: 1 / (1 + Math.sqrt(mean(utilities.map(value => (value - mean(utilities)) ** 2)))) });
  }
  compare(candidate: ModelMetrics, baseline: ModelMetrics) { return immutable({ better: candidate.rankingQuality >= baseline.rankingQuality && candidate.decisionRegret <= baseline.decisionRegret, deltas: Object.fromEntries(Object.keys(candidate).map(key => [key, candidate[key as keyof ModelMetrics] - baseline[key as keyof ModelMetrics]])) }); }
}
