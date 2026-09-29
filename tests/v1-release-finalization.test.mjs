import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const finalization = JSON.parse(await readFile('config/v1-release-finalization.json','utf8'));
const readiness = JSON.parse(await readFile('config/v1-release-readiness.json','utf8'));
const classification = JSON.parse(await readFile('config/v1-capability-classification.json','utf8'));
const pkg = JSON.parse(await readFile('package.json','utf8'));

test('current release finalization stays blocked on the verified external blockers', () => {
  assert.equal(finalization.status,'BLOCKED_BEFORE_RC');
  assert.equal(readiness.rcSelectable,false);
  assert.ok(readiness.blockers.length > 0);
  assert.equal(finalization.rcCoordinate,null);
  assert.equal(finalization.releaseSha,null);
  assert.equal(finalization.releaseTag,null);
  assert.equal(finalization.releaseGenerated,false);
});

test('pre-RC repository cannot claim the final package version or tag', () => {
  assert.equal(pkg.version,'0.0.0');
  assert.equal(finalization.packageVersionExpected,'0.0.0');
  assert.equal(finalization.targetVersion,'1.0.0');
  assert.equal(classification.targetVersion,'1.0.0');
  assert.notEqual(finalization.releaseTag,'v1.0.0');
});

test('finalization checker emits a controlled blocked disposition, not a release claim', () => {
  const result=spawnSync(process.execPath,['scripts/check-v1-release-finalization.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/BERS_V1_RELEASE_FINALIZATION_BLOCKED/);
  assert.doesNotMatch(result.stdout,/BERS_V1_0_RELEASED/);
});

test('final release laws bind version tag and exact accepted SHA', () => {
  const laws=finalization.laws.join('\n');
  assert.match(laws,/package\.json version 1\.0\.0/);
  assert.match(laws,/releaseTag v1\.0\.0/);
  assert.match(laws,/releaseSha equal to the exact accepted release coordinate/);
  assert.match(laws,/release-affecting fix after RC moves the coordinate/);
});

test('finalization package points at accepted release-note classification and operations sources', async () => {
  for (const path of [
    finalization.readinessSource,
    finalization.classificationSource,
    finalization.releaseNotesSource,
    finalization.operationsSource,
  ]) {
    const content=await readFile(path,'utf8');
    assert.ok(content.trim(),path);
  }
});
