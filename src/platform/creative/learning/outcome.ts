import { immutableCopy, stableIdentity } from './immutable';
import type { ActualOutcome, CreativeLearningRecord, CreativeOutcome, OutcomeError, Regret, TrainingLabels, ValidationResult, VersionedReward } from './types';

const SECRET_KEYS = /(^|_)(api.?key|authorization|token|secret|password|cookie)($|_)/i;
const RAW_KEYS = /(^|_)(raw.?image|image.?bytes|base64|binary|blob|raw.?prompt|metadata)($|_)/i;
const finite = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const probability = (v: unknown) => finite(v) && (v as number) >= 0 && (v as number) <= 1;
const scalar = (v: boolean | number) => typeof v === 'boolean' ? Number(v) : v;

export function findForbiddenData(value: unknown, path = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  const reasons: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const current = path ? `${path}.${key}` : key;
    if (SECRET_KEYS.test(key) || RAW_KEYS.test(key)) reasons.push(`forbidden:${current}`);
    else reasons.push(...findForbiddenData(child, current));
  }
  return reasons;
}
export function validateCreativeOutcome(outcome: CreativeOutcome): ValidationResult {
  const reasons: string[] = [];
  for (const key of ['requestId','executionId','operationId','decisionId','planId','strategyId','outcomeVersion','target','model','provider'] as const) if (!outcome?.[key]) reasons.push(`missing:${key}`);
  if (!outcome?.scope?.tenantId || !outcome.scope.projectId || !outcome.scope.userId) reasons.push('scope:invalid');
  if (!['ACCEPTED','REJECTED','UNDO','CORRECTED','RETRIED','REPEATED_EDIT','CANCELLED','NO_REACTION'].includes(outcome?.userReaction)) reasons.push('userReaction:invalid');
  const p = outcome?.predictions;
  if (!p?.modelVersion || !p.policyVersion || !p.featureSchemaVersion) reasons.push('prediction:version_invalid');
  for (const key of ['predictedQuality','predictedAcceptance','predictedSuccess','predictedEscalation','predictedSatisfaction'] as const) if (!probability(p?.[key])) reasons.push(`prediction:${key}`);
  for (const key of ['predictedCost','predictedLatency'] as const) if (!finite(p?.[key]) || p[key] < 0) reasons.push(`prediction:${key}`);
  const a = outcome?.actuals;
  if (!probability(a?.actualQuality) || !probability(a?.actualSatisfaction)) reasons.push('actual:quality_or_satisfaction');
  for (const key of ['actualLatency','actualCost','actualFallbacks','actualRetries'] as const) if (!finite(a?.[key]) || a[key] < 0) reasons.push(`actual:${key}`);
  if (![a?.actualSuccess,a?.actualAcceptance,a?.actualEscalation].every(v => typeof v === 'boolean' || probability(v))) reasons.push('actual:boolean_label');
  if (!outcome?.verification?.valid || !outcome.verification.artifactIntegrityValid) reasons.push('artifact:invalid');
  if (!outcome?.billing?.state || (finite(outcome.billing.actualCost) && outcome.billing.actualCost !== a?.actualCost)) reasons.push('billing:inconsistent');
  if (!Array.isArray(outcome?.candidateSet) || !outcome.candidateSet.length || !outcome.candidateSet.some(c => c.candidateId === outcome.selectedCandidateId)) reasons.push('candidates:invalid');
  if (!Number.isFinite(Date.parse(outcome?.occurredAt)) || !Number.isFinite(Date.parse(outcome?.completedAt)) || Date.parse(outcome.completedAt) < Date.parse(outcome.occurredAt)) reasons.push('timestamps:invalid');
  reasons.push(...findForbiddenData(outcome));
  return immutableCopy({ status: reasons.length ? 'REJECTED_FROM_LEARNING' : 'VALID', valid: !reasons.length, reasons }) as ValidationResult;
}
export function predictionError(p: CreativeOutcome['predictions'], a: ActualOutcome): OutcomeError { return immutableCopy({ qualityError: a.actualQuality-p.predictedQuality, costError:a.actualCost-p.predictedCost, latencyError:a.actualLatency-p.predictedLatency, successError:scalar(a.actualSuccess)-p.predictedSuccess, acceptanceError:scalar(a.actualAcceptance)-p.predictedAcceptance, satisfactionError:a.actualSatisfaction-p.predictedSatisfaction, escalationError:scalar(a.actualEscalation)-p.predictedEscalation }) as OutcomeError; }
export function calculateRegret(outcome: CreativeOutcome): Regret {
  const chosen = outcome.candidateSet.find(c => c.candidateId === outcome.selectedCandidateId)!;
  const score = (c: typeof chosen) => (c.observedQuality ?? 0) + (c.observedSatisfaction ?? 0) - (c.observedCost ?? 0) - ((c.observedLatency ?? 0) / 1000);
  const best = [...outcome.candidateSet].filter(c => [c.observedQuality,c.observedCost,c.observedLatency,c.observedSatisfaction].some(finite)).sort((x,y)=>score(y)-score(x))[0];
  const deltas = { qualityDelta: Math.max(0,(best?.observedQuality??0)-(chosen.observedQuality??outcome.actuals.actualQuality)), costDelta: Math.max(0,(chosen.observedCost??outcome.actuals.actualCost)-(best?.observedCost??outcome.actuals.actualCost)), latencyDelta: Math.max(0,(chosen.observedLatency??outcome.actuals.actualLatency)-(best?.observedLatency??outcome.actuals.actualLatency)), satisfactionDelta: Math.max(0,(best?.observedSatisfaction??0)-(chosen.observedSatisfaction??outcome.actuals.actualSatisfaction)) };
  return immutableCopy({ ...deltas, total:Object.values(deltas).reduce((a,b)=>a+b,0), chosenCandidate:chosen.candidateId, bestObservedAlternative:best?.candidateId === chosen.candidateId ? undefined : best?.candidateId }) as Regret;
}
export function buildLabels(outcome: CreativeOutcome, regret=calculateRegret(outcome)): TrainingLabels { const a=outcome.actuals; return immutableCopy({quality:a.actualQuality,success:scalar(a.actualSuccess),acceptance:scalar(a.actualAcceptance),cost:a.actualCost,latency:a.actualLatency,satisfaction:a.actualSatisfaction,escalation:scalar(a.actualEscalation),regret:regret.total}) as TrainingLabels; }
export function buildReward(outcome: CreativeOutcome, schema='v1', weights: Partial<Record<string,number>>={}): VersionedReward {
  const a=outcome.actuals, regret=calculateRegret(outcome).total; const components={goalCompletion:scalar(a.actualSuccess),quality:a.actualQuality,satisfaction:a.actualSatisfaction,costEfficiency:1/(1+a.actualCost),privacy:1,speed:1/(1+a.actualLatency),regret:-regret,unnecessaryAI:outcome.target==='LOCAL'?0:-Number(!a.actualSuccess),excessiveCost:-Math.max(0,a.actualCost-outcome.predictions.predictedCost)};
  return immutableCopy({reward:Object.entries(components).reduce((sum,[k,v])=>sum+v*(weights[k]??1),0),rewardSchemaVersion:schema,components}) as VersionedReward;
}
export function toLearningRecord(outcome: CreativeOutcome, rewardSchemaVersion='v1'): CreativeLearningRecord {
  const validation=validateCreativeOutcome(outcome); if(!validation.valid) throw new Error(`REJECTED_FROM_LEARNING: ${validation.reasons.join(',')}`);
  const regret=calculateRegret(outcome), labels=buildLabels(outcome,regret), selected=outcome.candidateSet.find(c=>c.candidateId===outcome.selectedCandidateId)!;
  return immutableCopy({recordId:stableIdentity([outcome.scope.tenantId,outcome.scope.projectId,outcome.scope.userId,outcome.executionId,outcome.outcomeVersion]),identity:stableIdentity([outcome.scope.tenantId,outcome.scope.projectId,outcome.scope.userId,outcome.executionId,outcome.outcomeVersion]),outcomeVersion:outcome.outcomeVersion,scope:outcome.scope,context:outcome.context??{},goal:outcome.goal??{},operation:{operationId:outcome.operationId,features:outcome.operationFeatures??{}},candidateSet:outcome.candidateSet,selectedCandidate:selected,predictions:outcome.predictions,actualOutcome:outcome.actuals,predictionError:predictionError(outcome.predictions,outcome.actuals),userReaction:outcome.userReaction,economicOutcome:{actualCost:outcome.actuals.actualCost,costEfficiency:1/(1+outcome.actuals.actualCost),billingState:outcome.billing.state},deviceContext:outcome.device,modelVersions:[outcome.predictions.modelVersion,outcome.model],policyVersions:[outcome.predictions.policyVersion],labels,reward:buildReward(outcome,rewardSchemaVersion),regret,occurredAt:outcome.occurredAt,domain:outcome.domain}) as CreativeLearningRecord;
}

export function createCreativeOutcome(outcome: CreativeOutcome): Readonly<CreativeOutcome> { const result=validateCreativeOutcome(outcome); if(!result.valid) throw new Error(`invalid CreativeOutcome: ${result.reasons.join(',')}`); return immutableCopy(outcome); }
