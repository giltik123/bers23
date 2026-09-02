#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { productionBrowserMetaCsp } from '../config/frontendSecurityPolicy.mjs';

const EXPECTED_ORT_WEB_VERSION = '1.27.0';
const ORT_ENV_SOURCE = Object.freeze({
  ref: 'v1.27.0',
  path: 'js/common/lib/env.ts',
  blobSha: 'd41e0936f7fac6218ffb6ff74287fd09a66cc9d5',
});
const ORT_WASM_FACTORY_SOURCE = Object.freeze({
  ref: 'v1.27.0',
  path: 'js/web/lib/wasm/wasm-factory.ts',
  blobSha: 'e365be86e14e09ac0261074046c19bbdb6a9c22d',
});
const PUBLIC_WASM_FLAGS = Object.freeze(['numThreads', 'simd', 'trace', 'initTimeout', 'wasmPaths', 'wasmBinary', 'proxy']);

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const reportPath = args.get('--report');
if (!reportPath) throw new Error('--report is required');

const packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8'));
const installedPackageJson = JSON.parse(await readFile(resolve('node_modules/onnxruntime-web/package.json'), 'utf8'));
const factory = await readFile(resolve('src/platform/creative/local-ai/browser/BrowserOnnxSessionFactory.ts'), 'utf8');
const vite = await readFile(resolve('vite.config.js'), 'utf8');
const cspPolicySource = await readFile(resolve('config/frontendSecurityPolicy.mjs'), 'utf8');
const browserMetaCsp = productionBrowserMetaCsp('/api/core');

assert.equal(packageJson.dependencies?.['onnxruntime-web'], EXPECTED_ORT_WEB_VERSION, 'package.json must pin onnxruntime-web exactly');
assert.equal(installedPackageJson.version, EXPECTED_ORT_WEB_VERSION, 'installed onnxruntime-web version changed');
assert.match(factory, /BROWSER_WASM_NUM_THREADS = 1/);
assert.match(factory, /BROWSER_WASM_PROXY = false/);
assert.match(factory, /BROWSER_WASM_WORKER_POLICY = 'DISABLED_PENDING_SEPARATE_SECURITY_REVIEW'/);
assert.doesNotMatch(factory, /new Worker\s*\(/);
assert.doesNotMatch(factory, /trustedTypes\.createPolicy|createPolicy\s*\(/);

// The browser CSP is now a shared deployment contract rather than Vite-local text.
// Prove both the effective policy and that Vite consumes that exact source of truth.
assert.match(browserMetaCsp, /(?:^|;)\s*worker-src 'self' blob:(?:;|$)/);
assert.match(browserMetaCsp, /(?:^|;)\s*require-trusted-types-for 'script'(?:;|$)/);
assert.match(browserMetaCsp, /(?:^|;)\s*trusted-types 'none'(?:;|$)/);
assert.match(vite, /from '\.\/config\/frontendSecurityPolicy\.mjs'/);
assert.match(vite, /productionBrowserMetaCsp\(env\.VITE_CORE_API_URL\)/);
assert.doesNotMatch(vite, /worker-src\s+/);

const sourceDigest = (source) => createHash('sha256').update(source).digest('hex');
const report = {
  schemaVersion: 1,
  status: 'CANDIDATE',
  stage: 'D4_SECURE_THREADING_CLASSIFICATION',
  result: 'SECURE_THREADING_BLOCKED',
  onnxRuntimeWeb: {
    version: EXPECTED_ORT_WEB_VERSION,
    packageDependency: packageJson.dependencies['onnxruntime-web'],
    installedVersion: installedPackageJson.version,
    publicWasmFlags: PUBLIC_WASM_FLAGS,
    workerFactoryOrWorkerUrlHookInPinnedPublicApi: false,
    pinnedSources: {
      env: ORT_ENV_SOURCE,
      wasmFactory: ORT_WASM_FACTORY_SOURCE,
    },
    reviewedContracts: [
      'Env.WebAssemblyFlags exposes numThreads/wasmPaths/wasmBinary/proxy but no worker factory or worker URL callback.',
      'Pinned wasm-factory documents numThreads=1 as worker-free and passes numThreads to the Emscripten module; multi-thread mode creates numThreads-1 workers.',
    ],
  },
  productionBoundary: {
    numThreads: 1,
    proxy: false,
    workerPolicy: 'DISABLED_PENDING_SEPARATE_SECURITY_REVIEW',
    factorySourceSha256: sourceDigest(factory),
    cspSourceSha256: sourceDigest(cspPolicySource),
    viteIntegrationSourceSha256: sourceDigest(vite),
    csp: {
      workerSrc: "'self' blob:",
      requireTrustedTypesForScript: true,
      trustedTypesPolicyAllowlist: 'none',
    },
  },
  reasons: [
    'ORT_WEB_1_27_PUBLIC_API_HAS_NO_REVIEWED_WORKER_FACTORY_HOOK',
    'PRODUCTION_TRUSTED_TYPES_POLICY_ALLOWS_NO_POLICY_CREATION',
    'D4_FORBIDS_GLOBAL_WORKER_MONKEY_PATCH_OR_PERMISSIVE_DEFAULT_TRUSTED_TYPES_POLICY',
    'MULTITHREADING_WOULD_EXPAND_THE_CURRENT_SCRIPT_WORKER_TRUST_BOUNDARY',
  ],
  rejectedApproaches: [
    'GLOBAL_WORKER_MONKEY_PATCH',
    'PERMISSIVE_TRUSTED_TYPES_POLICY',
    'DEFAULT_TRUSTED_TYPES_POLICY',
    'CDN_WORKER_OR_RUNTIME_FALLBACK',
    'ARBITRARY_WORKER_URL_OR_BLOB_SCRIPT_SOURCE',
  ],
  acceptedBaseline: {
    numThreads: 1,
    proxy: false,
    workerFree: true,
  },
  benchmarkRequiredForBlockedCandidate: false,
  reasonBenchmarkNotRun: 'No security-admissible multithread candidate exists under the pinned public API and current CSP/Trusted Types boundary.',
  runtimeAuthorityGranted: false,
  productionApproval: false,
  editorAuthorityGranted: false,
};

await mkdir(dirname(resolve(reportPath)), { recursive: true });
await writeFile(resolve(reportPath), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`TINY-SD D4 SECURE THREADING: ${report.result}`);
