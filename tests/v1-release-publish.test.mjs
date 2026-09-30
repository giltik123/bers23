import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildV1ReleaseManifest } from '../scripts/generate-v1-release-manifest.mjs';
import { verifyV1RequiredChecks } from '../scripts/verify-v1-required-checks.mjs';

const baseReadiness = JSON.parse(await readFile('config/v1-release-readiness.json','utf8'));
const baseFinalization = JSON.parse(await readFile('config/v1-release-finalization.json','utf8'));
const classification = JSON.parse(await readFile('config/v1-capability-classification.json','utf8'));

function releasedFixture(sha='a'.repeat(40)) {
  const readiness={
    ...baseReadiness,
    blockers: [],
    rcSelectable: true,
    rcCoordinate: sha,
    status: 'BERS_V1_RC_SELECTED',
  };
  const finalization={
    ...baseFinalization,
    status: 'RELEASED',
    rcCoordinate: sha,
    releaseSha: sha,
    releaseTag: 'v1.0.0',
    releaseGenerated: true,
    packageVersionExpected: '1.0.0',
  };
  const pkg={name:'bers-core-app',private:true,version:'1.0.0'};
  const sourceContents={
    'config/v1-release-readiness.json': `${JSON.stringify(readiness,null,2)}\n`,
    'config/v1-release-finalization.json': `${JSON.stringify(finalization,null,2)}\n`,
    'config/v1-capability-classification.json': `${JSON.stringify(classification,null,2)}\n`,
    'docs/v1-release-notes.md': '# BERS v1.0 release notes\n\nFinal production release.\n',
    'docs/v1-release-operations.md': '# BERS v1 operations\n\nImmutable release procedure.\n',
    'package.json': `${JSON.stringify(pkg,null,2)}\n`,
  };
  return {
    sha,
    inputs:{readiness,finalization,classification,pkg},
    sourceContents,
  };
}

test('release manifest is deterministic and binds exact released coordinate plus source digests', () => {
  const fixture=releasedFixture();
  const first=buildV1ReleaseManifest({
    inputs:fixture.inputs,
    releaseSha:fixture.sha,
    sourceContents:fixture.sourceContents,
  });
  const second=buildV1ReleaseManifest({
    inputs:fixture.inputs,
    releaseSha:fixture.sha,
    sourceContents:fixture.sourceContents,
  });

  assert.deepEqual(first,second);
  assert.equal(first.program,'BERS_V1_RELEASE_MANIFEST');
  assert.equal(first.releaseTag,'v1.0.0');
  assert.equal(first.releaseSha,fixture.sha);
  assert.equal(first.packageVersion,'1.0.0');
  assert.equal(first.readiness.blockerCount,0);
  assert.equal(first.finalization.status,'RELEASED');
  assert.match(first.sources['docs/v1-release-notes.md'].sha256,/^[0-9a-f]{64}$/u);
  assert.ok(first.sources['docs/v1-release-notes.md'].bytes > 0);
});

test('release manifest refuses pre-RC notes or a coordinate mismatch', () => {
  const fixture=releasedFixture('b'.repeat(40));

  assert.throws(
    () => buildV1ReleaseManifest({
      inputs:fixture.inputs,
      releaseSha:'c'.repeat(40),
      sourceContents:fixture.sourceContents,
    }),
    /does not equal the accepted release coordinate/u,
  );

  assert.throws(
    () => buildV1ReleaseManifest({
      inputs:fixture.inputs,
      releaseSha:fixture.sha,
      sourceContents:{
        ...fixture.sourceContents,
        'docs/v1-release-notes.md':'# BERS v1.0 release notes — pre-RC package\n',
      },
    }),
    /pre-RC package/u,
  );
});

test('required-check verifier accepts only completed success runs on the exact release SHA', async () => {
  const sha='d'.repeat(40);
  const requiredChecks=['alpha','beta'];
  const fetcher=async () => ({
    status:200,
    async json(){
      return {
        check_runs:[
          {id:1,name:'alpha',status:'completed',conclusion:'success',head_sha:sha,details_url:'https://example/1'},
          {id:2,name:'beta',status:'completed',conclusion:'success',head_sha:sha,details_url:'https://example/2'},
        ],
      };
    },
  });

  const evidence=await verifyV1RequiredChecks({
    repository:'giltik123/bers23',
    sha,
    token:'token',
    requiredChecks,
    fetcher,
  });
  assert.equal(evidence.kind,'BERS_V1_REQUIRED_CHECKS_EVIDENCE');
  assert.equal(evidence.sha,sha);
  assert.equal(evidence.checks.alpha.status,'SUCCESS');
  assert.equal(evidence.checks.beta.status,'SUCCESS');
});

test('required-check verifier fails closed for missing, non-success or wrong-SHA checks', async () => {
  const sha='e'.repeat(40);
  const fetcher=async () => ({
    status:200,
    async json(){
      return {
        check_runs:[
          {id:1,name:'alpha',status:'completed',conclusion:'failure',head_sha:sha},
          {id:2,name:'beta',status:'completed',conclusion:'success',head_sha:'f'.repeat(40)},
        ],
      };
    },
  });

  await assert.rejects(
    verifyV1RequiredChecks({
      repository:'giltik123/bers23',
      sha,
      token:'token',
      requiredChecks:['alpha','beta','gamma'],
      fetcher,
    }),
    /alpha, beta, gamma/u,
  );
});

test('publish workflow is manual-write, exact-SHA and cleanup guarded', async () => {
  const workflow=await readFile('.github/workflows/v1-release-publish.yml','utf8');

  assert.match(workflow,/workflow_dispatch:\s*\n\s*inputs:/u);
  assert.match(workflow,/release_sha:/u);
  assert.match(workflow,/confirm_release_tag:/u);
  assert.match(workflow,/release-publish-contract:\s*\n\s*if: github\.event_name == 'pull_request'/u);
  assert.match(workflow,/publish-v1:\s*\n\s*if: github\.event_name == 'workflow_dispatch'/u);
  assert.match(workflow,/contents: write/u);
  assert.match(workflow,/checks: read/u);
  assert.match(workflow,/ref: \$\{\{ inputs\.release_sha \}\}/u);
  assert.match(workflow,/test "\$\{GITHUB_REF_NAME\}" = main/u);
  assert.match(workflow,/git rev-parse origin\/main/u);
  assert.match(workflow,/check-v1-release-finalization\.mjs/u);
  assert.match(workflow,/\^BERS_V1_0_RELEASED /u);
  assert.match(workflow,/verify-v1-required-checks\.mjs/u);
  assert.match(workflow,/generate-v1-release-manifest\.mjs/u);
  assert.match(workflow,/! gh release view v1\.0\.0/u);
  assert.match(workflow,/! git ls-remote --exit-code --tags origin 'refs\/tags\/v1\.0\.0'/u);
  assert.match(workflow,/gh release create v1\.0\.0/u);
  assert.match(workflow,/--target "\$\{RELEASE_SHA\}"/u);
  assert.match(workflow,/gh release upload v1\.0\.0/u);
  assert.match(workflow,/git rev-list -n1 v1\.0\.0/u);
  assert.match(workflow,/cmp \.release-pack\/bers-v1\.0\.0-release-manifest\.json/u);
  assert.match(workflow,/release delete v1\.0\.0 --yes --cleanup-tag/u);
});


test('every mandatory release context is produced on an exact main push', async () => {
  const requiredWorkflows=[
    '.github/workflows/node.js.yml',
    '.github/workflows/sprint-6.42-integration.yml',
    '.github/workflows/security-audit.yml',
    '.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
    '.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml',
    '.github/workflows/sprint-6.42d4-tiny-sd-ort-memory.yml',
    '.github/workflows/sprint-6.42d5-tiny-sd-pipeline.yml',
  ];
  for (const workflowPath of requiredWorkflows) {
    const source=await readFile(workflowPath,'utf8');
    assert.match(
      source,
      /on:\s*\n(?:[\s\S]*?\n)?\s*push:\s*\n\s*branches:\s*\[(?:\s*)["']main["'](?:\s*)\]/u,
      `${workflowPath} must run on main push`,
    );
  }

  for (const workflowPath of requiredWorkflows.slice(3)) {
    const source=await readFile(workflowPath,'utf8');
    assert.match(source,/BASE_SHA: \$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.base\.sha \|\| github\.event\.before \}\}/u);
    assert.match(source,/HEAD_SHA: \$\{\{ github\.event_name == 'pull_request' && github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/u);
    assert.match(source,/\[ "\$\{EVENT_NAME\}" != "pull_request" \] && \[ "\$\{EVENT_NAME\}" != "push" \]/u);
  }
});
