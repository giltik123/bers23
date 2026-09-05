import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RELEVANT_CLASSIFICATION = 'RELEVANT_FASHION_AUTHORITY_ACCEPTANCE_REQUIRED';
export const NOT_APPLICABLE_CLASSIFICATION = 'NOT_APPLICABLE_NON_FASHION_CHANGE';

const EXACT_RELEVANT_PATHS = new Set([
  '.github/workflows/managed-garment-f1a.yml',
  '.github/workflows/managed-garment-f1b.yml',
  '.github/workflows/managed-wardrobe-f2a.yml',
  '.github/workflows/managed-wardrobe-f2b.yml',
  '.github/workflows/managed-outfits-f3a.yml',
  '.github/workflows/managed-garment-representations-f4a.yml',
  '.github/workflows/managed-garment-glb-f4a1.yml',
  '.github/workflows/fashion-authority-ci-policy.yml',
  'scripts/classify-fashion-authority-ci.mjs',
  'tests/fashion-authority-ci-relevance.test.mjs',
  'tests/editor-zero-object-navigation.test.mjs',
  'package.json',
  'package-lock.json',
  'npm-shrinkwrap.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  '.npmrc',
  'server/tsconfig.json',
  'scripts/build-core-server.mjs',
  'server/core/http/browserSessionCookie.ts',
  'server/core/http/requestTarget.ts',
  'src/pages/Editor.jsx',
  'src/components/editor/fashion/FashionPanel.jsx',
  'src/components/editor/outfits/OutfitPanel.jsx',
  'src/components/editor/creative/CreativeStudioPanel.jsx',
  'src/components/editor/agent/AgentPanel.jsx',
  'src/components/editor/outfits/TryOnPanel.jsx',
]);

const MANAGED_FASHION_HTTP_PREFIXES = Object.freeze([
  'server/core/http/managedGarment',
  'server/core/http/managedWardrobe',
  'server/core/http/managedOutfit',
]);

function normalizeRepoPath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '');
}

export function isFashionAuthorityCiRelevant(filePath) {
  const normalized = normalizeRepoPath(filePath);
  if (!normalized) return false;

  if (EXACT_RELEVANT_PATHS.has(normalized)) return true;

  // Runtime/data authority owned by the F1-F4a representation acceptance chain.
  if (normalized.startsWith('server/core/fashion/')) return true;
  if (MANAGED_FASHION_HTTP_PREFIXES.some(prefix => normalized.startsWith(prefix))) return true;

  // Generic Core typecheck/build remains owned by broad Node/Core CI. Pulling all
  // server/** or src/platform/** here would recreate the unrelated fanout #429
  // is removing, while adding no Fashion-specific semantic coverage.
  if (normalized.startsWith('tests/')) {
    const lower = normalized.toLowerCase();
    if (
      lower.includes('managed-garment') ||
      lower.includes('managed-wardrobe') ||
      lower.includes('managed-outfit')
    ) return true;
  }

  return false;
}

export function classifyFashionAuthorityCi(paths) {
  const normalizedPaths = [...new Set(paths.map(normalizeRepoPath).filter(Boolean))];
  const matchedPaths = normalizedPaths.filter(isFashionAuthorityCiRelevant);
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

  if (githubOutputIndex >= 0 && !githubOutput) throw new Error('--github-output requires a path');
  if (!stdin0) throw new Error('Only --stdin0 input is supported; changed paths must be NUL-delimited');
  return { githubOutput };
}

function readNullDelimitedInput(input) {
  if (input.length === 0) return [];
  return input.toString('utf8').split('\0').filter(Boolean);
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
    const result = classifyFashionAuthorityCi(readNullDelimitedInput(fs.readFileSync(0)));
    writeGithubOutputs(githubOutput, result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
