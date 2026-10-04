import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { REQUIRED_V1_APPROVING_REVIEWS, REQUIRED_V1_MAIN_CHECKS } from './verify-github-main-protection.mjs';

const EXACT_SHA_RE = /^[0-9a-f]{40}$/u;
const ALLOWED_BLOCKERS = Object.freeze(new Map([
  ['FASHION_REAL_IMAGE_QUALITY', Object.freeze({ issue: 230, releaseGate: 'R2' })],
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

  const hsmeState = validateHsmeValidation(readiness.hsmeValidation);
  validateHsmeReleaseOverride(
    readiness.releasePolicyOverride,
    readiness.nonBlockingDeferred,
    hsmeState,
  );

  const fashionState = validateFashionTryOnQuality(readiness.fashionTryOnQualityValidation);
  const fashionBlocked = blockerIds.includes('FASHION_REAL_IMAGE_QUALITY');
  if (fashionState === 'QUALITY_VALIDATED' && fashionBlocked) {
    throw new Error('QUALITY_VALIDATED Try-On cannot remain a release blocker');
  }
  if (fashionState !== 'QUALITY_VALIDATED' && !fashionBlocked) {
    throw new Error('Try-On real-image quality must block RC until QUALITY_VALIDATED');
  }

  const mainProtectionBlocked = blockerIds.includes('REPOSITORY_MAIN_PROTECTION');
  if (mainProtectionBlocked) {
    if (readiness.mainProtectionEvidence !== null) {
      throw new Error('blocked main protection cannot claim accepted evidence');
    }
  } else {
    validateMainProtectionEvidence(readiness.mainProtectionEvidence);
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
        hsmeValidationState: hsmeState,
        fashionTryOnQualityState: fashionState,
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
      hsmeValidationState: hsmeState,
      fashionTryOnQualityState: fashionState,
    }),
  });
}

function validateFashionTryOnQuality(value) {
  requireObject(value, 'fashionTryOnQualityValidation');
  if (value.schemaVersion !== 1) throw new Error('fashionTryOnQualityValidation schemaVersion is invalid');
  if (value.kind !== 'BERS_V1_FASHION_REAL_IMAGE_QUALITY_VALIDATION') {
    throw new Error('fashionTryOnQualityValidation kind mismatch');
  }
  if (value.requiredClassification !== 'QUALITY_VALIDATED') {
    throw new Error('fashionTryOnQualityValidation requiredClassification mismatch');
  }
  if (value.issue !== 230) throw new Error('fashionTryOnQualityValidation issue mismatch');
  if (value.productionAuthorityGrantedByEvidence !== false) {
    throw new Error('Try-On quality evidence cannot grant new production/provider/Billing authority');
  }
  const required=[
    'REPRESENTATIVE_REAL_IMAGE_FIXTURE_SET',
    'GARMENT_LOGO_PATTERN_PRESERVATION_REVIEW',
    'OBSERVED_FAILURE_MODES',
    'MEASURED_LATENCY',
    'MEASURED_PEAK_MEMORY',
    'EXACT_CANDIDATE_SHA_BINDING',
    'IMMUTABLE_REVIEW_ARTIFACT',
  ];
  if (!Array.isArray(value.requirements) ||
      required.some(item=>!value.requirements.includes(item))) {
    throw new Error('fashionTryOnQualityValidation requirements incomplete');
  }

  if (value.currentClassification === 'QUALITY_VALIDATED') {
    if (value.state !== 'QUALITY_VALIDATED') throw new Error('validated Try-On quality state mismatch');
    const evidence=value.acceptedEvidence;
    requireObject(evidence, 'fashionTryOnQualityValidation.acceptedEvidence');
    if (!EXACT_SHA_RE.test(evidence.candidateSha ?? '')) {
      throw new Error('Try-On quality evidence candidateSha is invalid');
    }
    if (!/^[0-9a-f]{64}$/u.test(evidence.fixtureSetSha256 ?? '')) {
      throw new Error('Try-On quality fixtureSetSha256 is invalid');
    }
    if (!/^[0-9a-f]{64}$/u.test(evidence.reviewArtifactSha256 ?? '')) {
      throw new Error('Try-On quality reviewArtifactSha256 is invalid');
    }
    if (!Number.isInteger(evidence.sampleCount) || evidence.sampleCount < 1) {
      throw new Error('Try-On quality evidence sampleCount is invalid');
    }
    requireObject(evidence.measuredLatencyMs, 'Try-On quality measuredLatencyMs');
    const p50=Number(evidence.measuredLatencyMs.p50);
    const p95=Number(evidence.measuredLatencyMs.p95);
    if (!Number.isFinite(p50) || !Number.isFinite(p95) || p50 < 0 || p95 < p50) {
      throw new Error('Try-On quality measured latency is invalid');
    }
    if (!Number.isSafeInteger(evidence.peakMemoryBytes) || evidence.peakMemoryBytes <= 0) {
      throw new Error('Try-On quality peakMemoryBytes is invalid');
    }
    const dimensions=Array.isArray(evidence.reviewedDimensions) ? evidence.reviewedDimensions : [];
    for (const item of ['GARMENT_PRESERVATION','LOGO_PATTERN_PRESERVATION','FAILURE_MODES']) {
      if (!dimensions.includes(item)) throw new Error(`Try-On quality review missing ${item}`);
    }
    if (evidence.schemaVersion !== 1 || evidence.kind !== 'BERS_V1_FASHION_REAL_IMAGE_QUALITY_EVIDENCE') {
      throw new Error('Try-On quality accepted evidence kind/schema is invalid');
    }
    if (evidence.productionAuthorityGranted !== false) {
      throw new Error('Try-On quality evidence cannot grant production authority');
    }
    if (evidence.decision !== 'ACCEPT_FOR_V1_DETERMINISTIC_TRYON') {
      throw new Error('Try-On quality evidence decision is not accepted for v1');
    }
    if (typeof evidence.verifiedAt !== 'string' || !Number.isFinite(Date.parse(evidence.verifiedAt))) {
      throw new Error('Try-On quality evidence verifiedAt is invalid');
    }
    if (!/^https:\/\/github\.com\/giltik123\/bers23\/actions\/runs\/\d+$/u.test(evidence.workflowRunUrl ?? '')) {
      throw new Error('Try-On quality evidence workflowRunUrl is invalid');
    }
    if (evidence.artifactName !== `bers-v1-fashion-real-image-quality-${evidence.candidateSha}`) {
      throw new Error('Try-On quality evidence artifactName does not bind candidateSha');
    }
    for (const [label,url] of [['fixtureManifestUrl',evidence.fixtureManifestUrl],['reviewArtifactUrl',evidence.reviewArtifactUrl]]) {
      if (typeof url !== 'string' || !/^https:\/\//u.test(url)) {
        throw new Error(`Try-On quality evidence ${label} must be HTTPS`);
      }
    }
    return 'QUALITY_VALIDATED';
  }

  if (value.currentClassification !== 'QUALITY_EVIDENCE_PENDING') {
    throw new Error('Try-On quality pending classification is invalid');
  }
  if (value.state !== 'BLOCKED') throw new Error('pending Try-On quality validation must remain BLOCKED');
  if (value.acceptedEvidence !== null) {
    throw new Error('pending Try-On quality validation cannot claim accepted evidence');
  }
  return 'QUALITY_EVIDENCE_PENDING';
}

function validateHsmeValidation(value) {
  requireObject(value, 'hsmeValidation');
  if (value.schemaVersion !== 1) throw new Error('hsmeValidation schemaVersion is invalid');
  if (value.kind !== 'BERS_V1_HSME_RND_VALIDATION') throw new Error('hsmeValidation kind mismatch');
  if (value.requiredClassification !== 'R&D_VALIDATED') throw new Error('hsmeValidation requiredClassification mismatch');
  if (value.productionAuthorityGranted !== false) throw new Error('HSME R&D validation cannot grant production authority');
  if (value.releaseBlocking !== false) throw new Error('HSME physical validation must remain non-blocking for v1 after owner override');
  if (value.releasePolicy !== 'POST_V1_GRADUATION_ONLY') throw new Error('HSME release policy mismatch');
  if (!Array.isArray(value.blockers)) throw new Error('hsmeValidation blockers must be an array');

  if (value.currentClassification === 'R&D_VALIDATED') {
    if (value.state !== 'R&D_VALIDATED') throw new Error('R&D_VALIDATED HSME state mismatch');
    if (value.blockers.length !== 0) throw new Error('R&D_VALIDATED HSME cannot retain blockers');
    requireObject(value.physicalMobileQualification, 'hsmeValidation.physicalMobileQualification');
    if (value.physicalMobileQualification.state !== 'REAL_MOBILE_QUALIFICATION_READY_NOT_ADMITTED') {
      throw new Error('HSME real mobile qualification is not ready');
    }
    if (value.physicalMobileQualification.realPhysicalMobileDeviceEvidence !== true) {
      throw new Error('HSME real mobile qualification lacks physical-device evidence');
    }
    if (!/^[0-9a-f]{64}$/u.test(value.physicalMobileQualification.qualificationEvidenceSha256 ?? '')) {
      throw new Error('HSME qualification evidence digest is invalid');
    }
    if (!['ADVANCE','REDESIGN','REJECT'].includes(value.finalArchitectureDecision)) {
      throw new Error('HSME final architecture decision is missing');
    }
    return 'R&D_VALIDATED';
  }

  if (value.currentClassification !== 'RND_IMPLEMENTATION_EVIDENCE_PENDING') {
    throw new Error('HSME pending classification is invalid');
  }
  if (value.state !== 'BLOCKED') throw new Error('pending HSME validation must remain BLOCKED');
  if (value.blockers.length === 0) throw new Error('pending HSME validation requires explicit blockers');
  if (value.physicalMobileQualification !== null) {
    throw new Error('pending HSME validation cannot claim accepted physical-mobile qualification');
  }
  if (value.finalArchitectureDecision !== null) {
    throw new Error('pending HSME validation cannot claim final architecture disposition');
  }
  return 'RND_IMPLEMENTATION_EVIDENCE_PENDING';
}

function validateHsmeReleaseOverride(value, nonBlockingDeferred, hsmeState) {
  requireObject(value, 'releasePolicyOverride');
  if (value.schemaVersion !== 1) throw new Error('releasePolicyOverride schemaVersion is invalid');
  if (value.id !== 'DEFER_HSME_PHYSICAL_MOBILE_PRE_RC_GATE') {
    throw new Error('releasePolicyOverride id mismatch');
  }
  if (value.riskOwner !== 'PRODUCT_OWNER') throw new Error('releasePolicyOverride risk owner mismatch');
  if (value.scope !== 'BERS_V1_RC_AND_V1_RELEASE') throw new Error('releasePolicyOverride scope mismatch');
  if (typeof value.authorizedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value.authorizedAt)) {
    throw new Error('releasePolicyOverride authorizedAt is invalid');
  }
  if (!Array.isArray(value.preserves) ||
      !value.preserves.includes('HSME_NON_PRODUCTION_UNTIL_SEPARATELY_VALIDATED') ||
      !value.preserves.includes('NO_PROVIDER_OR_BILLING_AUTHORITY') ||
      !value.preserves.includes('NO_MODEL_OR_MOBILE_BACKEND_ADMISSION') ||
      !value.preserves.includes('CORE_POSTGRES_SECURITY_DEPLOYMENT_BACKUP_BROWSER_GATES')) {
    throw new Error('releasePolicyOverride preserved safety/release boundaries are incomplete');
  }

  const deferred = nonBlockingDeferred.find(item => item?.id === 'HSME_PHYSICAL_MOBILE_VALIDATION');
  if (hsmeState !== 'R&D_VALIDATED') {
    requireObject(deferred, 'nonBlockingDeferred HSME physical validation');
    if (deferred.issue !== 352 ||
        deferred.state !== 'OWNER_DEFERRED_POST_V1_FIELD_VALIDATION' ||
        deferred.releaseBlocking !== false ||
        deferred.riskOwner !== 'PRODUCT_OWNER') {
      throw new Error('HSME post-v1 deferral contract mismatch');
    }
  }
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
    if (policy.requiredApprovingReviewCount !== REQUIRED_V1_APPROVING_REVIEWS) {
      throw new Error('mainProtectionEvidence ruleset approval count mismatch');
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
    if (policy.requiredApprovingReviewCount !== REQUIRED_V1_APPROVING_REVIEWS) {
      throw new Error('mainProtectionEvidence branch approval count mismatch');
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
  if (!EXACT_SHA_RE.test(value.deployedSha ?? '')) {
    throw new Error('journey 22 live evidence deployedSha is invalid');
  }
  if (value.deployedSha !== value.verifiedSha) {
    throw new Error('journey 22 live evidence deployedSha must equal verifiedSha');
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
