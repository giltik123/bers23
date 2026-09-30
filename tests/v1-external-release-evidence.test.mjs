import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { requiredProductionFrontendHeaders } from '../config/frontendSecurityPolicy.mjs';
import { buildFrontendSecurityEvidence, verifyFrontendSecurityHeaders } from '../scripts/verify-frontend-security-headers.mjs';
import {
  REQUIRED_V1_MAIN_CHECKS,
  verifyGithubMainProtection,
} from '../scripts/verify-github-main-protection.mjs';

function responseJson(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function acceptedRuleset(id = 7) {
  return {
    id,
    name: 'BERS immutable main release authority',
    target: 'branch',
    enforcement: 'active',
    bypass_actors: [],
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [
      { type: 'pull_request', parameters: { required_approving_review_count: 1 } },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: true,
          required_status_checks: REQUIRED_V1_MAIN_CHECKS.map(context => ({ context })),
        },
      },
      { type: 'non_fast_forward' },
      { type: 'deletion' },
    ],
  };
}

test('frontend verifier returns the exact observed release headers and HTML digest', async () => {
  const html = '<!doctype html><html><body>BERS v1</body></html>';
  const required = requiredProductionFrontendHeaders('/api/core');
  const fetcher = async () => new Response(html, {
    status: 200,
    headers: {
      ...required,
      'Content-Type': 'text/html; charset=utf-8',
      'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    },
  });

  const result = await verifyFrontendSecurityHeaders({
    frontendUrl: 'https://app.example.test/',
    coreApiUrl: '/api/core',
    fetcher,
  });

  assert.equal(result.frontendUrl, 'https://app.example.test/');
  assert.equal(result.observedHeaders['Content-Security-Policy'], required['Content-Security-Policy']);
  assert.equal(result.observedHeaders['X-Content-Type-Options'], 'nosniff');
  assert.equal(result.observedHeaders['X-Frame-Options'], 'DENY');
  assert.equal(result.observedHeaders['Referrer-Policy'], 'no-referrer');
  assert.equal(result.observedHeaders['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  assert.equal(result.htmlSha256, createHash('sha256').update(html).digest('hex'));
});


test('hosted frontend evidence is self-contained and binds exact workflow provenance', () => {
  const sha='a'.repeat(40);
  const evidence=buildFrontendSecurityEvidence({
    frontendUrl:'https://app.example.test/',
    coreApiUrl:'/api/core',
    status:200,
    requiredHeaders:{},
    observedHeaders:{},
    htmlSha256:'b'.repeat(64),
  },{
    verifiedAt:'2026-09-30T12:00:00.000Z',
    verifiedSha:sha,
    workflowRunUrl:'https://github.com/giltik123/bers23/actions/runs/123456789',
    artifactName:`bers-v1-frontend-security-${sha}`,
  });
  assert.equal(evidence.verifiedSha,sha);
  assert.equal(evidence.workflowRunUrl,'https://github.com/giltik123/bers23/actions/runs/123456789');
  assert.equal(evidence.artifactName,`bers-v1-frontend-security-${sha}`);
  assert.equal(evidence.verifiedAt,'2026-09-30T12:00:00.000Z');
});

test('hosted frontend evidence rejects partial or mismatched provenance', () => {
  const base={
    frontendUrl:'https://app.example.test/',
    coreApiUrl:'/api/core',
    status:200,
    requiredHeaders:{},
    observedHeaders:{},
    htmlSha256:'c'.repeat(64),
  };
  assert.throws(
    () => buildFrontendSecurityEvidence(base,{verifiedSha:'d'.repeat(40)}),
    /workflowRunUrl is invalid/u,
  );
  assert.throws(
    () => buildFrontendSecurityEvidence(base,{
      verifiedSha:'d'.repeat(40),
      workflowRunUrl:'https://github.com/giltik123/bers23/actions/runs/123',
      artifactName:'wrong',
    }),
    /artifactName must bind verifiedSha/u,
  );
});

test('GitHub verifier accepts an active no-bypass main ruleset with the full required release check set', async () => {
  const calls = [];
  const fetcher = async url => {
    calls.push(url);
    if (url.endsWith('/rulesets?includes_parents=true')) {
      return responseJson([{ id: 7, name: 'summary', target: 'branch', enforcement: 'active' }]);
    }
    if (url.endsWith('/rulesets/7')) return responseJson(acceptedRuleset(7));
    throw new Error('unexpected URL '+url);
  };

  const result = await verifyGithubMainProtection({
    token: 'admin-read-token',
    repository: 'giltik123/bers23',
    branch: 'main',
    fetcher,
  });

  assert.equal(result.mode, 'RULESET');
  assert.deepEqual(result.requiredChecks, [...REQUIRED_V1_MAIN_CHECKS]);
  assert.deepEqual(result.ruleset.requiredStatusChecks, [...REQUIRED_V1_MAIN_CHECKS].sort());
  assert.equal(result.ruleset.strictRequiredStatusChecks, true);
  assert.equal(result.ruleset.forcePushBlocked, true);
  assert.equal(result.ruleset.deletionBlocked, true);
  assert.deepEqual(result.ruleset.bypassActors, []);
  assert.equal(calls.some(url => url.includes('/branches/main/protection')), false);
});

test('GitHub verifier accepts strict branch protection when no active ruleset is present', async () => {
  const fetcher = async url => {
    if (url.endsWith('/rulesets?includes_parents=true')) return responseJson([]);
    if (url.endsWith('/branches/main/protection')) {
      return responseJson({
        required_status_checks: {
          strict: true,
          contexts: [...REQUIRED_V1_MAIN_CHECKS],
          checks: [],
        },
        required_pull_request_reviews: {
          required_approving_review_count: 1,
          bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
        },
        enforce_admins: { enabled: true },
        allow_force_pushes: { enabled: false },
        allow_deletions: { enabled: false },
      });
    }
    throw new Error('unexpected URL '+url);
  };

  const result = await verifyGithubMainProtection({
    token: 'admin-read-token',
    fetcher,
  });

  assert.equal(result.mode, 'BRANCH_PROTECTION');
  assert.equal(result.branchProtection.enforceAdmins, true);
  assert.equal(result.branchProtection.strictRequiredStatusChecks, true);
  assert.deepEqual(result.branchProtection.requiredStatusChecks, [...REQUIRED_V1_MAIN_CHECKS].sort());
});

test('GitHub verifier rejects missing release checks and unsafe force-push/deletion policy', async () => {
  const base = {
    required_status_checks: {
      strict: true,
      contexts: REQUIRED_V1_MAIN_CHECKS.slice(0, -1),
      checks: [],
    },
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      bypass_pull_request_allowances: { users: [], teams: [], apps: [] },
    },
    enforce_admins: { enabled: true },
    allow_force_pushes: { enabled: false },
    allow_deletions: { enabled: false },
  };
  const fetcherMissing = async url => url.includes('/rulesets')
    ? responseJson([])
    : responseJson(base);
  await assert.rejects(
    () => verifyGithubMainProtection({ token: 'admin-read-token', fetcher: fetcherMissing }),
    /missing required release checks/u,
  );

  const fetcherUnsafe = async url => url.includes('/rulesets')
    ? responseJson([])
    : responseJson({
        ...base,
        required_status_checks: { strict: true, contexts: [...REQUIRED_V1_MAIN_CHECKS] },
        allow_force_pushes: { enabled: true },
        allow_deletions: { enabled: true },
      });
  await assert.rejects(
    () => verifyGithubMainProtection({ token: 'admin-read-token', fetcher: fetcherUnsafe }),
    /block force pushes/u,
  );
});

test('ruleset evidence rejects bypass actors rather than hiding administrator exceptions', async () => {
  const ruleset = acceptedRuleset(9);
  ruleset.bypass_actors = [{ actor_id: 1, actor_type: 'RepositoryRole', bypass_mode: 'always' }];
  const fetcher = async url => {
    if (url.endsWith('/rulesets?includes_parents=true')) return responseJson([{ id: 9 }]);
    if (url.endsWith('/rulesets/9')) return responseJson(ruleset);
    if (url.endsWith('/branches/main/protection')) return responseJson({ message: 'not protected' }, 404);
    throw new Error('unexpected URL '+url);
  };
  await assert.rejects(
    () => verifyGithubMainProtection({ token: 'admin-read-token', fetcher }),
    /No accepted active ruleset was found/u,
  );
});


test('external release evidence workflow performs live exact-SHA frontend capture on manual dispatch', async () => {
  const workflow = await readFile('.github/workflows/v1-external-release-evidence.yml', 'utf8');

  assert.match(workflow, /workflow_dispatch:\s*\n\s*inputs:/u);
  assert.match(workflow, /frontend_url:\s*\n[\s\S]*required:\s*true/u);
  assert.match(workflow, /core_api_url:\s*\n[\s\S]*default:\s*\/api\/core/u);
  assert.match(workflow, /live-frontend-release-evidence:/u);
  assert.match(workflow, /if:\s*github\.event_name == 'workflow_dispatch'/u);
  assert.match(workflow, /ref:\s*\$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /npm run release:evidence:frontend/u);
  assert.match(workflow, /release-evidence\/v1\/frontend-security\.json/u);
  assert.match(workflow, /actions\/upload-artifact@v4/u);
  assert.match(workflow, /bers-v1-frontend-security-\$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /VERIFIED_SHA:\s*\$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /WORKFLOW_RUN_URL:\s*https:\/\/github\.com\/\$\{\{ github\.repository \}\}\/actions\/runs\/\$\{\{ github\.run_id \}\}/u);
  assert.match(workflow, /ARTIFACT_NAME:\s*bers-v1-frontend-security-\$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /evidence\.verifiedSha/u);
  assert.match(workflow, /evidence\.workflowRunUrl/u);
  assert.match(workflow, /evidence\.artifactName/u);
  assert.match(workflow, /Check committed diff whitespace\s*\n\s*if:\s*github\.event_name == 'pull_request'/u);
});


test('owner-only evidence dispatch bridge resolves exact hosted run and reports artifact provenance', async () => {
  const workflow = await readFile('.github/workflows/v1-external-release-evidence-dispatch.yml', 'utf8');

  assert.match(workflow, /issues:\s*write/u);
  assert.match(workflow, /github\.event\.issue\.number == 233/u);
  assert.match(workflow, /github\.event\.comment\.user\.login == github\.repository_owner/u);
  assert.match(workflow, /github\.event\.comment\.author_association == 'OWNER'/u);
  assert.match(workflow, /github\.event\.comment\.body == '\/bers-v1-dispatch-frontend-evidence'/u);
  assert.match(workflow, /getBranch/u);
  assert.match(workflow, /expectedSha = branch\.data\.commit\.sha/u);
  assert.match(workflow, /knownRunIds/u);
  assert.match(workflow, /createWorkflowDispatch/u);
  assert.match(workflow, /candidate\.head_sha === expectedSha/u);
  assert.match(workflow, /candidate\.event === 'workflow_dispatch'/u);
  assert.match(workflow, /run\.conclusion !== 'success'/u);
  assert.match(workflow, /listWorkflowRunArtifacts/u);
  assert.match(workflow, /bers-v1-frontend-security-/u);
  assert.match(workflow, /github\.rest\.issues\.createComment/u);
  assert.match(workflow, /workflowRunUrl/u);
  assert.match(workflow, /artifactName/u);
});
