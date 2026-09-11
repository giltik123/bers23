import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const COMPOSITION = 'server/core/composition/createProductionBoundedAgentCompatibility.ts';

test('production installs one AEE resource guard at workflow ticket issuance without wrapping AE-4b state coordination', () => {
  const serialMatches = execFileSync(
    'git',
    ['grep', '-l', '--fixed-strings', 'new AeeSerialAdmittedGraphDriverV1', '--', 'server/core'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter(file => !/\.test\.[cm]?[jt]s$/.test(file));
  assert.deepEqual(serialMatches, [COMPOSITION]);

  // Count the actual production installation expression, not every occurrence of
  // the class-name prefix. The admission module legitimately contains
  // `new AeeWorkflowTicketResourceAdmissionV1Error(...)`, which is not a second
  // guard installation site.
  const guardMatches = execFileSync(
    'git',
    ['grep', '-l', '--fixed-strings', 'installIssueGuard(new AeeWorkflowTicketResourceAdmissionV1', '--', 'server/core'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter(file => !/\.test\.[cm]?[jt]s$/.test(file));
  assert.deepEqual(guardMatches, [COMPOSITION]);

  const composition = readFileSync(COMPOSITION, 'utf8');
  const install = composition.indexOf('installIssueGuard(new AeeWorkflowTicketResourceAdmissionV1');
  const serial = composition.indexOf('const aee = new AeeSerialAdmittedGraphDriverV1');
  const facade = composition.indexOf('new BoundedAgentAeeCompatibilityFacade');
  assert.ok(install >= 0 && serial > install && facade > serial, 'resource admission must be sealed before the AEE driver is exposed through the facade');
  assert.doesNotMatch(composition, /AeeResourceBudgetedSerialDriverV1/);
});

test('resource calibration remains evidence-only and outside production imports', () => {
  const search = spawnSync(
    'git',
    ['grep', '-l', '--fixed-strings', 'capture-aee-resource-budget-browser', '--', 'server', 'src'],
    { encoding: 'utf8' },
  );
  assert.equal(search.error, undefined);
  assert.equal(search.status, 1, `unexpected production calibration import search status ${search.status}: ${search.stderr}`);
  assert.equal(search.stdout.trim(), '');
});
