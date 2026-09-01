import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const RELEVANT_CLASSIFICATION = 'RELEVANT_HEAVY_ACCEPTANCE_REQUIRED';
export const NOT_APPLICABLE_CLASSIFICATION = 'NOT_APPLICABLE_PRODUCT_ONLY_CHANGE';

const CLASSIFIER_REPO_PATH = 'scripts/classify-tiny-sd-heavy-ci.mjs';
const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/;
const MAX_TRUSTED_CLASSIFIER_BYTES = 1024 * 1024;

const EXACT_RELEVANT_PATHS = new Set([
  '.github/workflows/sprint-6.42d1-tiny-sd-acquisition.yml',
  '.github/workflows/sprint-6.42d2-tiny-sd-components.yml',
  '.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
  '.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml',
  '.github/workflows/sprint-6.42d4-ort-conversion-smoke.yml',
  '.github/workflows/sprint-6.42d4-secure-threading.yml',
  '.github/workflows/sprint-6.42d4-tiny-sd-ort-memory.yml',
  '.github/workflows/sprint-6.42d5-tiny-sd-pipeline.yml',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.npmrc',
  'scripts/check-model-weight-tracking.mjs',
]);

function normalizeRepoPath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '');
}

export function isTinySdHeavyCiRelevant(filePath) {
  const normalized = normalizeRepoPath(filePath);
  if (!normalized) return false;

  if (EXACT_RELEVANT_PATHS.has(normalized)) return true;

  if (normalized.startsWith('src/platform/creative/local-ai/')) return true;

  if (normalized.startsWith('scripts/') || normalized.startsWith('tests/')) {
    const lower = normalized.toLowerCase();
    if (lower.includes('tiny-sd') || lower.includes('tiny_sd')) return true;
  }

  return false;
}

export function classifyTinySdHeavyCi(paths) {
  const normalizedPaths = [...new Set(paths.map(normalizeRepoPath).filter(Boolean))];
  const matchedPaths = normalizedPaths.filter(isTinySdHeavyCiRelevant);
  const relevant = matchedPaths.length > 0;

  return Object.freeze({
    relevant,
    classification: relevant ? RELEVANT_CLASSIFICATION : NOT_APPLICABLE_CLASSIFICATION,
    changedPathCount: normalizedPaths.length,
    matchedPaths: Object.freeze(matchedPaths),
  });
}

function parseCli(argv) {
  const githubOutputIndex = argv.indexOf('--github-output');
  const githubOutput = githubOutputIndex >= 0 ? argv[githubOutputIndex + 1] : null;
  const stdin0 = argv.includes('--stdin0');

  if (githubOutputIndex >= 0 && !githubOutput) {
    throw new Error('--github-output requires a path');
  }
  if (!stdin0) {
    throw new Error('Only --stdin0 input is supported; changed paths must be NUL-delimited');
  }

  return { githubOutput };
}

function readNullDelimitedInput(input) {
  if (input.length === 0) return [];
  return input
    .toString('utf8')
    .split('\0')
    .filter(Boolean);
}

function writeGithubOutputs(outputPath, result) {
  if (!outputPath) return;
  fs.appendFileSync(
    outputPath,
    [
      `relevant=${result.relevant ? 'true' : 'false'}`,
      `classification=${result.classification}`,
      `matched_count=${result.matchedPaths.length}`,
      '',
    ].join('\n'),
    'utf8',
  );
}

function trustedBaseSha() {
  const baseSha = String(process.env.BASE_SHA ?? '').trim().toLowerCase();
  if (!COMMIT_SHA_PATTERN.test(baseSha)) {
    throw new Error('GitHub heavyweight classification requires an exact 40-hex BASE_SHA');
  }
  return baseSha;
}

function runTrustedBaseClassifier(argv, stdin) {
  const baseSha = trustedBaseSha();
  let source;
  try {
    source = execFileSync('git', ['show', `${baseSha}:${CLASSIFIER_REPO_PATH}`], {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: MAX_TRUSTED_CLASSIFIER_BYTES,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    throw new Error(`Unable to materialize trusted base Tiny-SD classifier at ${baseSha}`, { cause: error });
  }
  if (!source || Buffer.byteLength(source, 'utf8') > MAX_TRUSTED_CLASSIFIER_BYTES) {
    throw new Error('Trusted base Tiny-SD classifier is missing or outside the bounded source contract');
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bers-tiny-sd-classifier-'));
  const trustedPath = path.join(tempDir, 'classifier.mjs');
  try {
    fs.writeFileSync(trustedPath, source, { encoding: 'utf8', mode: 0o600 });
    const child = spawnSync(process.execPath, [trustedPath, ...argv], {
      cwd: process.cwd(),
      input: stdin,
      // The child is the exact materialized base blob. Force it into its pure local
      // classification path instead of using a writable recursion marker that PR code
      // could forge through GITHUB_ENV.
      env: { ...process.env, GITHUB_ACTIONS: 'false' },
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024,
    });
    if (child.stdout) process.stdout.write(child.stdout);
    if (child.stderr) process.stderr.write(child.stderr);
    if (child.error) throw child.error;
    if (child.signal) throw new Error(`Trusted base Tiny-SD classifier terminated by ${child.signal}`);
    if (child.status !== 0) throw new Error(`Trusted base Tiny-SD classifier exited with status ${child.status}`);
    process.stdout.write(`trusted_base_classifier_sha=${baseSha}\n`);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

const invokedAsCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedAsCli) {
  try {
    const argv = process.argv.slice(2);
    const stdin = fs.readFileSync(0);
    if (process.env.GITHUB_ACTIONS === 'true') {
      runTrustedBaseClassifier(argv, stdin);
    } else {
      const { githubOutput } = parseCli(argv);
      const result = classifyTinySdHeavyCi(readNullDelimitedInput(stdin));
      writeGithubOutputs(githubOutput, result);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
