import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { validateV1ReleaseReadiness } from '../scripts/check-v1-release-readiness.mjs';

const readiness = JSON.parse(await readFile('config/v1-release-readiness.json','utf8'));
const journeys = JSON.parse(await readFile('config/v1-release-journey-matrix.json','utf8'));
const stageD = JSON.parse(await readFile('config/v1-generative-decision-matrix.json','utf8'));
const roadmap = await readFile('BERS_V1_DEVELOPMENT_ROADMAP.md','utf8');
const hsmeRoadmap = await readFile('BERS_HYBRID_SPARSE_MOBILE_ENGINE_ROADMAP.md','utf8');

test('current RC readiness matches its machine-readable state', () => {
  const result=validateV1ReleaseReadiness({readiness,journeys,stageD});
  const expected=readiness.blockers.length > 0
    ? 'BERS_V1_RC_NOT_SELECTABLE'
    : 'BERS_V1_RC_SELECTED';
  assert.equal(result.marker,expected);

  if (readiness.blockers.length > 0) {
    assert.equal(readiness.rcSelectable,false);
    assert.equal(readiness.rcCoordinate,null);
    assert.equal(readiness.status,'BERS_V1_RC_NOT_SELECTABLE');
  } else {
    assert.equal(readiness.rcSelectable,true);
    assert.match(readiness.rcCoordinate,/^[0-9a-f]{40}$/u);
    assert.equal(readiness.status,'BERS_V1_RC_SELECTED');
  }
});

test('RC guard consumes the accepted Stage D and browser ledgers instead of open-issue counts', () => {
  assert.equal(stageD.entries.length,6);
  assert.equal(stageD.entries.every(value=>value.productionEnabled === false),true);
  assert.equal(journeys.entries.find(value=>value.id === 17).disposition,'DEFERRED_OUT_OF_V1');
  const journey22=journeys.entries.find(value=>value.id === 22);
  const frontendBlocked=readiness.blockers.some(value=>value.id==='FRONTEND_DEPLOYMENT_HEADERS');
  assert.equal(journey22.disposition,frontendBlocked ? 'DEPLOYMENT_TARGET_PENDING' : 'PROVEN');
  assert.equal(
    journeys.entries.filter(value=>value.id !== 17 && value.disposition !== 'PROVEN')
      .every(value=>value.id === 22 && frontendBlocked),
    true,
  );
  assert.doesNotMatch(JSON.stringify(readiness.blockers), /192|191|155|180|349/);
});

test('optional/deferred work cannot accidentally block RC through this ledger', () => {
  assert.deepEqual(readiness.nonBlockingDeferred.map(value=>value.issue).sort((a,b)=>a-b), [189,192,352]);
  assert.equal(readiness.blockers.some(value=>[189,192,352].includes(value.issue)), false);
  const hsme = readiness.nonBlockingDeferred.find(value=>value.id==='HSME_REAL_MOBILE_EVIDENCE');
  assert.equal(hsme.state,'DEFERRED_POST_V1_RESEARCH');
  assert.deepEqual(hsme.relatedIssues,[862,871,867]);
});

test('readiness classifier emits exactly the disposition declared by the ledger', () => {
  const result=spawnSync(process.execPath,['scripts/check-v1-release-readiness.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const expected=readiness.blockers.length > 0 ? 'BERS_V1_RC_NOT_SELECTABLE' : 'BERS_V1_RC_SELECTED';
  assert.match(result.stdout,new RegExp(`^${expected}(?: |$)`,'m'));
  const other=expected === 'BERS_V1_RC_NOT_SELECTABLE' ? 'BERS_V1_RC_SELECTED' : 'BERS_V1_RC_NOT_SELECTABLE';
  assert.doesNotMatch(result.stdout,new RegExp(other));
  assert.match(result.stdout,/DEFERRED_POST_V1_RESEARCH/);
});

test('canonical roadmap keeps HSME physical-mobile work post-v1 and non-blocking', () => {
  assert.match(roadmap, /Stage E — Post-v1 BERS Local-First AI Engine R&D/);
  assert.match(roadmap, /Stage E\/HSME is explicitly non-blocking for `BERS_V1_RC` and `BERS v1\.0 RELEASE`/);
  assert.match(roadmap, /HSME remains explicitly non-production\/post-v1/);
  assert.doesNotMatch(roadmap, /at least one functioning real mobile backend is required for the pre-RC feasibility gate/);
  assert.doesNotMatch(roadmap, /R&D validation before v1 is mandatory/);
  assert.match(hsmeRoadmap, /HSME is an explicit \*\*post-v1 R&D workstream\*\*/);
  assert.match(hsmeRoadmap, /not an implementation\/evidence requirement for `BERS_V1_RC` or `BERS v1\.0 RELEASE`/);
  assert.doesNotMatch(hsmeRoadmap, /Before `BERS_V1_RC`, HSME is an \*\*implementation\/evidence requirement\*\*/);
  assert.doesNotMatch(hsmeRoadmap, /mandatory pre-v1 implementation\/evidence/);
});

test('selection law binds RC selection to empty blockers and one exact accepted SHA', () => {
  assert.match(readiness.selectionLaw,/blockers is empty/);
  assert.match(readiness.selectionLaw,/one exact accepted main SHA/);
  if (readiness.blockers.length > 0) {
    assert.equal(readiness.rcSelectable,false);
    assert.equal(readiness.rcCoordinate,null);
  }
});

test('readiness state machine permits either external blocker to close independently', () => {
  const oneBlocker=readiness.blockers.filter(value=>value.id==='REPOSITORY_MAIN_PROTECTION');
  const promotedJourneys={
    ...journeys,
    entries:journeys.entries.map(value=>value.id === 22
      ? {...value,disposition:'PROVEN'}
      : value),
  };
  const result=validateV1ReleaseReadiness({
    readiness:{
      ...readiness,
      blockers:oneBlocker,
      rcSelectable:false,
      rcCoordinate:null,
      status:'BERS_V1_RC_NOT_SELECTABLE',
    },
    journeys:promotedJourneys,
    stageD,
  });
  assert.equal(result.marker,'BERS_V1_RC_NOT_SELECTABLE');
  assert.deepEqual(result.payload.blockers.map(value=>value.id),['REPOSITORY_MAIN_PROTECTION']);
  assert.deepEqual(result.payload.pendingBrowserJourneys,[]);
});

test('readiness state machine selects one exact RC only after all blockers are removed', () => {
  const sha='a'.repeat(40);
  const selectedJourneys={
    ...journeys,
    entries:journeys.entries.map(value=>value.id === 22
      ? {...value,disposition:'PROVEN'}
      : value),
  };
  const result=validateV1ReleaseReadiness({
    readiness:{
      ...readiness,
      blockers:[],
      rcSelectable:true,
      rcCoordinate:sha,
      status:'BERS_V1_RC_SELECTED',
    },
    journeys:selectedJourneys,
    stageD,
  });
  assert.equal(result.marker,'BERS_V1_RC_SELECTED');
  assert.equal(result.payload.rcCoordinate,sha);
  assert.equal(result.payload.provenBrowserJourneys,21);
  assert.deepEqual(result.payload.pendingBrowserJourneys,[]);
});

test('readiness state machine rejects premature RC selection and frontend blocker drift', () => {
  const sha='b'.repeat(40);
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{...readiness,rcSelectable:true,rcCoordinate:sha,status:'BERS_V1_RC_SELECTED'},
      journeys,
      stageD,
    }),
    /non-selectable while blockers exist/u,
  );

  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:readiness.blockers.filter(value=>value.id!=='FRONTEND_DEPLOYMENT_HEADERS'),
        rcSelectable:false,
        rcCoordinate:null,
        status:'BERS_V1_RC_NOT_SELECTABLE',
      },
      journeys,
      stageD,
    }),
    /journey 22 must be PROVEN/u,
  );
});

test('readiness state machine rejects HSME as a v1 blocker or unknown blocker', () => {
  const hsme=readiness.nonBlockingDeferred.find(value=>value.id==='HSME_REAL_MOBILE_EVIDENCE');
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:[...readiness.blockers,{...hsme,releaseGate:'R5'}],
      },
      journeys,
      stageD,
    }),
    /unexpected v1 blocker|physical-mobile HSME/u,
  );
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:[...readiness.blockers,{id:'UNKNOWN',issue:999,releaseGate:'RX'}],
      },
      journeys,
      stageD,
    }),
    /unexpected v1 blocker/u,
  );
});
