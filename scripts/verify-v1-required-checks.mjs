import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import { REQUIRED_V1_MAIN_CHECKS } from './verify-github-main-protection.mjs';

const EXACT_SHA_RE = /^[0-9a-f]{40}$/u;
const API_VERSION = '2026-03-10';

export async function verifyV1RequiredChecks(input = {}) {
  const repository = normalizeRepository(input.repository ?? 'giltik123/bers23');
  const sha = normalizeSha(input.sha);
  const token = normalizeToken(input.token, 'GITHUB_TOKEN');
  const fetcher = input.fetcher ?? globalThis.fetch;
  const requiredChecks = Object.freeze([...(input.requiredChecks ?? REQUIRED_V1_MAIN_CHECKS)]);

  if (typeof fetcher !== 'function') throw new Error('required-check verifier requires fetch');
  if (requiredChecks.length === 0) throw new Error('requiredChecks must not be empty');

  const runs = [];
  let expectedTotal = null;
  for (let page = 1; page <= 20; page += 1) {
    const url = `https://api.github.com/repos/${repository}/commits/${sha}/check-runs?per_page=100&filter=latest&page=${page}`;
    const response = await fetcher(url, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': 'bers-v1-release-check-verifier',
      },
      redirect: 'error',
    });
    if (!response || typeof response.status !== 'number') {
      throw new Error('GitHub check-runs verifier received an invalid response');
    }
    if (response.status < 200 || response.status >= 300) {
      const body = await response.text().catch(() => '');
      throw new Error(`GitHub API ${response.status} while reading exact-SHA check runs${body ? `: ${body.slice(0, 240)}` : ''}`);
    }

    const payload = await response.json();
    const batch = Array.isArray(payload?.check_runs) ? payload.check_runs : [];
    if (expectedTotal === null && Number.isSafeInteger(payload?.total_count) && payload.total_count >= 0) {
      expectedTotal = payload.total_count;
    }
    runs.push(...batch);

    if (batch.length < 100) break;
    if (expectedTotal !== null && runs.length >= expectedTotal) break;
    if (page === 20) throw new Error('exact-SHA check-run pagination exceeded 20 pages');
  }
  const observed = new Map();
  for (const run of runs) {
    if (typeof run?.name !== 'string') continue;
    if (!observed.has(run.name)) observed.set(run.name, []);
    observed.get(run.name).push(Object.freeze({
      id: run.id ?? null,
      status: run.status ?? null,
      conclusion: run.conclusion ?? null,
      detailsUrl: run.details_url ?? null,
      headSha: run.head_sha ?? null,
    }));
  }

  const checks = {};
  const failures = [];
  for (const name of requiredChecks) {
    const candidates = observed.get(name) ?? [];
    const success = candidates.find(run =>
      run.headSha === sha &&
      run.status === 'completed' &&
      run.conclusion === 'success'
    );
    if (!success) {
      failures.push(name);
      checks[name] = Object.freeze({
        status: 'MISSING_OR_NOT_SUCCESSFUL',
        observed: Object.freeze(candidates),
      });
    } else {
      checks[name] = Object.freeze({
        status: 'SUCCESS',
        run: success,
      });
    }
  }

  if (failures.length) {
    throw new Error(`exact release SHA is missing successful required checks: ${failures.join(', ')}`);
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: 'BERS_V1_REQUIRED_CHECKS_EVIDENCE',
    repository,
    sha,
    requiredChecks,
    checks: Object.freeze(checks),
  });
}

function normalizeRepository(value) {
  const token = normalizeToken(value, 'repository');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(token)) {
    throw new Error('repository must be owner/name');
  }
  return token;
}

function normalizeSha(value) {
  const token = normalizeToken(value, 'RELEASE_SHA');
  if (!EXACT_SHA_RE.test(token)) {
    throw new Error('RELEASE_SHA must be one exact lowercase 40-character Git SHA');
  }
  return token;
}

function normalizeToken(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

async function main() {
  try {
    const evidence = await verifyV1RequiredChecks({
      repository: process.env.GITHUB_REPOSITORY || 'giltik123/bers23',
      sha: process.env.RELEASE_SHA,
      token: process.env.GITHUB_TOKEN,
    });
    const out = process.env.EVIDENCE_OUT?.trim() || null;
    if (out) {
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, `${JSON.stringify(evidence, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
    }
    console.log('BERS_V1_REQUIRED_CHECKS_PASS', JSON.stringify({
      repository: evidence.repository,
      sha: evidence.sha,
      requiredChecks: evidence.requiredChecks,
      evidenceOut: out,
    }));
  } catch (error) {
    console.error(
      'BERS_V1_REQUIRED_CHECKS_INVALID',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) await main();
