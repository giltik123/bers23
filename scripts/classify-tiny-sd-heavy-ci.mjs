import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RELEVANT_CLASSIFICATION = 'RELEVANT_HEAVY_ACCEPTANCE_REQUIRED';
export const NOT_APPLICABLE_CLASSIFICATION = 'NOT_APPLICABLE_PRODUCT_ONLY_CHANGE';

const EXACT_RELEVANT_PATHS = new Set([
  '.github/workflows/sprint-6.42d1-tiny-sd-acquisition.yml',
  '.github/workflows/sprint-6.42d2-tiny-sd-components.yml',
  '.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
  '.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml',
  '.github/workflows/tiny-sd-d3-wasm-d2-prep.yml',
  '.github/workflows/tiny-sd-d3-wasm-strategy-phase.yml',
  '.github/workflows/tiny-sd-d3-wasm-browser-phase.yml',
  '.github/workflows/sprint-6.42d4-ort-conversion-smoke.yml',
  '.github/workflows/sprint-6.42d4-secure-threading.yml',
  '.github/workflows/sprint-6.42d4-tiny-sd-ort-memory.yml',
  '.github/workflows/sprint-6.42d5-tiny-sd-pipeline.yml',
  '.github/workflows/sprint-6.42d6-tiny-sd-accelerated-admission.yml',
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

const invokedAsCli = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedAsCli) {
  try {
    const { githubOutput } = parseCli(process.argv.slice(2));
    const result = classifyTinySdHeavyCi(readNullDelimitedInput(fs.readFileSync(0)));
    writeGithubOutputs(githubOutput, result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
