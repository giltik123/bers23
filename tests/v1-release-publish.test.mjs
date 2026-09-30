import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { buildV1ReleaseManifest } from '../scripts/generate-v1-release-manifest.mjs';
import {
  V1_RELEASE_METADATA_PATHS,
  validateV1ReleaseDeltaPaths,
  verifyV1ReleaseDelta,
} from '../scripts/verify-v1-release-delta.mjs';
import { verifyV1RequiredChecks } from '../scripts/verify-v1-required-checks.mjs';

const baseReadiness = JSON.parse(await readFile('config/v1-release-readiness.json','utf8'));
const baseFinalization = JSON.parse(await readFile('config/v1-release-finalization.json','utf8'));
const baseClassification = JSON.parse(await readFile('config/v1-capability-classification.json','utf8'));
const baseJourneys = JSON.parse(await readFile('config/v1-release-journey-matrix.json','utf8'));

function frontendEvidence(sha) {
  return {
    kind:'BERS_V1_FRONTEND_SECURITY_EVIDENCE',
    verifiedSha:sha,
    frontendUrl:'https://app.example.test',
    coreApiUrl:'https://api.example.test/api/core',
    htmlSha256:'a'.repeat(64),
    verifiedAt:'2026-09-30T12:00:00.000Z',
    workflowRunUrl:'https://github.com/giltik123/bers23/actions/runs/123456789',
    artifactName:`bers-v1-frontend-security-${sha}`,
  };
}

function authorizedFixture({
  rcSha='1'.repeat(40),
  releaseSha='2'.repeat(40),
}={}) {
  const readiness={
    ...baseReadiness,
    blockers:[],
    rcSelectable:true,
    rcCoordinate:rcSha,
    status:'BERS_V1_RC_SELECTED',
  };
  const finalization={
    ...baseFinalization,
    status:'RELEASE_AUTHORIZED',
    rcCoordinate:rcSha,
    releaseSha:null,
    releaseTag:'v1.0.0',
    releaseGenerated:false,
    publicationEvidence:null,
    packageVersionExpected:'1.0.0',
  };
  const classification={...baseClassification,releaseState:'RELEASE_AUTHORIZED'};
  const journeys={
    ...baseJourneys,
    entries:baseJourneys.entries.map(value=>value.id===22
      ? {...value,disposition:'PROVEN',liveEvidence:frontendEvidence(rcSha)}
      : value),
  };
  const pkg={name:'bers-core-app',private:true,version:'1.0.0'};
  const sourceContents={
    'config/v1-release-readiness.json':`${JSON.stringify(readiness,null,2)}\n`,
    'config/v1-release-finalization.json':`${JSON.stringify(finalization,null,2)}\n`,
    'config/v1-capability-classification.json':`${JSON.stringify(classification,null,2)}\n`,
    'config/v1-release-journey-matrix.json':`${JSON.stringify(journeys,null,2)}\n`,
    'docs/v1-release-notes.md':'# BERS v1.0 release notes\n\nFinal production release.\n',
    'docs/v1-release-operations.md':'# BERS v1 operations\n\nImmutable release procedure.\n',
    'package.json':`${JSON.stringify(pkg,null,2)}\n`,
    'package-lock.json':`${JSON.stringify({name:pkg.name,version:pkg.version,lockfileVersion:3,packages:{'':{name:pkg.name,version:pkg.version}}},null,2)}\n`,
  };
  return {
    rcSha,
    releaseSha,
    inputs:{readiness,finalization,classification,pkg},
    journeys,
    sourceContents,
  };
}

test('release manifest is deterministic and binds selected RC separately from runtime publication SHA', () => {
  const fixture=authorizedFixture();
  const first=buildV1ReleaseManifest({
    inputs:fixture.inputs,
    releaseSha:fixture.releaseSha,
    sourceContents:fixture.sourceContents,
  });
  const second=buildV1ReleaseManifest({
    inputs:fixture.inputs,
    releaseSha:fixture.releaseSha,
    sourceContents:fixture.sourceContents,
  });

  assert.deepEqual(first,second);
  assert.equal(first.schemaVersion,2);
  assert.equal(first.program,'BERS_V1_RELEASE_MANIFEST');
  assert.equal(first.releaseTag,'v1.0.0');
  assert.equal(first.rcCoordinate,fixture.rcSha);
  assert.equal(first.releaseSha,fixture.releaseSha);
  assert.notEqual(first.releaseSha,first.rcCoordinate);
  assert.equal(first.packageVersion,'1.0.0');
  assert.equal(first.readiness.blockerCount,0);
  assert.equal(first.finalization.status,'RELEASE_AUTHORIZED');
  assert.equal(first.finalization.releaseSha,null);
  assert.equal(first.classification.releaseState,'RELEASE_AUTHORIZED');
  assert.equal(first.frontendDeploymentEvidence.verifiedSha,fixture.rcSha);
  assert.match(first.sources['config/v1-release-journey-matrix.json'].sha256,/^[0-9a-f]{64}$/u);
  assert.match(first.sources['package-lock.json'].sha256,/^[0-9a-f]{64}$/u);
});

test('release manifest refuses pre-RC notes or frontend evidence bound to another RC', () => {
  const fixture=authorizedFixture();

  assert.throws(
    () => buildV1ReleaseManifest({
      inputs:fixture.inputs,
      releaseSha:fixture.releaseSha,
      sourceContents:{
        ...fixture.sourceContents,
        'docs/v1-release-notes.md':'# BERS v1.0 release notes — pre-RC package\n',
      },
    }),
    /pre-RC package/u,
  );

  const badJourneys={
    ...fixture.journeys,
    entries:fixture.journeys.entries.map(value=>value.id===22
      ? {...value,liveEvidence:frontendEvidence('3'.repeat(40))}
      : value),
  };
  assert.throws(
    () => buildV1ReleaseManifest({
      inputs:fixture.inputs,
      releaseSha:fixture.releaseSha,
      sourceContents:{
        ...fixture.sourceContents,
        'config/v1-release-journey-matrix.json':`${JSON.stringify(badJourneys,null,2)}\n`,
      },
    }),
    /live evidence must bind the selected RC coordinate/u,
  );
});

test('release delta accepts only the finite release-metadata allowlist', () => {
  assert.deepEqual(
    validateV1ReleaseDeltaPaths([
      'package.json',
      'config/v1-release-finalization.json',
      'docs/v1-release-notes.md',
    ]),
    [
      'config/v1-release-finalization.json',
      'docs/v1-release-notes.md',
      'package.json',
    ],
  );
  assert.ok(V1_RELEASE_METADATA_PATHS.includes('config/v1-release-journey-matrix.json'));
  assert.ok(V1_RELEASE_METADATA_PATHS.includes('package-lock.json'));
  assert.throws(
    () => validateV1ReleaseDeltaPaths(['src/pages/Editor.jsx']),
    /product\/non-metadata drift/u,
  );
  assert.throws(
    () => validateV1ReleaseDeltaPaths(['server/core/server.ts']),
    /product\/non-metadata drift/u,
  );
});

test('release delta requires RC ancestry and a non-empty metadata transition', () => {
  const rcSha='4'.repeat(40);
  const releaseSha='5'.repeat(40);
  const calls=[];
  const git=(args,{allowExitOne=false}={})=>{
    calls.push(args);
    if (args[0]==='merge-base') return {status:0,stdout:'',stderr:''};
    return {
      status:0,
      stdout:'config/v1-release-finalization.json\0package.json\0',
      stderr:'',
    };
  };
  const evidence=verifyV1ReleaseDelta({rcSha,releaseSha,git});
  assert.equal(evidence.kind,'BERS_V1_RELEASE_DELTA_EVIDENCE');
  assert.equal(evidence.rcSha,rcSha);
  assert.equal(evidence.releaseSha,releaseSha);
  assert.deepEqual(evidence.changedPaths,['config/v1-release-finalization.json','package.json']);
  assert.equal(calls.length,2);

  assert.throws(
    () => verifyV1ReleaseDelta({
      rcSha,
      releaseSha,
      git:args=>args[0]==='merge-base'
        ? {status:1,stdout:'',stderr:''}
        : {status:0,stdout:'',stderr:''},
    }),
    /must be an ancestor/u,
  );
  assert.throws(
    () => verifyV1ReleaseDelta({
      rcSha,
      releaseSha,
      git:args=>args[0]==='merge-base'
        ? {status:0,stdout:'',stderr:''}
        : {status:0,stdout:'',stderr:''},
    }),
    /must contain an explicit metadata transition/u,
  );
});

test('required-check verifier accepts only completed success runs on the exact release SHA', async () => {
  const sha='6'.repeat(40);
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
  const sha='7'.repeat(40);
  const fetcher=async () => ({
    status:200,
    async json(){
      return {
        check_runs:[
          {id:1,name:'alpha',status:'completed',conclusion:'failure',head_sha:sha},
          {id:2,name:'beta',status:'completed',conclusion:'success',head_sha:'8'.repeat(40)},
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

test('publish workflow is manual-write, authorization-gated, delta-guarded and cleanup-owned', async () => {
  const workflow=await readFile('.github/workflows/v1-release-publish.yml','utf8');

  assert.match(workflow,/workflow_dispatch:\s*\n\s*inputs:/u);
  assert.match(workflow,/Exact current main SHA in RELEASE_AUTHORIZED state/u);
  assert.match(workflow,/release-publish-contract:\s*\n\s*if: github\.event_name == 'pull_request'/u);
  assert.match(workflow,/publish-v1:\s*\n\s*if: github\.event_name == 'workflow_dispatch'/u);
  assert.match(workflow,/contents: write/u);
  assert.match(workflow,/checks: read/u);
  assert.match(workflow,/ref: \$\{\{ inputs\.release_sha \}\}/u);
  assert.match(workflow,/test "\$\{GITHUB_REF_NAME\}" = main/u);
  assert.match(workflow,/git rev-parse origin\/main/u);
  assert.match(workflow,/check-v1-release-readiness\.mjs/u);
  assert.match(workflow,/\^BERS_V1_RC_SELECTED /u);
  assert.match(workflow,/\^BERS_V1_RELEASE_AUTHORIZED /u);
  assert.doesNotMatch(workflow,/grep -q '\^BERS_V1_0_RELEASED /u);
  assert.match(workflow,/RC_SHA=/u);
  assert.match(workflow,/verify-v1-release-delta\.mjs/u);
  assert.match(workflow,/verify-v1-required-checks\.mjs/u);
  assert.match(workflow,/generate-v1-release-manifest\.mjs/u);
  assert.match(workflow,/finalization\.status !== 'RELEASE_AUTHORIZED'/u);
  assert.match(workflow,/! gh release view v1\.0\.0/u);
  assert.match(workflow,/! git ls-remote --exit-code --tags origin 'refs\/tags\/v1\.0\.0'/u);
  assert.match(workflow,/gh release create v1\.0\.0/u);
  assert.match(workflow,/--target "\$\{RELEASE_SHA\}"/u);
  assert.match(workflow,/BERS_V1_PUBLICATION_EVIDENCE/u);
  assert.match(workflow,/releaseManifestSha256/u);
  assert.match(workflow,/requiredChecksSha256/u);
  assert.match(workflow,/releaseDeltaSha256/u);
  assert.match(workflow,/gh release upload v1\.0\.0/u);
  assert.match(workflow,/publication-evidence\.json/u);
  assert.match(workflow,/git rev-list -n1 v1\.0\.0/u);
  assert.match(workflow,/cmp \.release-pack\/publication-evidence\.json/u);
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

test('required-check verifier paginates exact-SHA check runs beyond the first 100 jobs', async () => {
  const sha='9'.repeat(40);
  const requiredChecks=['late-wrapper'];
  const calls=[];
  const fetcher=async url => {
    calls.push(url);
    const page=new URL(url).searchParams.get('page');
    if (page === '1') {
      return {
        status:200,
        async json(){
          return {
            total_count:101,
            check_runs:Array.from({length:100},(_,index)=>({
              id:index+1,
              name:`noise-${index}`,
              status:'completed',
              conclusion:'success',
              head_sha:sha,
            })),
          };
        },
      };
    }
    return {
      status:200,
      async json(){
        return {
          total_count:101,
          check_runs:[
            {id:101,name:'late-wrapper',status:'completed',conclusion:'success',head_sha:sha},
          ],
        };
      },
    };
  };

  const evidence=await verifyV1RequiredChecks({
    repository:'giltik123/bers23',
    sha,
    token:'token',
    requiredChecks,
    fetcher,
  });
  assert.equal(evidence.checks['late-wrapper'].status,'SUCCESS');
  assert.equal(calls.length,2);
  assert.match(calls[0],/[?&]page=1(?:&|$)/u);
  assert.match(calls[1],/[?&]page=2(?:&|$)/u);
});
