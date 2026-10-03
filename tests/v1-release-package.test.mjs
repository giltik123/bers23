import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const classifications = JSON.parse(await readFile('config/v1-capability-classification.json','utf8'));
const stageD = JSON.parse(await readFile('config/v1-generative-decision-matrix.json','utf8'));
const readiness = JSON.parse(await readFile('config/v1-release-readiness.json','utf8'));
const finalization = JSON.parse(await readFile('config/v1-release-finalization.json','utf8'));
const journeys = JSON.parse(await readFile('config/v1-release-journey-matrix.json','utf8'));
const packageJson = JSON.parse(await readFile('package.json','utf8'));
const packageLock = JSON.parse(await readFile('package-lock.json','utf8'));
const executorPolicy = await readFile('server/core/localExecution/productionLocalExecutorPolicy.ts','utf8');
const notes = await readFile('docs/v1-release-notes.md','utf8');
const operations = await readFile('docs/v1-release-operations.md','utf8');

test('release package classifies the enabled v1 product floor explicitly', () => {
  assert.equal(classifications.targetVersion, '1.0.0');
  const byId = Object.fromEntries(classifications.entries.map(value=>[value.id,value]));
  for (const id of ['CORE_PROJECT_ARTIFACT','DETERMINISTIC_EDITOR_V1','WARDROBE_COLLECTIONS_OUTFITS','DETERMINISTIC_TRYON_V1','BOUNDED_AGENT_AEE_V1','AUTOMATION_V1','JOB_CENTER_V1']) {
    assert.equal(byId[id].classification,'PRODUCTION_READY',id);
    assert.equal(byId[id].enabled,true,id);
  }
  assert.equal(byId.GENERATIVE_LOCAL_MODELS_STAGE_D.enabled,false);
  assert.equal(byId.HSME_V1_RESEARCH_PROGRAM.classification,'SOFTWARE_READY_EVIDENCE_PENDING');
  assert.equal(byId.HSME_V1_RESEARCH_PROGRAM.enabled,false);
  assert.equal(byId.HSME_V1_RESEARCH_PROGRAM.v1ReleaseBlocking,true);
  assert.equal(byId.HSME_V1_RESEARCH_PROGRAM.postV1Research,false);
  assert.equal(readiness.hsmeValidation.requiredClassification,'R&D_VALIDATED');
  assert.equal(readiness.hsmeValidation.productionAuthorityGranted,false);
  assert.equal(byId.BILLING_PAYMENTS_CREDITS.classification,'BLOCKED');
});

test('deterministic Editor classification does not silently admit Levels candidates', () => {
  const editor = classifications.entries.find(value=>value.id==='DETERMINISTIC_EDITOR_V1');
  assert.deepEqual(editor.deliberatelyNotEnabled.slice(0,2), ['levels@1','masked-levels@1']);
  assert.doesNotMatch(executorPolicy, /LEVELS_CAPABILITY|MASKED_LEVELS_CAPABILITY/);
  for (const expected of ['CROP_CAPABILITY','RESIZE_CAPABILITY','ORTHOGONAL_TRANSFORM_CAPABILITY','MASKED_EXPOSURE_CAPABILITY','MASKED_WHITE_BALANCE_CAPABILITY']) {
    assert.match(executorPolicy,new RegExp(expected));
  }
});

test('Stage D candidates remain non-production and agree with the release package', () => {
  assert.equal(stageD.entries.length,6);
  assert.equal(stageD.entries.every(value=>value.productionEnabled===false),true);
  const entry=classifications.entries.find(value=>value.id==='GENERATIVE_LOCAL_MODELS_STAGE_D');
  assert.equal(entry.classification,'CANDIDATE');
  assert.equal(entry.enabled,false);
});

test('privacy/retention disposition introduces no enabled durable Voice memory or ranking surface', () => {
  assert.deepEqual(classifications.privacyRetention,{
    voiceInputEnabled:false,
    persistentAgentMemoryEnabled:false,
    durableUserRankingFeedbackCollectionEnabled:false,
    disposition:'NO_NEW_DURABLE_PRIVACY_RETENTION_SURFACE_IN_ENABLED_V1',
    law:'A later enablement requires an explicit retention/privacy contract and dedicated release evidence before production admission.'
  });
});

test('release package version and classification follow the declared finalization state', () => {
  const releaseStateMap=classifications.versioning.releaseStateByFinalizationStatus;
  assert.deepEqual(releaseStateMap,{
    BLOCKED_BEFORE_RC:'PRE_RC_EXTERNAL_BLOCKERS_REMAIN',
    RC_SELECTED:'RC_SELECTED',
    RELEASE_AUTHORIZED:'RELEASE_AUTHORIZED',
    RELEASED:'RELEASED',
  });
  assert.equal(classifications.releaseState,releaseStateMap[finalization.status]);
  assert.equal(packageLock.name,packageJson.name);
  assert.equal(packageLock.version,packageJson.version);
  assert.equal(packageLock.packages?.['']?.name,packageJson.name);
  assert.equal(packageLock.packages?.['']?.version,packageJson.version);

  if (finalization.status === 'BLOCKED_BEFORE_RC') {
    assert.equal(readiness.rcSelectable,false);
    assert.ok(readiness.blockers.length>0);
    assert.equal(packageJson.version,classifications.versioning.packageVersionBeforeRc);
    assert.equal(packageJson.version,'0.0.0');
    assert.match(notes,/not.*declaration.*v1\.0.*shipped/is);
    const frontendBlocked=readiness.blockers.some(value=>value.id==='FRONTEND_DEPLOYMENT_HEADERS');
    const journey22=journeys.entries.find(value=>value.id===22);
    assert.equal(journey22.disposition,frontendBlocked ? 'DEPLOYMENT_TARGET_PENDING' : 'PROVEN');
    if (!frontendBlocked) {
      assert.equal(journey22.liveEvidence?.kind,'BERS_V1_FRONTEND_SECURITY_EVIDENCE');
      assert.match(journey22.liveEvidence?.verifiedSha ?? '',/^[0-9a-f]{40}$/u);
    }
  } else if (finalization.status === 'RC_SELECTED') {
    assert.equal(readiness.rcSelectable,true);
    assert.equal(readiness.blockers.length,0);
    assert.equal(packageJson.version,classifications.versioning.packageVersionBeforeRc);
    assert.equal(packageJson.version,'0.0.0');
  } else if (finalization.status === 'RELEASE_AUTHORIZED') {
    assert.equal(readiness.rcSelectable,true);
    assert.equal(readiness.blockers.length,0);
    assert.equal(readiness.status,'BERS_V1_RC_SELECTED');
    assert.equal(packageJson.version,classifications.versioning.finalVersion);
    assert.equal(packageJson.version,'1.0.0');
    assert.equal(finalization.releaseSha,null);
    assert.equal(finalization.releaseTag,'v1.0.0');
    assert.equal(finalization.releaseGenerated,false);
  } else if (finalization.status === 'RELEASED') {
    assert.equal(readiness.rcSelectable,true);
    assert.equal(readiness.blockers.length,0);
    assert.equal(readiness.status,'BERS_V1_RC_SELECTED');
    assert.equal(packageJson.version,classifications.versioning.finalVersion);
    assert.equal(packageJson.version,'1.0.0');
    assert.match(finalization.releaseSha,/^[0-9a-f]{40}$/u);
    assert.equal(finalization.releaseTag,'v1.0.0');
    assert.equal(finalization.releaseGenerated,true);
  } else {
    assert.fail(`unexpected finalization status: ${finalization.status}`);
  }

  assert.match(operations,/Only after all mandatory external evidence is accepted/);
});

test('rollback package preserves forward-migration and exact-image safety law', () => {
  assert.match(operations,/previous immutable Core image/);
  assert.match(operations,/already-forward-migrated schema/);
  assert.match(operations,/Do not infer database rollback/);
  assert.match(operations,/migrate\.mjs migrate/);
  assert.match(operations,/migrate\.mjs check/);
  assert.match(operations,/\/health\/ready/);
});
