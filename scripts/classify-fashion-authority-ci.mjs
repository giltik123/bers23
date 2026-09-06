import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const RELEVANT_CLASSIFICATION = 'RELEVANT_FASHION_AUTHORITY_ACCEPTANCE_REQUIRED';
export const NOT_APPLICABLE_CLASSIFICATION = 'NOT_APPLICABLE_NON_FASHION_CHANGE';

export const FASHION_AUTHORITY_PROFILES = Object.freeze({
  F3C_CANONICAL_OUTFIT_UI: 'F3C_CANONICAL_OUTFIT_UI',
});

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

const F3C_MANIFEST_NAME = 'f3c-canonical-outfit-ui-ci-closure.json';
const F3C_EXPECTED_BUNDLE_INPUTS = 11;
const F3C_EXPECTED_SUPPORT_PATHS = 19;
const F3C_CONTROL_PATHS = Object.freeze([
  '.github/workflows/fashion-authority-ci-policy.yml',
  'scripts/classify-fashion-authority-ci.mjs',
  `scripts/${F3C_MANIFEST_NAME}`,
  'tests/fashion-f3c-ci-relevance.test.mjs',
  'tests/fashion-authority-ci-relevance.test.mjs',
  'tests/fashion-authority-ci-workflow-trust.test.mjs',
]);

let f3cRelevantPathsCache;

function normalizeRepoPath(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .replace(/^\/+/, '');
}

function isExactManifestPath(value) {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (normalizeRepoPath(value) !== value) return false;
  if (value.split('/').includes('..')) return false;
  if (/[*?{}[\]]/.test(value)) return false;
  return true;
}

function validateExactPathArray(value, label, expectedCount) {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  if (value.length !== expectedCount) {
    throw new Error(`${label} must contain exactly ${expectedCount} paths; got ${value.length}`);
  }
  const unique = new Set();
  for (const path of value) {
    if (!isExactManifestPath(path)) throw new Error(`${label} contains invalid exact path: ${String(path)}`);
    if (unique.has(path)) throw new Error(`${label} contains duplicate path: ${path}`);
    unique.add(path);
  }
  return unique;
}

function loadF3cRelevantPaths() {
  if (f3cRelevantPathsCache) return f3cRelevantPathsCache;

  const manifestPath = fileURLToPath(new URL(`./${F3C_MANIFEST_NAME}`, import.meta.url));
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Unable to load adjacent F3c CI closure manifest: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (manifest?.schemaVersion !== 1) throw new Error('F3c CI closure manifest schemaVersion must be 1');
  if (manifest?.profile !== FASHION_AUTHORITY_PROFILES.F3C_CANONICAL_OUTFIT_UI) {
    throw new Error('F3c CI closure manifest profile identity mismatch');
  }

  const bundleInputs = validateExactPathArray(
    manifest.bundleInputs,
    'F3c bundleInputs',
    F3C_EXPECTED_BUNDLE_INPUTS,
  );
  const supportPaths = validateExactPathArray(
    manifest.supportPaths,
    'F3c supportPaths',
    F3C_EXPECTED_SUPPORT_PATHS,
  );

  for (const path of bundleInputs) {
    if (supportPaths.has(path)) throw new Error(`F3c closure path appears in both bundleInputs and supportPaths: ${path}`);
  }

  f3cRelevantPathsCache = new Set([
    ...bundleInputs,
    ...supportPaths,
    ...F3C_CONTROL_PATHS,
  ]);
  return f3cRelevantPathsCache;
}

function assertKnownProfile(profile) {
  if (profile === null || profile === undefined) return null;
  if (profile === FASHION_AUTHORITY_PROFILES.F3C_CANONICAL_OUTFIT_UI) return profile;
  throw new Error(`Unknown Fashion authority CI profile: ${String(profile)}`);
}

function isLegacyFashionAuthorityCiRelevant(normalized) {
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

export function isFashionAuthorityCiRelevant(filePath, profile = null) {
  const normalized = normalizeRepoPath(filePath);
  const selectedProfile = assertKnownProfile(profile);
  if (!selectedProfile) return isLegacyFashionAuthorityCiRelevant(normalized);
  if (!normalized) return false;
  return loadF3cRelevantPaths().has(normalized);
}

export function classifyFashionAuthorityCi(paths, profile = null) {
  const selectedProfile = assertKnownProfile(profile);
  const normalizedPaths = [...new Set(paths.map(normalizeRepoPath).filter(Boolean))];
  const matchedPaths = normalizedPaths.filter(path => isFashionAuthorityCiRelevant(path, selectedProfile));
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
  const profileIndex = argv.indexOf('--profile');
  const profile = profileIndex >= 0 ? argv[profileIndex + 1] : null;
  const stdin0 = argv.includes('--stdin0');

  if (githubOutputIndex >= 0 && !githubOutput) throw new Error('--github-output requires a path');
  if (profileIndex >= 0 && !profile) throw new Error('--profile requires a value');
  if (argv.indexOf('--profile', profileIndex + 1) >= 0) throw new Error('--profile may be specified only once');
  if (!stdin0) throw new Error('Only --stdin0 input is supported; changed paths must be NUL-delimited');
  return { githubOutput, profile: assertKnownProfile(profile) };
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
    const { githubOutput, profile } = parseCli(process.argv.slice(2));
    const result = classifyFashionAuthorityCi(readNullDelimitedInput(fs.readFileSync(0)), profile);
    writeGithubOutputs(githubOutput, result);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
