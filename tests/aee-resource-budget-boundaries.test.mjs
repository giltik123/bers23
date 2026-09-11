import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const COMPOSITION = 'server/core/composition/createProductionBoundedAgentCompatibility.ts';

test('production cannot instantiate the raw AE-4b serial driver outside the resource-guarded composition seam', () => {
  const matches = execFileSync(
    'git',
    ['grep', '-l', '--fixed-strings', 'new AeeSerialAdmittedGraphDriverV1', '--', 'server/core'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
    .filter(file => !/\.test\.[cm]?[jt]s$/.test(file));

  assert.deepEqual(matches, [COMPOSITION]);
  const composition = readFileSync(COMPOSITION, 'utf8');
  assert.match(composition, /const serial = new AeeSerialAdmittedGraphDriverV1/);
  assert.match(composition, /const aee = new AeeResourceBudgetedSerialDriverV1\(\{[\s\S]*delegate: serial/);
  assert.match(composition, /new BoundedAgentAeeCompatibilityFacade\(\{[\s\S]*\baee,/);
  assert.doesNotMatch(composition, /new BoundedAgentAeeCompatibilityFacade\(\{[\s\S]*aee:\s*serial/);
});

test('resource calibration remains evidence-only and outside production imports', () => {
  const productionImports = execFileSync(
    'git',
    ['grep', '-l', '--fixed-strings', 'capture-aee-resource-budget-browser', '--', 'server', 'src'],
    { encoding: 'utf8' },
  ).trim();
  assert.equal(productionImports, '');
});
