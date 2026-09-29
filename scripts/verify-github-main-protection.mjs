import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED_V1_MAIN_CHECKS = Object.freeze([
  'BERS Required Acceptance',
  'integrated-contract',
  'npm-production-audit',
  'fp16-webgpu-feasibility',
  'wasm-compact-feasibility',
  'ort-memory-latency-feasibility',
  'short-pipeline-measurement',
]);

const API_VERSION = '2026-03-10';

export async function verifyGithubMainProtection(input = {}) {
  const repository = normalizeRepository(input.repository ?? 'giltik123/bers23');
  const branch = normalizeToken(input.branch ?? 'main', 'branch');
  const token = normalizeToken(input.token, 'GITHUB_TOKEN');
  const fetcher = input.fetcher ?? globalThis.fetch;
  const requiredChecks = normalizeRequiredChecks(input.requiredChecks ?? REQUIRED_V1_MAIN_CHECKS);
  if (typeof fetcher !== 'function') throw new Error('GitHub main-protection verifier requires fetch');

  const base = `https://api.github.com/repos/${repository}`;
  const headers = Object.freeze({
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'bers-v1-release-protection-verifier',
  });

  let rulesetEvidence = null;
  let rulesetReadError = null;
  try {
    const summaries = await getJson(fetcher, `${base}/rulesets?includes_parents=true`, headers);
    if (!Array.isArray(summaries)) throw new Error('GitHub rulesets response must be an array');
    for (const summary of summaries) {
      if (!Number.isSafeInteger(summary?.id)) continue;
      const detail = await getJson(fetcher, `${base}/rulesets/${summary.id}`, headers);
      const candidate = validateRuleset(detail, branch, requiredChecks);
      if (candidate) {
        rulesetEvidence = candidate;
        break;
      }
    }
  } catch (error) {
    rulesetReadError = error instanceof Error ? error.message : String(error);
  }

  if (rulesetEvidence) {
    return Object.freeze({
      repository,
      branch,
      mode: 'RULESET',
      requiredChecks,
      ruleset: rulesetEvidence,
      rulesetReadError: null,
    });
  }

  let protection;
  try {
    protection = await getJson(fetcher, `${base}/branches/${encodeURIComponent(branch)}/protection`, headers);
  } catch (error) {
    const suffix = rulesetReadError ? ` Ruleset read also failed: ${rulesetReadError}` : '';
    throw new Error(`No accepted active ruleset was found and branch protection could not be verified: ${error instanceof Error ? error.message : String(error)}.${suffix}`);
  }
  const branchEvidence = validateBranchProtection(protection, requiredChecks);
  return Object.freeze({
    repository,
    branch,
    mode: 'BRANCH_PROTECTION',
    requiredChecks,
    branchProtection: branchEvidence,
    rulesetReadError,
  });
}

function validateRuleset(value, branch, requiredChecks) {
  if (!value || value.target !== 'branch' || value.enforcement !== 'active') return null;
  if (!rulesetTargetsBranch(value.conditions?.ref_name, branch)) return null;
  const bypassActors = Array.isArray(value.bypass_actors) ? value.bypass_actors : [];
  if (bypassActors.length !== 0) return null;

  const rules = Array.isArray(value.rules) ? value.rules : [];
  const byType = new Map(rules.map(rule => [rule?.type, rule]));
  for (const type of ['pull_request', 'required_status_checks', 'non_fast_forward', 'deletion']) {
    if (!byType.has(type)) return null;
  }

  const pullRequest = byType.get('pull_request');
  const approvals = pullRequest?.parameters?.required_approving_review_count;
  if (!Number.isSafeInteger(approvals) || approvals < 1) return null;

  const statusRule = byType.get('required_status_checks');
  const checks = Array.isArray(statusRule?.parameters?.required_status_checks)
    ? statusRule.parameters.required_status_checks.map(item => item?.context).filter(Boolean)
    : [];
  if (statusRule?.parameters?.strict_required_status_checks_policy !== true) return null;
  requireChecks(checks, requiredChecks, 'ruleset');

  return Object.freeze({
    id: value.id,
    name: String(value.name ?? ''),
    enforcement: value.enforcement,
    target: value.target,
    requiredApprovingReviewCount: approvals,
    requiredStatusChecks: Object.freeze([...checks].sort()),
    strictRequiredStatusChecks: true,
    forcePushBlocked: true,
    deletionBlocked: true,
    bypassActors: Object.freeze([]),
  });
}

function validateBranchProtection(value, requiredChecks) {
  if (!value || typeof value !== 'object') throw new Error('Branch protection response is invalid');
  const status = value.required_status_checks;
  if (!status || status.strict !== true) throw new Error('Branch protection must require strict status checks');
  const contexts = new Set([
    ...(Array.isArray(status.contexts) ? status.contexts : []),
    ...(Array.isArray(status.checks) ? status.checks.map(item => item?.context).filter(Boolean) : []),
  ]);
  requireChecks([...contexts], requiredChecks, 'branch protection');

  const reviews = value.required_pull_request_reviews;
  const approvals = reviews?.required_approving_review_count;
  if (!Number.isSafeInteger(approvals) || approvals < 1) {
    throw new Error('Branch protection must require at least one pull-request approval');
  }
  if (value.enforce_admins?.enabled !== true) throw new Error('Branch protection must enforce rules for administrators');
  if (value.allow_force_pushes?.enabled !== false) throw new Error('Branch protection must block force pushes');
  if (value.allow_deletions?.enabled !== false) throw new Error('Branch protection must block branch deletion');

  const bypass = reviews?.bypass_pull_request_allowances;
  const bypassCount = ['users', 'teams', 'apps']
    .flatMap(key => Array.isArray(bypass?.[key]) ? bypass[key] : []).length;
  if (bypassCount !== 0) throw new Error('Branch protection must not contain undocumented pull-request bypass actors');

  return Object.freeze({
    requiredApprovingReviewCount: approvals,
    requiredStatusChecks: Object.freeze([...contexts].sort()),
    strictRequiredStatusChecks: true,
    enforceAdmins: true,
    forcePushBlocked: true,
    deletionBlocked: true,
    bypassActors: Object.freeze([]),
  });
}

function rulesetTargetsBranch(refName, branch) {
  const include = Array.isArray(refName?.include) ? refName.include : [];
  const exclude = Array.isArray(refName?.exclude) ? refName.exclude : [];
  const accepted = new Set(['~DEFAULT_BRANCH', '~ALL', branch, `refs/heads/${branch}`]);
  const excluded = new Set(['~DEFAULT_BRANCH', branch, `refs/heads/${branch}`]);
  return include.some(value => accepted.has(value)) && !exclude.some(value => excluded.has(value));
}

function requireChecks(actual, required, source) {
  const present = new Set(actual);
  const missing = required.filter(context => !present.has(context));
  if (missing.length) throw new Error(`${source} is missing required release checks: ${missing.join(', ')}`);
}

async function getJson(fetcher, url, headers) {
  const response = await fetcher(url, { method: 'GET', headers, redirect: 'error' });
  if (!response || typeof response.status !== 'number') throw new Error('GitHub verifier received an invalid response');
  if (response.status < 200 || response.status >= 300) {
    const body = await response.text().catch(() => '');
    throw new Error(`GitHub API ${response.status} for ${url}${body ? `: ${body.slice(0, 240)}` : ''}`);
  }
  return response.json();
}

function normalizeRequiredChecks(value) {
  if (!Array.isArray(value) || value.length === 0) throw new Error('requiredChecks must be a non-empty array');
  const checks = value.map(item => normalizeToken(item, 'required check'));
  if (new Set(checks).size !== checks.length) throw new Error('requiredChecks must not contain duplicates');
  return Object.freeze(checks);
}

function normalizeRepository(value) {
  const token = normalizeToken(value, 'repository');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(token)) throw new Error('repository must be owner/name');
  return token;
}

function normalizeToken(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

async function main() {
  const evidenceOut = process.env.EVIDENCE_OUT?.trim() || null;
  const result = await verifyGithubMainProtection({
    repository: process.env.GITHUB_REPOSITORY || 'giltik123/bers23',
    branch: process.env.GITHUB_BRANCH || 'main',
    token: process.env.GITHUB_TOKEN,
  });
  const evidence = Object.freeze({
    schemaVersion: 1,
    kind: 'BERS_V1_GITHUB_MAIN_PROTECTION_EVIDENCE',
    verifiedAt: new Date().toISOString(),
    ...result,
  });
  if (evidenceOut) {
    await mkdir(dirname(evidenceOut), { recursive: true });
    await writeFile(evidenceOut, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  }
  console.log(JSON.stringify({
    status: 'PASS',
    repository: result.repository,
    branch: result.branch,
    mode: result.mode,
    requiredChecks: result.requiredChecks,
    evidenceOut,
  }));
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
