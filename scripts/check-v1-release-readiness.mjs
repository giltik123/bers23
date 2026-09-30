import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { REQUIRED_V1_MAIN_CHECKS } from './verify-github-main-protection.mjs';

const EXACT_SHA_RE = /^[0-9a-f]{40}$/u;
const ALLOWED_BLOCKERS = Object.freeze(new Map([
  ['FRONTEND_DEPLOYMENT_HEADERS', Object.freeze({ issue: 233, releaseGate: 'R4' })],
  ['REPOSITORY_MAIN_PROTECTION', Object.freeze({ issue: 355, releaseGate: 'R1' })],
]));

export function validateV1ReleaseReadiness({ readiness, journeys, stageD }) {
  requireObject(readiness, 'readiness');
  requireObject(journeys, 'journeys');
  requireObject(stageD, 'stageD');

  if (readiness.program !== 'BERS_V1_RC_READINESS') throw new Error('program mismatch');
  if (!Array.isArray(readiness.blockers)) throw new Error('readiness blockers must be an array');
  if (!Array.isArray(readiness.nonBlockingDeferred)) throw new Error('nonBlockingDeferred must be an array');

  const blockerIds = readiness.blockers.map(value => value?.id);
  if (new Set(blockerIds).size !== blockerIds.length) throw new Error('readiness blockers must not contain duplicates');

  for (const blocker of readiness.blockers) {
    const accepted = ALLOWED_BLOCKERS.get(blocker?.id);
    if (!accepted) throw new Error(`unexpected v1 blocker: ${String(blocker?.id)}`);
    if (blocker.issue !== accepted.issue) throw new Error(`${blocker.id} issue mismatch`);
    if (blocker.releaseGate !== accepted.releaseGate) throw new Error(`${blocker.id} release gate mismatch`);
  }

  if (blockerIds.includes('HSME_REAL_MOBILE_EVIDENCE')) {
    throw new Error('physical-mobile HSME evidence is deferred post-v1 and must not block RC');
  }

  const mainProtectionBlocked = blockerIds.includes('REPOSITORY_MAIN_PROTECTION');
  if (mainProtectionBlocked) {
    if (readiness.mainProtectionEvidence !== null) {
      throw new Error('blocked main protection cannot claim accepted evidence');
    }
  } else {
    validateMainProtectionEvidence(readiness.mainProtectionEvidence);
  }

  const deferredHsme = readiness.nonBlockingDeferred.find(value => value.id === 'HSME_REAL_MOBILE_EVIDENCE');
  if (deferredHsme?.state !== 'DEFERRED_POST_V1_RESEARCH') {
    throw new Error('HSME post-v1 deferral missing');
  }

  const entries = Array.isArray(journeys.entries) ? journeys.entries : [];
  const journey22 = entries.find(value => value.id === 22);
  const frontendBlocked = blockerIds.includes('FRONTEND_DEPLOYMENT_HEADERS');
  if (frontendBlocked) {
    if (journey22?.disposition !== 'DEPLOYMENT_TARGET_PENDING') {
      throw new Error('journey 22 must remain deployment pending while frontend evidence is blocked');
    }
    if (journey22?.liveEvidence != null) {
      throw new Error('pending journey 22 cannot claim reviewed live evidence');
    }
  } else {
    if (journey22?.disposition !== 'PROVEN') {
      throw new Error('journey 22 must be PROVEN before frontend blocker is removed');
    }
    validateFrontendLiveEvidence(journey22.liveEvidence);
  }

  const deferredJourneys = entries.filter(value => value.disposition === 'DEFERRED_OUT_OF_V1');
  if (deferredJourneys.length !== 1 || deferredJourneys[0]?.id !== 17) {
    throw new Error('journey 17 must remain the sole deferred browser journey');
  }

  const nonTerminalJourneys = entries.filter(value =>
    value.id !== 17 &&
    value.id !== 22 &&
    value.disposition !== 'PROVEN'
  );
  if (nonTerminalJourneys.length) {
    throw new Error(`non-terminal mandatory browser journeys: ${nonTerminalJourneys.map(value => value.id).join(', ')}`);
  }

  if (!Array.isArray(stageD.entries) || stageD.entries.length !== 6) {
    throw new Error('Stage D decision matrix incomplete');
  }
  if (stageD.entries.some(value => value.productionEnabled !== false)) {
    throw new Error('Stage D v1 candidates unexpectedly production enabled');
  }
  if (stageD.entries.some(value => !['EXPLICIT_REJECTION_FOR_V1_DEFAULT','DETERMINISTIC_FALLBACK'].includes(value.v1Decision))) {
    throw new Error('Stage D entry lacks explicit v1 product decision');
  }

  if (readiness.blockers.length > 0) {
    if (readiness.rcSelectable !== false) {
      throw new Error('RC must remain non-selectable while blockers exist');
    }
    if (readiness.rcCoordinate !== null) {
      throw new Error('RC coordinate must remain null while blockers exist');
    }
    if (readiness.status !== 'BERS_V1_RC_NOT_SELECTABLE') {
      throw new Error('blocked readiness status must remain BERS_V1_RC_NOT_SELECTABLE');
    }
    return Object.freeze({
      marker: 'BERS_V1_RC_NOT_SELECTABLE',
      payload: Object.freeze({
        evidenceBaseSha: readiness.evidenceBaseSha,
        blockers: Object.freeze(readiness.blockers.map(value => Object.freeze({
          id: value.id,
          issue: value.issue,
          state: value.state,
        }))),
        provenBrowserJourneys: entries.filter(value => value.disposition === 'PROVEN').length,
        deferredBrowserJourneys: 1,
        pendingBrowserJourneys: Object.freeze(
          entries.filter(value => value.disposition === 'DEPLOYMENT_TARGET_PENDING').map(value => value.id)
        ),
        stageDDecisions: stageD.entries.length,
        deferredHsmeState: deferredHsme.state,
      }),
    });
  }

  if (readiness.rcSelectable !== true) throw new Error('empty blockers require rcSelectable=true');
  if (!EXACT_SHA_RE.test(readiness.rcCoordinate ?? '')) {
    throw new Error('empty blockers require one exact RC SHA');
  }
  if (readiness.status !== 'BERS_V1_RC_SELECTED') {
    throw new Error('empty blockers require BERS_V1_RC_SELECTED status');
  }
  if (journey22.liveEvidence.verifiedSha !== readiness.rcCoordinate) {
    throw new Error('selected RC must equal journey 22 verified deployment SHA');
  }

  return Object.freeze({
    marker: 'BERS_V1_RC_SELECTED',
    payload: Object.freeze({
      rcCoordinate: readiness.rcCoordinate,
      provenBrowserJourneys: entries.filter(value => value.disposition === 'PROVEN').length,
      deferredBrowserJourneys: 1,
      pendingBrowserJourneys: Object.freeze([]),
      stageDDecisions: stageD.entries.length,
      deferredHsmeState: deferredHsme.state,
    }),
  });
}

function validateMainProtectionEvidence(value) {
  requireObject(value, 'mainProtectionEvidence');
  if (value.schemaVersion !== 1) throw new Error('mainProtectionEvidence schemaVersion is invalid');
  if (value.kind !== 'BERS_V1_GITHUB_MAIN_PROTECTION_EVIDENCE') {
    throw new Error('mainProtectionEvidence kind mismatch');
  }
  if (value.repository !== 'giltik123/bers23') throw new Error('mainProtectionEvidence repository mismatch');
  if (value.branch !== 'main') throw new Error('mainProtectionEvidence branch mismatch');
  if (typeof value.verifiedAt !== 'string' || !Number.isFinite(Date.parse(value.verifiedAt))) {
    throw new Error('mainProtectionEvidence verifiedAt is invalid');
  }
  const required = Array.isArray(value.requiredChecks) ? value.requiredChecks : [];
  if (required.length !== REQUIRED_V1_MAIN_CHECKS.length ||
      required.some((item,index)=>item !== REQUIRED_V1_MAIN_CHECKS[index])) {
    throw new Error('mainProtectionEvidence required checks mismatch');
  }
  if (value.mode === 'RULESET') {
    const policy=value.ruleset;
    requireObject(policy,'mainProtectionEvidence.ruleset');
    if (policy.enforcement !== 'active' || policy.target !== 'branch') {
      throw new Error('mainProtectionEvidence ruleset is not active branch enforcement');
    }
    if (!Number.isSafeInteger(policy.requiredApprovingReviewCount) || policy.requiredApprovingReviewCount < 1) {
      throw new Error('mainProtectionEvidence ruleset approval requirement missing');
    }
    if (policy.strictRequiredStatusChecks !== true ||
        policy.forcePushBlocked !== true ||
        policy.deletionBlocked !== true ||
        !Array.isArray(policy.bypassActors) ||
        policy.bypassActors.length !== 0) {
      throw new Error('mainProtectionEvidence ruleset safety contract mismatch');
    }
    requireMainProtectionChecks(policy.requiredStatusChecks);
    return;
  }
  if (value.mode === 'BRANCH_PROTECTION') {
    const policy=value.branchProtection;
    requireObject(policy,'mainProtectionEvidence.branchProtection');
    if (!Number.isSafeInteger(policy.requiredApprovingReviewCount) || policy.requiredApprovingReviewCount < 1) {
      throw new Error('mainProtectionEvidence branch approval requirement missing');
    }
    if (policy.strictRequiredStatusChecks !== true ||
        policy.enforceAdmins !== true ||
        policy.forcePushBlocked !== true ||
        policy.deletionBlocked !== true ||
        !Array.isArray(policy.bypassActors) ||
        policy.bypassActors.length !== 0) {
      throw new Error('mainProtectionEvidence branch safety contract mismatch');
    }
    requireMainProtectionChecks(policy.requiredStatusChecks);
    return;
  }
  throw new Error('mainProtectionEvidence mode is invalid');
}

function requireMainProtectionChecks(value) {
  if (!Array.isArray(value)) throw new Error('mainProtectionEvidence requiredStatusChecks must be an array');
  const actual=new Set(value);
  const missing=REQUIRED_V1_MAIN_CHECKS.filter(name=>!actual.has(name));
  if (missing.length) throw new Error(`mainProtectionEvidence is missing required checks: ${missing.join(', ')}`);
}

function validateFrontendLiveEvidence(value) {
  requireObject(value, 'journey 22 liveEvidence');
  if (value.schemaVersion !== 1) {
    throw new Error('journey 22 live evidence schemaVersion is invalid');
  }
  if (value.kind !== 'BERS_V1_FRONTEND_SECURITY_EVIDENCE') {
    throw new Error('journey 22 live evidence kind mismatch');
  }
  if (!EXACT_SHA_RE.test(value.verifiedSha ?? '')) {
    throw new Error('journey 22 live evidence verifiedSha is invalid');
  }
  if (!/^[0-9a-f]{64}$/u.test(value.htmlSha256 ?? '')) {
    throw new Error('journey 22 live evidence htmlSha256 is invalid');
  }
  if (!/^https:\/\//u.test(value.frontendUrl ?? '')) {
    throw new Error('journey 22 live evidence frontendUrl must be HTTPS');
  }
  if (typeof value.coreApiUrl !== 'string' || value.coreApiUrl.length === 0) {
    throw new Error('journey 22 live evidence coreApiUrl is required');
  }
  if (!/^https:\/\/github\.com\/giltik123\/bers23\/actions\/runs\/\d+$/u.test(value.workflowRunUrl ?? '')) {
    throw new Error('journey 22 live evidence workflowRunUrl is invalid');
  }
  if (value.artifactName !== `bers-v1-frontend-security-${value.verifiedSha}`) {
    throw new Error('journey 22 live evidence artifactName does not bind verifiedSha');
  }
  if (typeof value.verifiedAt !== 'string' || !Number.isFinite(Date.parse(value.verifiedAt))) {
    throw new Error('journey 22 live evidence verifiedAt is invalid');
  }
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

export async function loadV1ReleaseReadinessInputs() {
  const [readiness, journeys, stageD] = await Promise.all([
    readJson('config/v1-release-readiness.json'),
    readJson('config/v1-release-journey-matrix.json'),
    readJson('config/v1-generative-decision-matrix.json'),
  ]);
  return Object.freeze({ readiness, journeys, stageD });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  try {
    const result = validateV1ReleaseReadiness(await loadV1ReleaseReadinessInputs());
    console.log(result.marker, JSON.stringify(result.payload, null, 2));
  } catch (error) {
    console.error(
      'BERS_V1_RC_READINESS_INVALID',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) await main();
