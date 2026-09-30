import { readFile } from 'node:fs/promises';

const readiness = JSON.parse(await readFile('config/v1-release-readiness.json','utf8'));
const journeys = JSON.parse(await readFile('config/v1-release-journey-matrix.json','utf8'));
const stageD = JSON.parse(await readFile('config/v1-generative-decision-matrix.json','utf8'));

const errors = [];
if (readiness.program !== 'BERS_V1_RC_READINESS') errors.push('program mismatch');
if (readiness.rcSelectable !== false) errors.push('RC must remain non-selectable while blockers exist');
if (readiness.rcCoordinate !== null) errors.push('RC coordinate must remain null before selection');
if (readiness.status !== 'BERS_V1_RC_NOT_SELECTABLE') errors.push('status must remain NOT_SELECTABLE');

const blockers = new Set(readiness.blockers.map(value => value.id));
for (const id of ['FRONTEND_DEPLOYMENT_HEADERS','REPOSITORY_MAIN_PROTECTION']) {
  if (!blockers.has(id)) errors.push('missing blocker '+id);
}
if (blockers.has('HSME_REAL_MOBILE_EVIDENCE')) errors.push('physical-mobile HSME evidence is deferred post-v1 and must not block RC');
if (readiness.blockers.length !== 2) errors.push('unexpected blocker count');
const deferredHsme = readiness.nonBlockingDeferred.find(value => value.id === 'HSME_REAL_MOBILE_EVIDENCE');
if (deferredHsme?.state !== 'DEFERRED_POST_V1_RESEARCH') errors.push('HSME post-v1 deferral missing');

const journey22 = journeys.entries.find(value => value.id === 22);
if (journey22?.disposition !== 'DEPLOYMENT_TARGET_PENDING') errors.push('journey 22 must remain deployment pending');
if (journeys.entries.filter(value => value.disposition === 'PROVEN').length !== 20) errors.push('expected 20 proven #233 journeys');
if (journeys.entries.filter(value => value.disposition === 'DEFERRED_OUT_OF_V1').length !== 1) errors.push('expected one #233 deferred journey');

if (!Array.isArray(stageD.entries) || stageD.entries.length !== 6) errors.push('Stage D decision matrix incomplete');
if (stageD.entries.some(value => value.productionEnabled !== false)) errors.push('Stage D v1 candidates unexpectedly production enabled');
if (stageD.entries.some(value => !['EXPLICIT_REJECTION_FOR_V1_DEFAULT','DETERMINISTIC_FALLBACK'].includes(value.v1Decision))) {
  errors.push('Stage D entry lacks explicit v1 product decision');
}

if (errors.length) {
  console.error('BERS_V1_RC_READINESS_INVALID', JSON.stringify({errors},null,2));
  process.exitCode = 1;
} else {
  console.log('BERS_V1_RC_NOT_SELECTABLE', JSON.stringify({
    evidenceBaseSha:readiness.evidenceBaseSha,
    blockers:readiness.blockers.map(value=>({id:value.id,issue:value.issue,state:value.state})),
    provenBrowserJourneys:20,
    deferredBrowserJourneys:1,
    pendingBrowserJourneys:[22],
    stageDDecisions:stageD.entries.length,
    deferredHsmeState:deferredHsme.state,
  },null,2));
}
