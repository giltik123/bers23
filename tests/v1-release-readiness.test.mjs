import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const readiness = JSON.parse(await readFile('config/v1-release-readiness.json','utf8'));
const journeys = JSON.parse(await readFile('config/v1-release-journey-matrix.json','utf8'));
const stageD = JSON.parse(await readFile('config/v1-generative-decision-matrix.json','utf8'));
const roadmap = await readFile('BERS_V1_DEVELOPMENT_ROADMAP.md','utf8');

test('RC readiness is fail-closed on exactly the verified external blockers', () => {
  assert.equal(readiness.rcSelectable, false);
  assert.equal(readiness.rcCoordinate, null);
  assert.equal(readiness.status, 'BERS_V1_RC_NOT_SELECTABLE');
  assert.deepEqual(readiness.blockers.map(value=>value.id).sort(), [
    'FRONTEND_DEPLOYMENT_HEADERS',
    'REPOSITORY_MAIN_PROTECTION',
  ]);
  assert.deepEqual(readiness.blockers.map(value=>value.releaseGate).sort(), ['R1','R4']);
});

test('RC guard consumes the accepted Stage D and #233 ledgers instead of open-issue counts', () => {
  assert.equal(stageD.entries.length, 6);
  assert.equal(stageD.entries.every(value=>value.productionEnabled === false), true);
  assert.equal(journeys.entries.filter(value=>value.disposition === 'PROVEN').length, 20);
  assert.equal(journeys.entries.find(value=>value.id === 17).disposition, 'DEFERRED_OUT_OF_V1');
  assert.equal(journeys.entries.find(value=>value.id === 22).disposition, 'DEPLOYMENT_TARGET_PENDING');
  assert.doesNotMatch(JSON.stringify(readiness.blockers), /192|191|155|180|349/);
});

test('optional/deferred work cannot accidentally block RC through this ledger', () => {
  assert.deepEqual(readiness.nonBlockingDeferred.map(value=>value.issue).sort((a,b)=>a-b), [189,192,352]);
  assert.equal(readiness.blockers.some(value=>[189,192,352].includes(value.issue)), false);
  const hsme = readiness.nonBlockingDeferred.find(value=>value.id==='HSME_REAL_MOBILE_EVIDENCE');
  assert.equal(hsme.state,'DEFERRED_POST_V1_RESEARCH');
  assert.deepEqual(hsme.relatedIssues,[862,871,867]);
});

test('readiness classifier emits the non-selectable coordinate and exact blocker set', () => {
  const result = spawnSync(process.execPath,['scripts/check-v1-release-readiness.mjs'],{encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /BERS_V1_RC_NOT_SELECTABLE/);
  for (const id of ['FRONTEND_DEPLOYMENT_HEADERS','REPOSITORY_MAIN_PROTECTION']) {
    assert.match(result.stdout, new RegExp(id));
  }
  assert.match(result.stdout, /DEFERRED_POST_V1_RESEARCH/);
  assert.doesNotMatch(result.stdout, /"id":"HSME_REAL_MOBILE_EVIDENCE","issue":352,"state":"EXTERNAL_PHYSICAL_DEVICE_EVIDENCE_PENDING"/);
});

test('canonical roadmap keeps HSME physical-mobile work post-v1 and non-blocking', () => {
  assert.match(roadmap, /Stage E — Post-v1 BERS Local-First AI Engine R&D/);
  assert.match(roadmap, /Stage E\/HSME is explicitly non-blocking for `BERS_V1_RC` and `BERS v1\.0 RELEASE`/);
  assert.match(roadmap, /HSME remains explicitly non-production\/post-v1/);
  assert.doesNotMatch(roadmap, /at least one functioning real mobile backend is required for the pre-RC feasibility gate/);
  assert.doesNotMatch(roadmap, /R&D validation before v1 is mandatory/);
});

test('selection law forbids an RC SHA while blockers remain', () => {
  assert.match(readiness.selectionLaw, /blockers is empty/);
  assert.match(readiness.selectionLaw, /one exact accepted main SHA/);
  assert.equal(readiness.blockers.length > 0 && readiness.rcSelectable, false);
});
